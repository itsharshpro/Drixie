#![recursion_limit = "256"]

use near_contract_standards::non_fungible_token::NonFungibleToken;
use near_sdk::json_types::{U128, U64};
use near_sdk::store::{LookupMap, LookupSet, Vector};
use near_sdk::{env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise};

pub mod coins;
pub mod events;
pub mod manager;
pub mod nft;
pub mod oracle;
pub mod orders;
pub mod pool;
pub mod rules;
pub mod types;
pub mod views;

#[cfg(test)]
mod tests;

use rules::*;
use types::*;

pub const MIN_SUBSCRIBE_YOCTO: u128 = ONE_NEAR / 20;

pub const GAS_RESERVE: Gas = Gas::from_tgas(40);
const NS: u64 = 1_000_000_000;
const DAY_SECS: u64 = 86_400;

#[derive(BorshStorageKey)]
#[near]
pub(crate) enum StorageKey {
    Assets,
    Funds,
    Balances,
    Holders,
    Orders,
    Queues,
    AccountOrders,
    Cross,
    RepRoots,
    NftOwners,
    NftMetadata,
    NftEnumeration,
    Auctions,
    BadgesSeen,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    pub(crate) owner: AccountId,
    pub(crate) operator: AccountId,
    pub(crate) keeper: Option<AccountId>,
    pub(crate) game_usd_per_near: u64,
    pub(crate) clock: Clock,
    pub(crate) paused: bool,
    pub(crate) media_base: String,
    pub(crate) asset_ids: Vec<String>,
    pub(crate) assets: LookupMap<String, Asset>,
    pub(crate) fund_ids: Vec<String>,
    pub(crate) funds: LookupMap<String, Fund>,
    pub(crate) balances: LookupMap<(String, AccountId), Holding>,

    pub(crate) holders: Vector<(String, AccountId)>,
    pub(crate) orders: LookupMap<u64, Order>,
    pub(crate) next_order_id: u64,
    pub(crate) queues: LookupMap<String, Vec<u64>>,
    pub(crate) account_orders: LookupMap<AccountId, Vec<u64>>,

    pub(crate) cross: LookupMap<(String, String), u128>,
    pub(crate) reserve: u128,
    pub(crate) protocol_fees: u128,
    pub(crate) last_nav_bell: Option<u64>,
    pub(crate) last_nav_at_ns: u64,
    pub(crate) last_prices_hash: String,
    pub(crate) last_closed_quarter: Option<u64>,
    pub(crate) last_settled_season: Option<u64>,
    pub(crate) last_rep_quarter: Option<u64>,
    pub(crate) rep_roots: LookupMap<u64, String>,
    pub(crate) nft: NonFungibleToken,
    pub(crate) auctions: LookupMap<String, SeatAuction>,
    pub(crate) badges_seen: LookupSet<String>,
    pub(crate) badge_count: u64,
    pub(crate) distribution: Option<Distribution>,
}

#[near]
impl Contract {

