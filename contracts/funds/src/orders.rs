use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::json;
use near_sdk::{env, near, require, AccountId};

use crate::rules::*;
use crate::types::{Fund, FundStatus, Order, OrderSide};
use crate::{events, Contract, ContractExt, MIN_SUBSCRIBE_YOCTO};

#[near(serializers = [json])]
pub struct OrderView {
    pub id: U64,
    pub fund: String,
    pub account: AccountId,
    pub side: OrderSide,

    pub amount: U128,
    pub queued_at_ns: U64,
    pub after_bell: Option<u64>,
}

impl From<&Order> for OrderView {
    fn from(o: &Order) -> Self {
        OrderView {
            id: U64(o.id),
            fund: o.fund.clone(),
            account: o.account.clone(),
            side: o.side,
            amount: U128(o.amount),
            queued_at_ns: U64(o.queued_at_ns),
            after_bell: o.after_bell,
        }
    }
}

impl Contract {
    fn queue_order(&mut self, fund: &str, account: AccountId, side: OrderSide, amount: u128, since_ns: u64) -> u64 {

        let now_bell = self.bell_at(env::block_timestamp());
        let after_bell = Some(self.fund(fund).nav_bell.map_or(now_bell, |b| b.max(now_bell)));
        let id = self.next_order_id;
        self.next_order_id += 1;
        let order = Order {
            id,
            fund: fund.to_string(),
            account: account.clone(),
            side,
            amount,
            since_ns,
            queued_at_ns: env::block_timestamp(),
            after_bell,
        };
        self.orders.insert(id, order);
        self.queues.get_mut(fund).map(|q| q.push(id)).unwrap_or_else(|| {
            self.queues.insert(fund.to_string(), vec![id]);
        });
        match self.account_orders.get_mut(&account) {
            Some(v) => v.push(id),
            None => {
                self.account_orders.insert(account.clone(), vec![id]);
            }
        }
        events::emit(
            "order_queued",
            json!({
                "id": U64(id), "fund": fund, "account": account, "side": side, "amount": U128(amount),
                "after_bell": after_bell,
            }),
        );
        id
    }

    fn unlink_order(&mut self, o: &Order) {
        self.orders.remove(&o.id);
        if let Some(q) = self.queues.get_mut(&o.fund) {
            q.retain(|x| *x != o.id);
        }
        let empty = match self.account_orders.get_mut(&o.account) {
            Some(v) => {
                v.retain(|x| *x != o.id);
                v.is_empty()
            }
            None => false,
        };
        if empty {
            self.account_orders.remove(&o.account);
        }
    }

    pub(crate) fn fill_order(&mut self, f: &mut Fund, o: &Order, coverage: (u128, u128)) {
        let rate = self.game_usd_per_near;
        let now = env::block_timestamp();
        match o.side {
            OrderSide::Subscribe => {
                f.pending_sub_yocto -= o.amount;
                let usd = yocto_to_usd(o.amount, rate);
                let coins = coins_for_usd(usd, f.nav);
                if f.status != FundStatus::Active || coins == 0 {
                    self.pay(&o.account, o.amount);
                    events::emit(
                        "order_refunded",
                        json!({ "id": U64(o.id), "fund": f.id, "account": o.account, "near": U128(o.amount),
                                "reason": if coins == 0 { "too small" } else { "fund retired" } }),
                    );
                    return;
                }
                f.vault += o.amount;
                f.value += usd;
                f.supply += coins;
                f.ledger_supply += coins;
                self.credit(&f.id, &o.account, coins, now);
                events::mt_mint(&o.account, &f.id, coins, "buy in");
                events::emit(
                    "order_filled",
                    json!({
                        "id": U64(o.id), "fund": f.id, "account": o.account, "side": "subscribe",
                        "near": U128(o.amount), "coins": U128(coins), "usd": U128(usd), "nav": U128(f.nav),
                        "bell": f.nav_bell,
                    }),
                );
            }
            OrderSide::Redeem => {
                let coins = o.amount;
                let load = exit_load_bps(
                    now.saturating_sub(o.since_ns),
                    self.clock.quarter_secs * 1_000_000_000,
                    f.reputation,
                    f.status == FundStatus::Retired,
                );
                let gross = usd_for_coins(coins, f.nav);
                let usd = gross - mul_div_bps(gross, load);
                let due = usd_to_yocto(usd, rate);
                let (assets, liabilities) = coverage;
                let mut paid = if liabilities > assets && liabilities > 0 {
                    listed_common::math::mul_div(due, assets, liabilities)
                } else {
                    due
                };
                let from_vault = paid.min(f.vault);
                f.vault -= from_vault;
                let from_reserve = (paid - from_vault).min(self.reserve);
                self.reserve -= from_reserve;
                paid = from_vault + from_reserve;
                f.pending_redeem_coins -= coins;
                f.ledger_supply -= coins;
                f.supply -= coins;
                f.value = f.value.saturating_sub(usd);
                self.pay(&o.account, paid);
                events::mt_burn(&env::current_account_id(), &f.id, coins, "cash out");
                events::emit(
                    "order_filled",
                    json!({
                        "id": U64(o.id), "fund": f.id, "account": o.account, "side": "redeem",
                        "coins": U128(coins), "usd": U128(usd), "near": U128(paid), "near_due": U128(due),
                        "exit_load_bps": load, "nav": U128(f.nav), "bell": f.nav_bell,
                    }),
                );
            }
        }
    }

