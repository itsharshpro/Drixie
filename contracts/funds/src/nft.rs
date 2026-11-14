use near_contract_standards::non_fungible_token::core::{ext_nft_receiver, NonFungibleTokenCore, NonFungibleTokenResolver};
use near_contract_standards::non_fungible_token::enumeration::NonFungibleTokenEnumeration;
use near_contract_standards::non_fungible_token::events::{NftMint, NftTransfer};
use near_contract_standards::non_fungible_token::metadata::{NFTContractMetadata, TokenMetadata, NFT_METADATA_SPEC};
use near_contract_standards::non_fungible_token::{Token, TokenId};
use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::{assert_one_yocto, env, near, require, AccountId, Gas, PromiseOrValue};
use std::collections::HashMap;

use crate::rules::{weights_text, ONE_NEAR};
use crate::types::{Fund, SeatAuction};
use crate::{events, Contract, ContractExt};

pub const MIN_SEAT_BID: u128 = ONE_NEAR / 10;

pub const MIN_INCREMENT_BPS: u128 = 500;
const GAS_FOR_RESOLVE_TRANSFER: Gas = Gas::from_tgas(15);
const GAS_FOR_NFT_TRANSFER_CALL: Gas = Gas::from_tgas(45);

pub fn seat_id(fund: &str) -> String {
    format!("seat:{fund}")
}

pub fn min_next_bid(highest: u128) -> u128 {
    if highest == 0 {
        MIN_SEAT_BID
    } else {
        highest + (highest * MIN_INCREMENT_BPS / 10_000).max(1)
    }
}

#[near(serializers = [json])]
pub struct AuctionView {
    pub fund: String,
    pub highest_bid: U128,
    pub highest_bidder: Option<AccountId>,
    pub min_next_bid: U128,
    pub started_at_ns: U64,
    pub ends_at_ns: U64,
    pub settled: bool,
    pub proceeds_to_vault: bool,
}

impl Contract {
    fn mint(&mut self, token_id: String, owner: AccountId, metadata: TokenMetadata) {
        self.nft.internal_mint_with_refund(token_id.clone(), owner.clone(), Some(metadata), None);
        NftMint { owner_id: &owner, token_ids: &[&token_id], memo: None }.emit();
    }

    fn media(&self, path: String) -> Option<String> {
        (!self.media_base.is_empty()).then(|| format!("{}/{}", self.media_base.trim_end_matches('/'), path))
    }

    fn now_ms(&self) -> Option<String> {
        Some((env::block_timestamp() / 1_000_000).to_string())
    }

    pub(crate) fn mint_seat(&mut self, fund: &str) {
        let f = self.fund(fund);
        let meta = TokenMetadata {
            title: Some(format!("{} manager seat", f.name)),
            description: Some(format!("Earns 30% of fees on user capital in {}.", f.name)),
            media: self.media(format!("seat/{fund}.svg")),
            issued_at: self.now_ms(),
            extra: Some(json!({ "kind": "seat", "fund": fund }).to_string()),
            ..empty_meta()
        };
        self.mint(seat_id(fund), env::current_account_id(), meta);
    }

    pub(crate) fn mint_card(&mut self, f: &Fund, edition: u32, bell: u64) {
        let meta = TokenMetadata {
            title: Some(format!("{} basket #{edition}", f.name)),
            description: Some(format!("{} holdings after bell {bell}.", f.name)),
            media: self.media(format!("basket/{}/{edition}.svg", f.id)),
            issued_at: self.now_ms(),
            extra: Some(
                json!({
                    "kind": "card", "fund": f.id, "edition": edition, "bell": bell, "nav": f.nav.to_string(),
                    "prices_hash": self.last_prices_hash, "cash_bps": f.cash_bps, "weights": weights_text(&f.weights),
                })
                .to_string(),
            ),
            ..empty_meta()
        };
        self.mint(format!("card:{}:{edition}", f.id), f.manager.clone(), meta);
    }

    pub(crate) fn mint_trophy(&mut self, season: u64, f: &Fund) -> (String, String) {
        let id = format!("trophy:{season}");
        let owner = self.nft.owner_by_id.get(&seat_id(&f.id)).unwrap_or_else(|| f.manager.clone());
        let meta = TokenMetadata {
            title: Some(format!("Manager of the Year: Season {}", season + 1)),
            description: Some(format!("{} won season {}.", f.name, season + 1)),
            media: self.media(format!("trophy/{season}.svg")),
            issued_at: self.now_ms(),
            extra: Some(json!({ "kind": "trophy", "fund": f.id, "season": season }).to_string()),
            ..empty_meta()
        };
        self.mint(id.clone(), owner, meta);
        (f.id.clone(), id)
    }