    #[init]
    pub fn new(
        owner: AccountId,
        operator: AccountId,
        game_usd_per_near: Option<u64>,
        season: Option<ClockIn>,
        keeper: Option<AccountId>,
    ) -> Self {
        let now = env::block_timestamp();
        let midnight = now - now % (DAY_SECS * NS);
        let mut clock = Clock {
            genesis_ns: U64(midnight),
            bell_secs: 900,
            quarter_secs: DAY_SECS,
            quarters: 4,
            reveal_secs: 180,
            auction_secs: DAY_SECS,
        };
        apply_clock(&mut clock, season.unwrap_or_default());
        let rate = game_usd_per_near.unwrap_or(100);
        require!(rate > 0, "config: game_usd_per_near must be positive");
        Self {
            owner,
            operator,
            keeper,
            game_usd_per_near: rate,
            clock,
            paused: false,
            media_base: String::new(),
            asset_ids: Vec::new(),
            assets: LookupMap::new(StorageKey::Assets),
            fund_ids: Vec::new(),
            funds: LookupMap::new(StorageKey::Funds),
            balances: LookupMap::new(StorageKey::Balances),
            holders: Vector::new(StorageKey::Holders),
            orders: LookupMap::new(StorageKey::Orders),
            next_order_id: 1,
            queues: LookupMap::new(StorageKey::Queues),
            account_orders: LookupMap::new(StorageKey::AccountOrders),
            cross: LookupMap::new(StorageKey::Cross),
            reserve: 0,
            protocol_fees: 0,
            last_nav_bell: None,
            last_nav_at_ns: 0,
            last_prices_hash: String::new(),
            last_closed_quarter: None,
            last_settled_season: None,
            last_rep_quarter: None,
            rep_roots: LookupMap::new(StorageKey::RepRoots),
            nft: NonFungibleToken::new(
                StorageKey::NftOwners,
                env::current_account_id(),
                Some(StorageKey::NftMetadata),
                Some(StorageKey::NftEnumeration),
                None::<StorageKey>,
            ),
            auctions: LookupMap::new(StorageKey::Auctions),
            badges_seen: LookupSet::new(StorageKey::BadgesSeen),
            badge_count: 0,
            distribution: None,
        }
    }

    pub fn set_universe(&mut self, assets: Vec<Asset>) {
        self.assert_owner();
        require!(!assets.is_empty(), "universe: no assets given");
        for a in &assets {
            require!(valid_asset_id(&a.id), format!("universe: bad asset id {:?}", a.id));
            require!(!a.basket.is_empty() && a.basket.len() <= 32, "universe: basket must be 1-32 chars");
            require!(!a.region.is_empty() && a.region.len() <= 16, "universe: region must be 1-16 chars");
            if self.assets.insert(a.id.clone(), a.clone()).is_none() {
                self.asset_ids.push(a.id.clone());
            }
        }
        events::emit(
            "universe_set",
            near_sdk::serde_json::json!({ "assets": assets, "total": self.asset_ids.len() }),
        );
    }