    pub(crate) fn fill_queue(&mut self, f: &mut Fund, coverage: (u128, u128)) -> u32 {
        if self.distributing(&f.id) {
            return 0;
        }
        let Some(posted) = f.nav_bell else { return 0 };
        let queue = self.queues.get(&f.id).cloned().unwrap_or_default();
        let mut filled = 0;
        for id in queue {
            if !self.gas_ok() {
                break;
            }
            let Some(o) = self.orders.get(&id).cloned() else { continue };
            if o.after_bell.is_some_and(|b| b >= posted) {
                continue;
            }
            self.unlink_order(&o);
            self.fill_order(f, &o, coverage);
            filled += 1;
        }
        filled
    }
}

fn mul_div_bps(v: u128, bps: u16) -> u128 {
    listed_common::math::mul_div(v, bps as u128, BPS)
}

#[near]
impl Contract {

    #[payable]
    pub fn subscribe(&mut self, fund: String) -> U64 {
        self.assert_not_paused();
        let deposit = env::attached_deposit().as_yoctonear();
        require!(deposit >= MIN_SUBSCRIBE_YOCTO, "order: attach at least 0.05 NEAR");
        let mut f = self.fund(&fund);
        require!(f.status == FundStatus::Active, "order: this fund is retired");
        f.pending_sub_yocto += deposit;
        self.save(f);
        let account = env::predecessor_account_id();
        U64(self.queue_order(&fund, account, OrderSide::Subscribe, deposit, 0))
    }

    pub fn redeem(&mut self, fund: String, coins: U128) -> U64 {
        self.assert_not_paused();
        self.assert_not_distributing(&fund);
        require!(coins.0 > 0, "order: coins must be positive");
        let account = env::predecessor_account_id();
        let since = self.debit(&fund, &account, coins.0);
        let mut f = self.fund(&fund);
        f.pending_redeem_coins += coins.0;
        self.save(f);
        events::mt_transfer(&account, &env::current_account_id(), &fund, coins.0, Some("cash-out escrow"));
        U64(self.queue_order(&fund, account, OrderSide::Redeem, coins.0, since))
    }

    pub fn cancel_order(&mut self, id: U64) {
        let o = self.orders.get(&id.0).cloned().unwrap_or_else(|| env::panic_str("order: no pending order with this id"));
        require!(o.account == env::predecessor_account_id(), "order: not your order");
        let mut f = self.fund(&o.fund);
        match o.side {
            OrderSide::Subscribe => {
                f.pending_sub_yocto -= o.amount;
                self.pay(&o.account, o.amount);
            }
            OrderSide::Redeem => {
                self.assert_not_distributing(&o.fund);
                f.pending_redeem_coins -= o.amount;
                self.credit(&o.fund, &o.account, o.amount, o.since_ns);
                events::mt_transfer(&env::current_account_id(), &o.account, &o.fund, o.amount, Some("cash-out cancelled"));
            }
        }
        self.save(f);
        self.unlink_order(&o);
        events::emit(
            "order_cancelled",
            json!({ "id": id, "fund": o.fund, "account": o.account, "side": o.side, "amount": U128(o.amount) }),
        );
    }

    pub fn process_orders(&mut self, fund: Option<String>) -> u32 {
        let ids: Vec<String> = match fund {
            Some(f) => vec![f],
            None => self.fund_ids.clone(),
        };
        let coverage = self.coverage_parts();
        let mut n = 0;
        for id in ids {
            let mut f = self.fund(&id);
            n += self.fill_queue(&mut f, coverage);
            f.nav = nav_of(f.value, f.supply).max(1);
            self.save(f);
        }
        n
    }

    pub fn get_orders(&self, account: AccountId) -> Vec<OrderView> {
        self.account_orders
            .get(&account)
            .map(|ids| ids.iter().filter_map(|id| self.orders.get(id)).map(OrderView::from).collect())
            .unwrap_or_default()
    }

    pub fn get_queue(&self, fund: String, from_index: Option<u32>, limit: Option<u32>) -> Vec<OrderView> {
        let from = from_index.unwrap_or(0) as usize;
        let limit = limit.unwrap_or(100).min(500) as usize;
        self.queues
            .get(&fund)
            .map(|q| q.iter().skip(from).take(limit).filter_map(|id| self.orders.get(id)).map(OrderView::from).collect())
            .unwrap_or_default()
    }
}