    pub(crate) fn start_auction(&mut self, fund: &str, proceeds_to_vault: bool) {
        let now = env::block_timestamp();
        let ends = now + self.clock.auction_secs * 1_000_000_000;
        self.auctions.insert(
            fund.to_string(),
            SeatAuction {
                fund: fund.to_string(),
                highest_bid: 0,
                highest_bidder: None,
                started_at_ns: now,
                ends_at_ns: ends,
                settled: false,
                proceeds_to_vault,
            },
        );
        events::emit(
            "seat_auction_started",
            json!({ "fund": fund, "token_id": seat_id(fund), "ends_at_ns": U64(ends), "proceeds_to_vault": proceeds_to_vault }),
        );
    }

    fn assert_transferable(&self, token_id: &str) {
        require!(!token_id.starts_with("badge:"), "nft: badges are soulbound");
        if let Some(fund) = token_id.strip_prefix("seat:") {
            require!(
                self.auctions.get(fund).is_none_or(|a| a.settled),
                "nft: this seat is frozen while its auction runs"
            );
        }
    }
}

fn empty_meta() -> TokenMetadata {
    TokenMetadata {
        title: None,
        description: None,
        media: None,
        media_hash: None,
        copies: None,
        issued_at: None,
        expires_at: None,
        starts_at: None,
        updated_at: None,
        extra: None,
        reference: None,
        reference_hash: None,
    }
}

#[near]
impl Contract {

    #[payable]
    pub fn bid_seat(&mut self, fund: String) {
        self.assert_not_paused();
        let mut a = self.auctions.get(&fund).cloned().unwrap_or_else(|| env::panic_str("auction: no auction for this seat"));
        let now = env::block_timestamp();
        require!(!a.settled && now < a.ends_at_ns, "auction: bidding has closed");
        let amount = env::attached_deposit().as_yoctonear();
        let min = min_next_bid(a.highest_bid);
        require!(amount >= min, format!("auction: bid at least {min} yoctoNEAR"));
        let bidder = env::predecessor_account_id();
        if let Some(prev) = a.highest_bidder.take() {
            self.pay(&prev, a.highest_bid);
        }
        a.highest_bid = amount;
        a.highest_bidder = Some(bidder.clone());
        let extension = (a.ends_at_ns.saturating_sub(a.started_at_ns) / 10).max(1);
        if a.ends_at_ns.saturating_sub(now) < extension {
            a.ends_at_ns = now + extension;
        }
        let ends = a.ends_at_ns;
        self.auctions.insert(fund.clone(), a);
        events::emit("seat_bid", json!({ "fund": fund, "bidder": bidder, "near": U128(amount), "ends_at_ns": U64(ends) }));
    }

    pub fn settle_seat_auction(&mut self, fund: String) {
        let mut a = self.auctions.get(&fund).cloned().unwrap_or_else(|| env::panic_str("auction: no auction for this seat"));
        require!(!a.settled, "auction: already settled");
        require!(env::block_timestamp() >= a.ends_at_ns, format!("auction: bidding runs until {} ns", a.ends_at_ns));
        a.settled = true;
        self.auctions.insert(fund.clone(), a.clone());
        let token = seat_id(&fund);
        let owner = self.nft.owner_by_id.get(&token).unwrap_or_else(|| env::panic_str("auction: seat missing"));
        if let Some(winner) = a.highest_bidder.as_ref() {
            if *winner != owner {
                self.nft.internal_transfer_unguarded(&token, &owner, winner);
                NftTransfer {
                    old_owner_id: &owner,
                    new_owner_id: winner,
                    token_ids: &[&token],
                    authorized_id: None,
                    memo: Some("seat auction"),
                }
                .emit();
            }
            if a.proceeds_to_vault {
                let mut f = self.fund(&fund);
                f.vault += a.highest_bid;
                self.save(f);
            } else {
                self.protocol_fees += a.highest_bid;
            }
        }
        events::emit(
            "seat_won",
            json!({ "fund": fund, "token_id": token, "winner": a.highest_bidder, "near": U128(a.highest_bid),
                    "proceeds_to_vault": a.proceeds_to_vault }),
        );
    }

    pub fn start_seat_auction(&mut self, fund: String) {
        self.assert_owner();
        let f = self.fund(&fund);
        require!(self.auctions.get(&fund).is_none_or(|a| a.settled), "auction: one is already running");
        self.start_auction(&fund, f.status == crate::types::FundStatus::Retired);
    }