    #[payable]
    #[allow(clippy::too_many_arguments)]
    pub fn create_fund(
        &mut self,
        id: String,
        name: String,
        mandate: String,
        caps: Caps,
        manager: AccountId,
        seed_usd: U128,
        pool_near: U128,
        weights: Option<Vec<WeightIn>>,
        cash_bps: Option<u16>,
    ) {
        self.assert_owner();
        require!(valid_fund_id(&id), "fund: id must be 1-16 chars of a-z 0-9 -");
        require!(!self.funds.contains_key(&id), "fund: id already exists");
        require!(!name.is_empty() && name.len() <= 32, "fund: name must be 1-32 chars");
        require!(mandate.len() <= 64, "fund: mandate must be at most 64 chars");
        require!(
            caps.startup_cap_bps <= 10_000 && caps.basket_cap_bps >= MAX_WEIGHT_BPS && caps.basket_cap_bps <= 10_000,
            "fund: caps must be bps; basket cap at least 2500"
        );
        require!(seed_usd.0 > 0, "fund: seed_usd must be positive");
        let attached = env::attached_deposit().as_yoctonear();
        let from_deposit = attached.min(pool_near.0);
        let from_reserve = pool_near.0 - from_deposit;
        require!(from_reserve <= self.reserve, "fund: pool_near exceeds deposit + reserve");
        self.reserve = self.reserve - from_reserve + (attached - from_deposit);
        let rate = self.game_usd_per_near;
        let pool_usd = yocto_to_usd(pool_near.0, rate);
        let pool_coins = coins_for_usd(pool_usd, LAUNCH_NAV);
        let manager_coins = coins_for_usd(seed_usd.0, LAUNCH_NAV);
        let now = env::block_timestamp();
        let mut fund = Fund {
            id: id.clone(),
            name: name.clone(),
            mandate: mandate.clone(),
            caps,
            manager: manager.clone(),
            status: FundStatus::Active,
            created_at_ns: now,
            nav: LAUNCH_NAV,
            value: seed_usd.0 + pool_usd,
            supply: manager_coins + pool_coins,
            manager_coins,
            ledger_supply: 0,
            vault: 0,
            pending_sub_yocto: 0,
            pending_redeem_coins: 0,
            pool_near: pool_near.0,
            pool_coins,
            weights: Vec::new(),
            cash_bps: 10_000,
            commit: None,
            last_reveal_bell: None,
            editions: 0,
            turnover_q_bps: 0,
            reputation: START_REPUTATION,
            nav_q_start: LAUNCH_NAV,
            nav_season_start: LAUNCH_NAV,
            fees_accrued_usd: 0,
            nav_bell: self.last_nav_bell,
            promise: None,
            dna: None,
        };
        if let Some(w) = weights {
            let w = weights_from(w);
            let cash = cash_bps.unwrap_or(0);
            self.check_weights(&fund, &w, cash);
            fund.weights = w;
            fund.cash_bps = cash;
        }
        self.fund_ids.push(id.clone());
        let me = env::current_account_id();
        events::emit(
            "fund_created",
            near_sdk::serde_json::json!({
                "fund": id, "name": name, "mandate": mandate, "caps": caps, "manager": manager,
                "seed_usd": seed_usd, "manager_coins": U128(manager_coins), "nav": U128(LAUNCH_NAV),
                "value": U128(fund.value), "supply": U128(fund.supply),
                "pool_near": pool_near, "pool_coins": U128(pool_coins),
                "weights": rules::weights_text(&fund.weights), "cash_bps": fund.cash_bps,
            }),
        );
        if pool_coins > 0 {
            events::mt_mint(&me, &id, pool_coins, "pool seed");
        }
        self.funds.insert(id.clone(), fund);
        self.mint_seat(&id);
        self.start_auction(&id, false);
    }

    pub fn set_crypto_cap(&mut self, fund: String, bps: u16) {
        self.assert_owner();
        require!(self.funds.contains_key(&fund), format!("fund: no fund {fund:?}"));
        require!(bps <= 10_000, "fund: crypto cap must be 0-10000 bps");
        env::storage_write(&crypto_cap_key(&fund), &bps.to_le_bytes());
        events::emit("crypto_cap_set", near_sdk::serde_json::json!({ "fund": fund, "crypto_cap_bps": bps }));
    }

    pub fn set_operator(&mut self, operator: AccountId) {
        self.assert_owner();
        self.operator = operator;
    }

    pub fn set_keeper(&mut self, keeper: Option<AccountId>) {
        self.assert_owner();
        self.keeper = keeper;
    }

    pub fn set_owner(&mut self, owner: AccountId) {
        self.assert_owner();
        self.owner = owner;
    }

    pub fn set_manager(&mut self, fund: String, manager: AccountId) {
        self.assert_owner();
        let mut f = self.fund(&fund);
        f.manager = manager.clone();
        f.commit = None;
        self.save(f);
        events::emit("manager_set", near_sdk::serde_json::json!({ "fund": fund, "manager": manager }));
    }

    pub fn set_clock(&mut self, season: ClockIn) {
        self.assert_owner();
        apply_clock(&mut self.clock, season);
        events::emit("clock_set", near_sdk::serde_json::json!({ "clock": self.clock }));
    }

    pub fn set_game_rate(&mut self, game_usd_per_near: u64) {
        self.assert_owner();
        require!(game_usd_per_near > 0, "config: game_usd_per_near must be positive");
        self.game_usd_per_near = game_usd_per_near;
    }

    pub fn set_media_base(&mut self, media_base: String) {
        self.assert_owner();
        require!(media_base.len() <= 200, "config: media_base too long");
        self.media_base = media_base;
    }

    pub fn pause(&mut self) {
        self.assert_owner();
        self.paused = true;
        events::emit("paused", near_sdk::serde_json::json!({ "paused": true }));
    }

