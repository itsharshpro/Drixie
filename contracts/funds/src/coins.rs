use near_sdk::json_types::U128;
use near_sdk::{assert_one_yocto, env, near, require, AccountId};

use crate::rules::{blend_since, ONE_COIN};
use crate::types::Holding;
use crate::{events, Contract, ContractExt};

pub const MIN_NEW_RECORD_COINS: u128 = ONE_COIN / 100;

#[near(serializers = [json])]
pub struct MtContractMetadata {
    pub spec: String,
    pub name: String,
}

#[near(serializers = [json])]
pub struct MtTokenMetadata {
    pub token_id: String,
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
    pub icon: Option<String>,
    pub reference: Option<String>,
}

impl Contract {
    pub(crate) fn holding(&self, fund: &str, account: &AccountId) -> Holding {
        self.balances.get(&(fund.to_string(), account.clone())).cloned().unwrap_or_default()
    }

    pub(crate) fn credit(&mut self, fund: &str, account: &AccountId, coins: u128, since: u64) {
        let key = (fund.to_string(), account.clone());
        match self.balances.get_mut(&key) {
            Some(h) => {
                h.since_ns = blend_since(h.coins, h.since_ns, coins, since);
                h.coins += coins;
            }
            None => {
                self.balances.insert(key.clone(), Holding { coins, since_ns: since });
                self.holders.push(key);
            }
        }
    }

    pub(crate) fn debit(&mut self, fund: &str, account: &AccountId, coins: u128) -> u64 {
        let key = (fund.to_string(), account.clone());
        let h = self
            .balances
            .get_mut(&key)
            .unwrap_or_else(|| env::panic_str("coins: no coins of this fund"));
        require!(h.coins >= coins, format!("coins: balance {} is below {}", h.coins, coins));
        h.coins -= coins;
        h.since_ns
    }

    fn transfer_one(&mut self, from: &AccountId, to: &AccountId, fund: &str, amount: u128, memo: Option<&str>) {
        require!(amount > 0, "coins: amount must be positive");
        require!(from != to, "coins: sender and receiver are the same");
        require!(*to != env::current_account_id(), "coins: use swap_coin_for_near or redeem to return coins");
        require!(self.funds.contains_key(fund), "coins: unknown token id");
        self.assert_not_distributing(fund);
        if !self.balances.contains_key(&(fund.to_string(), to.clone())) {
            require!(amount >= MIN_NEW_RECORD_COINS, "coins: send at least 0.01 coin to a new holder");
        }
        let since = self.debit(fund, from, amount);

        self.credit(fund, to, amount, since);
        events::mt_transfer(from, to, fund, amount, memo);
    }
}

#[near]
impl Contract {

    #[payable]
    pub fn mt_transfer(
        &mut self,
        receiver_id: AccountId,
        token_id: String,
        amount: U128,
        approval: Option<(AccountId, u64)>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        self.assert_not_paused();
        require!(approval.is_none(), "coins: approvals are not supported");
        let from = env::predecessor_account_id();
        self.transfer_one(&from, &receiver_id, &token_id, amount.0, memo.as_deref());
    }

    #[payable]
    pub fn mt_batch_transfer(
        &mut self,
        receiver_id: AccountId,
        token_ids: Vec<String>,
        amounts: Vec<U128>,
        approvals: Option<Vec<Option<(AccountId, u64)>>>,
        memo: Option<String>,
    ) {
        assert_one_yocto();
        self.assert_not_paused();
        require!(token_ids.len() == amounts.len() && !token_ids.is_empty(), "coins: token_ids and amounts must match");
        require!(approvals.is_none_or(|a| a.iter().all(|x| x.is_none())), "coins: approvals are not supported");
        let from = env::predecessor_account_id();
        for (t, a) in token_ids.iter().zip(amounts.iter()) {
            self.transfer_one(&from, &receiver_id, t, a.0, memo.as_deref());
        }
    }

    pub fn mt_balance_of(&self, account_id: AccountId, token_id: String) -> U128 {
        if account_id == env::current_account_id() {
            return U128(self.contract_held(&token_id));
        }
        U128(self.holding(&token_id, &account_id).coins)
    }

    pub fn mt_batch_balance_of(&self, account_id: AccountId, token_ids: Vec<String>) -> Vec<U128> {
        token_ids.into_iter().map(|t| self.mt_balance_of(account_id.clone(), t)).collect()
    }

    pub fn mt_supply(&self, token_id: String) -> Option<U128> {
        self.funds.get(&token_id).map(|f| U128(f.supply))
    }

    pub fn mt_batch_supply(&self, token_ids: Vec<String>) -> Vec<Option<U128>> {
        token_ids.into_iter().map(|t| self.mt_supply(t)).collect()
    }

    pub fn mt_metadata_contract(&self) -> MtContractMetadata {
        MtContractMetadata { spec: "mt-1.0.0".to_string(), name: "Drixie fund coins".to_string() }
    }

    pub fn mt_metadata(&self, token_ids: Vec<String>) -> Vec<Option<MtTokenMetadata>> {
        token_ids
            .into_iter()
            .map(|t| {
                self.funds.get(&t).map(|f| MtTokenMetadata {
                    token_id: t.clone(),
                    spec: "mt-1.0.0".to_string(),
                    name: format!("{} fund coin", f.name),
                    symbol: f.id.to_uppercase(),
                    decimals: 18,
                    icon: None,
                    reference: None,
                })
            })
            .collect()
    }
}

impl Contract {
    pub(crate) fn contract_held(&self, fund: &str) -> u128 {
        let Some(f) = self.funds.get(fund) else { return 0 };
        let cross: u128 = self
            .fund_ids
            .iter()
            .filter_map(|h| self.cross.get(&(h.clone(), fund.to_string())).copied())
            .sum();
        f.pool_coins + f.pending_redeem_coins + cross
    }
}