    pub fn get_seat_auction(&self, fund: String) -> Option<AuctionView> {
        self.auctions.get(&fund).map(|a| AuctionView {
            fund: a.fund.clone(),
            highest_bid: U128(a.highest_bid),
            highest_bidder: a.highest_bidder.clone(),
            min_next_bid: U128(min_next_bid(a.highest_bid)),
            started_at_ns: U64(a.started_at_ns),
            ends_at_ns: U64(a.ends_at_ns),
            settled: a.settled,
            proceeds_to_vault: a.proceeds_to_vault,
        })
    }

    pub fn mint_badge(&mut self, account: AccountId, kind: String, fund: Option<String>, season: Option<u64>) -> String {
        self.assert_operator();
        require!(
            !kind.is_empty() && kind.len() <= 32 && kind.bytes().all(|c| c.is_ascii_lowercase() || c == b'_'),
            "badge: kind must be 1-32 chars of a-z and _"
        );
        if let Some(f) = &fund {
            self.fund(f);
        }
        let key = format!("{kind}|{}|{}|{account}", fund.as_deref().unwrap_or(""), season.map(|s| s.to_string()).unwrap_or_default());
        require!(self.badges_seen.insert(key), "badge: already minted");
        self.badge_count += 1;
        let id = format!("badge:{}", self.badge_count);
        let meta = TokenMetadata {
            title: Some(kind.replace('_', " ")),
            description: Some("Drixie investor badge (soulbound).".to_string()),
            media: self.media(format!("badge/{kind}.svg")),
            issued_at: self.now_ms(),
            extra: Some(json!({ "kind": "badge", "badge": kind, "fund": fund, "season": season }).to_string()),
            ..empty_meta()
        };
        self.mint(id.clone(), account.clone(), meta);
        events::emit("badge_minted", json!({ "token_id": id, "account": account, "badge": kind, "fund": fund, "season": season }));
        id
    }

    #[payable]
    pub fn nft_transfer(&mut self, receiver_id: AccountId, token_id: TokenId, approval_id: Option<u64>, memo: Option<String>) {
        assert_one_yocto();
        self.assert_transferable(&token_id);
        self.nft.nft_transfer(receiver_id, token_id, approval_id, memo);
    }

    #[payable]
    pub fn nft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        token_id: TokenId,
        approval_id: Option<u64>,
        memo: Option<String>,
        msg: String,
    ) -> PromiseOrValue<bool> {
        assert_one_yocto();
        require!(env::prepaid_gas() >= GAS_FOR_NFT_TRANSFER_CALL, "nft: attach at least 45 TGas");
        self.assert_transferable(&token_id);
        let sender = env::predecessor_account_id();
        let (old_owner, old_approvals) = self.nft.internal_transfer(&sender, &receiver_id, &token_id, approval_id, memo);
        ext_nft_receiver::ext(receiver_id.clone())
            .with_unused_gas_weight(1)
            .nft_on_transfer(sender, old_owner.clone(), token_id.clone(), msg)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_RESOLVE_TRANSFER)
                    .with_unused_gas_weight(0)
                    .nft_resolve_transfer(old_owner, receiver_id, token_id, old_approvals),
            )
            .into()
    }

    #[private]
    pub fn nft_resolve_transfer(
        &mut self,
        previous_owner_id: AccountId,
        receiver_id: AccountId,
        token_id: TokenId,
        approved_account_ids: Option<HashMap<AccountId, u64>>,
    ) -> bool {
        self.nft.nft_resolve_transfer(previous_owner_id, receiver_id, token_id, approved_account_ids)
    }

    pub fn nft_token(&self, token_id: TokenId) -> Option<Token> {
        self.nft.nft_token(token_id)
    }

    pub fn nft_total_supply(&self) -> U128 {
        self.nft.nft_total_supply()
    }

    pub fn nft_tokens(&self, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.nft.nft_tokens(from_index, limit)
    }

    pub fn nft_supply_for_owner(&self, account_id: AccountId) -> U128 {
        self.nft.nft_supply_for_owner(account_id)
    }

    pub fn nft_tokens_for_owner(&self, account_id: AccountId, from_index: Option<U128>, limit: Option<u64>) -> Vec<Token> {
        self.nft.nft_tokens_for_owner(account_id, from_index, limit)
    }

    pub fn nft_metadata(&self) -> NFTContractMetadata {
        NFTContractMetadata {
            spec: NFT_METADATA_SPEC.to_string(),
            name: "Drixie funds".to_string(),
            symbol: "DRIXIE".to_string(),
            icon: None,
            base_uri: (!self.media_base.is_empty()).then(|| self.media_base.clone()),
            reference: None,
            reference_hash: None,
        }
    }
}