    pub fn unpause(&mut self) {
        self.assert_owner();
        self.paused = false;
        events::emit("paused", near_sdk::serde_json::json!({ "paused": false }));
    }

    #[payable]
    pub fn fund_reserve(&mut self) {
        let amount = env::attached_deposit().as_yoctonear();
        require!(amount > 0, "reserve: attach NEAR");
        self.reserve += amount;
        events::emit(
            "reserve_funded",
            near_sdk::serde_json::json!({ "by": env::predecessor_account_id(), "near": U128(amount), "reserve": U128(self.reserve) }),
        );
    }

    pub fn withdraw_protocol_fees(&mut self, amount: U128, to: Option<AccountId>) -> Promise {
        self.assert_owner();
        require!(amount.0 > 0 && amount.0 <= self.protocol_fees, "fees: amount exceeds protocol fees");
        self.protocol_fees -= amount.0;
        let to = to.unwrap_or_else(|| self.owner.clone());
        events::emit("protocol_withdrawn", near_sdk::serde_json::json!({ "to": to, "near": amount }));
        Promise::new(to).transfer(NearToken::from_yoctonear(amount.0))
    }

    pub fn retire_fund(&mut self, fund: String) {
        let by = env::predecessor_account_id();
        require!(by == self.owner || by == self.operator, "role: owner or operator only");
        let mut f = self.fund(&fund);
        require!(f.status == FundStatus::Active, "fund: already retired");
        f.status = FundStatus::Retired;
        f.commit = None;
        self.save(f.clone());
        events::emit(
            "fund_retired",
            near_sdk::serde_json::json!({ "fund": fund, "nav": U128(f.nav), "value": U128(f.value) }),
        );
        let open = self.auctions.get(&fund).is_some_and(|a| !a.settled);
        if !open {
            self.start_auction(&fund, true);
        }
    }
}

pub fn is_startup(a: &Asset) -> bool {
    a.kind == AssetKind::Startup || a.basket.eq_ignore_ascii_case("startups")
}

pub fn is_crypto(a: &Asset) -> bool {
    a.kind == AssetKind::Crypto || a.basket.eq_ignore_ascii_case("crypto")
}

fn crypto_cap_key(fund: &str) -> Vec<u8> {
    let mut k = b"ccap:".to_vec();
    k.extend_from_slice(fund.as_bytes());
    k
}

pub fn is_india(a: &Asset) -> bool {
    a.region.eq_ignore_ascii_case("india") || a.region.eq_ignore_ascii_case("in")
}

pub(crate) fn apply_clock(c: &mut Clock, i: ClockIn) {
    if let Some(v) = i.genesis_ns {
        c.genesis_ns = v;
    }
    if let Some(v) = i.bell_secs {
        c.bell_secs = v;
    }
    if let Some(v) = i.quarter_secs {
        c.quarter_secs = v;
    }
    if let Some(v) = i.quarters {
        c.quarters = v;
    }
    if let Some(v) = i.reveal_secs {
        c.reveal_secs = v;
    }
    if let Some(v) = i.auction_secs {
        c.auction_secs = v;
    }
    require!(c.bell_secs >= 1 && c.quarter_secs >= c.bell_secs, "clock: need 1 <= bell_secs <= quarter_secs");
    require!(c.quarters >= 1, "clock: quarters must be at least 1");
    require!(c.reveal_secs >= 1 && c.reveal_secs < c.bell_secs, "clock: reveal_secs must be in 1..bell_secs");
}

impl Contract {

    pub(crate) fn assert_owner(&self) {
        require!(env::predecessor_account_id() == self.owner, "role: owner only");
    }

    pub(crate) fn assert_operator(&self) {
        require!(env::predecessor_account_id() == self.operator, "role: operator only");
    }

    pub(crate) fn assert_keeper(&self) {
        let by = env::predecessor_account_id();
        require!(
            by == self.operator || self.keeper.as_ref() == Some(&by),
            "role: operator or keeper only"
        );
    }

    pub(crate) fn assert_not_paused(&self) {
        require!(!self.paused, "paused: the contract is paused");
    }

    pub(crate) fn elapsed_ns(&self, now: u64) -> u64 {
        now.saturating_sub(self.clock.genesis_ns.0)
    }

    pub(crate) fn bell_at(&self, now: u64) -> u64 {
        self.elapsed_ns(now) / (self.clock.bell_secs * NS)
    }

    pub(crate) fn bell_time(&self, bell: u64) -> u64 {
        self.clock.genesis_ns.0 + bell * self.clock.bell_secs * NS
    }

    pub(crate) fn quarter_at(&self, now: u64) -> u64 {
        self.elapsed_ns(now) / (self.clock.quarter_secs * NS)
    }

    pub(crate) fn season_of_quarter(&self, q: u64) -> u64 {
        q / self.clock.quarters
    }

    pub(crate) fn fund(&self, id: &str) -> Fund {
        self.funds.get(id).cloned().unwrap_or_else(|| env::panic_str(&format!("fund: no fund {id:?}")))
    }

    pub(crate) fn save(&mut self, f: Fund) {
        self.funds.insert(f.id.clone(), f);
    }

    pub(crate) fn all_funds(&self) -> Vec<Fund> {
        self.fund_ids.iter().filter_map(|id| self.funds.get(id).cloned()).collect()
    }

    pub(crate) fn crypto_cap(&self, fund: &str) -> u16 {
        env::storage_read(&crypto_cap_key(fund))
            .and_then(|v| <[u8; 2]>::try_from(v.as_slice()).ok())
            .map(u16::from_le_bytes)
            .unwrap_or(0)
    }

    pub(crate) fn check_weights(&self, f: &Fund, w: &[rules::Weight], cash: u16) {
        let lookup = |id: &str| {
            self.assets.get(id).map(|a| AssetClass {
                basket: a.basket.clone(),
                startup: is_startup(a),
                india: is_india(a),
                crypto: is_crypto(a),
            })
        };
        let crypto_cap = self.crypto_cap(&f.id);
        if let Err(e) = check_portfolio(w, cash, lookup, f.caps.startup_cap_bps, f.caps.basket_cap_bps, crypto_cap) {
            env::panic_str(&e);
        }
    }

    pub(crate) fn assert_not_distributing(&self, fund: &str) {
        if let Some(d) = &self.distribution {
            require!(
                !d.rates.iter().any(|(f, _)| f == fund),
                "promise: payout in progress for this fund; call distribute_promises"
            );
        }
    }

    pub(crate) fn distributing(&self, fund: &str) -> bool {
        self.distribution.as_ref().is_some_and(|d| d.rates.iter().any(|(f, _)| f == fund))
    }

    pub(crate) fn outside_coins(f: &Fund) -> u128 {
        f.supply - f.manager_coins - f.pool_coins
    }

    pub(crate) fn liabilities_yocto(&self, f: &Fund) -> u128 {
        usd_to_yocto(usd_for_coins(Self::outside_coins(f), f.nav), self.game_usd_per_near)
    }

    pub(crate) fn coverage_parts(&self) -> (u128, u128) {
        let mut assets = self.reserve;
        let mut liabilities = 0u128;
        for f in self.all_funds() {
            assets += f.vault;
            liabilities += self.liabilities_yocto(&f);
        }
        (assets, liabilities)
    }

    pub(crate) fn gas_ok(&self) -> bool {
        env::used_gas().as_gas() + GAS_RESERVE.as_gas() < env::prepaid_gas().as_gas()
    }

    pub(crate) fn pay(&self, to: &AccountId, yocto: u128) {
        if yocto > 0 {
            Promise::new(to.clone()).transfer(NearToken::from_yoctonear(yocto)).detach();
        }
    }
}
