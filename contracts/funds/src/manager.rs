use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require};

use listed_common::dna::{hex_decode32, hex_encode};
use listed_common::math::mul_div;

use crate::rules::*;
use crate::types::{weights_from, Commit, Fund, FundStatus, PromiseInfo, WeightIn};
use crate::{events, Contract, ContractExt};

impl Contract {
    fn manager_fund(&self, fund: &str) -> Fund {
        let f = self.fund(fund);
        require!(env::predecessor_account_id() == f.manager, "role: only this fund's manager can call this");
        f
    }

    pub(crate) fn cross_value(&self, holder: &str) -> u128 {
        self.fund_ids
            .iter()
            .filter(|t| t.as_str() != holder)
            .map(|t| {
                let coins = self.cross.get(&(holder.to_string(), t.clone())).copied().unwrap_or(0);
                if coins == 0 {
                    return 0;
                }
                let tf = self.funds.get(t).unwrap();
                usd_for_coins(coins, pool_price_usd(tf.pool_near, tf.pool_coins, self.game_usd_per_near))
            })
            .sum()
    }
}

#[near]
impl Contract {

    pub fn commit_rebalance(&mut self, fund: String, hash: String, bell: Option<u64>) -> u64 {
        self.assert_not_paused();
        let mut f = self.manager_fund(&fund);
        require!(f.status == FundStatus::Active, "rebalance: this fund is retired");
        let h = hex_decode32(&hash).unwrap_or_else(|| env::panic_str("rebalance: hash must be 64 hex chars"));
        let now = env::block_timestamp();
        let next = self.bell_at(now) + 1;
        if let Some(b) = bell {
            require!(b == next, format!("rebalance: the next bell is {next}"));
        }
        f.commit = Some(Commit { hash: h, bell: next, at_ns: now });
        self.save(f);
        events::emit(
            "rebalance_committed",
            json!({ "fund": fund, "bell": next, "hash": hash.to_lowercase(), "bell_at_ns": self.bell_time(next).to_string() }),
        );
        next
    }

    pub fn reveal_rebalance(&mut self, fund: String, weights: Vec<WeightIn>, cash_bps: u16, salt: String) -> u32 {
        self.assert_not_paused();
        let mut f = self.manager_fund(&fund);
        require!(f.status == FundStatus::Active, "rebalance: this fund is retired");
        require!(!salt.is_empty() && salt.len() <= 128, "rebalance: salt must be 1-128 chars");
        let c = f.commit.clone().unwrap_or_else(|| env::panic_str("rebalance: nothing committed"));
        let now = env::block_timestamp();
        let open = self.bell_time(c.bell);
        require!(now >= open, "rebalance: the bell has not rung yet");
        require!(
            now <= open + self.clock.reveal_secs * 1_000_000_000,
            "rebalance: the reveal window for that bell has closed"
        );
        let w = weights_from(weights);
        require!(commit_hash(&fund, c.bell, &w, cash_bps, &salt) == c.hash, "rebalance: weights and salt do not match the commit");
        self.check_weights(&f, &w, cash_bps);
        if let Err(e) = check_step(&f.weights, &w) {
            env::panic_str(&e);
        }
        let first = f.weights.is_empty();

        let turnover = if first { 0 } else { turnover_bps(&f.weights, f.cash_bps, &w, cash_bps) };
        f.weights = w;
        f.cash_bps = cash_bps;
        f.commit = None;
        f.last_reveal_bell = Some(c.bell);
        f.turnover_q_bps += turnover;
        let edition = if turnover > 0 || first {
            f.editions += 1;
            Some(f.editions)
        } else {
            None
        };
        events::emit(
            "rebalance_revealed",
            json!({
                "fund": fund, "bell": c.bell, "weights": weights_text(&f.weights), "cash_bps": cash_bps,
                "turnover_bps": turnover, "turnover_quarter_bps": f.turnover_q_bps, "salt": salt,
                "hash": hex_encode(&c.hash), "nav": U128(f.nav), "edition": edition,
            }),
        );
        if let Some(e) = edition {
            self.mint_card(&f, e, c.bell);
        }
        self.save(f);
        turnover
    }

    pub fn cross_trade(&mut self, fund: String, target: String, side: String, usd: U128, min_out: Option<U128>) -> U128 {
        self.assert_not_paused();
        let mut f = self.manager_fund(&fund);
        require!(f.status == FundStatus::Active, "cross: this fund is retired");
        require!(fund != target, "cross: a fund cannot trade its own coin");
        require!(usd.0 > 0, "cross: usd must be positive");
        let mut t = self.fund(&target);
        let key = (fund.clone(), target.clone());
        let held = self.cross.get(&key).copied().unwrap_or(0);
        let rate = self.game_usd_per_near;
        let min_out = min_out.map(|m| m.0).unwrap_or(0);
        let (near, coins, out) = match side.as_str() {
            "buy" => {
                require!(t.status == FundStatus::Active, "cross: target fund is retired");
                require!(
                    t.reputation >= CROSS_MIN_REPUTATION,
                    format!("cross: {target} reputation {} is below {CROSS_MIN_REPUTATION}", t.reputation)
                );
                let near_in = usd_to_yocto(usd.0, rate);
                require!(near_in <= f.vault, format!("cross: fund vault holds {} yoctoNEAR", f.vault));
                let s = swap_buy(t.pool_near, t.pool_coins, near_in);
                require!(s.out > 0 && s.out >= min_out, "cross: pool too thin or min_out not met");
                let new_held = held + s.out;
                require!(
                    new_held <= mul_div(t.supply, CROSS_TARGET_SUPPLY_CAP_BPS as u128, BPS),
                    "cross: holding would exceed 10% of the target's supply"
                );
                f.vault -= near_in;
                t.pool_near = s.new_near;
                t.pool_coins = s.new_coins;
                self.cross.insert(key, new_held);
                self.save(t.clone());
                let total = self.cross_value(&fund);
                require!(
                    total <= mul_div(f.value, CROSS_OWN_VALUE_CAP_BPS as u128, BPS),
                    "cross: cross holdings would exceed 20% of this fund's value"
                );
                (near_in, s.out, s.out)
            }
            "sell" => {
                require!(held > 0, "cross: no coins of that fund held");
                let price = pool_price_usd(t.pool_near, t.pool_coins, rate);
                let coins = coins_for_usd(usd.0, price).min(held);
                let s = swap_sell(t.pool_near, t.pool_coins, coins);
                require!(s.out > 0 && s.out >= min_out, "cross: pool too thin or min_out not met");
                t.pool_near = s.new_near;
                t.pool_coins = s.new_coins;
                f.vault += s.out;
                self.cross.insert(key, held - coins);
                self.save(t.clone());
                (s.out, coins, s.out)
            }
            _ => env::panic_str("cross: side must be \"buy\" or \"sell\""),
        };
        let holding = self.cross.get(&(fund.clone(), target.clone())).copied().unwrap_or(0);
        events::emit(
            "cross_trade",
            json!({
                "fund": fund, "target": target, "side": side, "usd": usd, "near": U128(near), "coins": U128(coins),
                "holding": U128(holding), "target_reputation": t.reputation,
                "price_micro_usd": U128(pool_price_usd(t.pool_near, t.pool_coins, rate)), "vault": U128(f.vault),
            }),
        );
        self.save(f);
        U128(out)
    }

    pub fn set_promise(&mut self, fund: String, target_bps: u16, bond_bps: u16) {
        self.assert_not_paused();
        let mut f = self.manager_fund(&fund);
        require!(f.status == FundStatus::Active, "promise: this fund is retired");
        let q = self.quarter_at(env::block_timestamp());
        require!(q.is_multiple_of(self.clock.quarters), "promise: only in the first quarter of a season");
        let season = self.season_of_quarter(q);
        require!(f.promise.as_ref().is_none_or(|p| p.season != season), "promise: already set this season");
        require!((1..=10_000).contains(&target_bps), "promise: target_bps must be 1-10000");
        require!((1..=MAX_BOND_BPS).contains(&bond_bps), "promise: bond_bps must be 1-3000");
        let bond_coins = mul_div(f.manager_coins, bond_bps as u128, BPS);
        let bond_usd = usd_for_coins(bond_coins, f.nav);
        let holders_usd = usd_for_coins(f.ledger_supply - f.pending_redeem_coins, f.nav);
        let promised = mul_div(holders_usd, target_bps as u128, BPS);
        require!(bond_usd >= promised, "promise: the bond does not cover this target on current holders' capital");
        f.promise = Some(PromiseInfo { season, target_bps, bond_bps, bond_coins });
        self.save(f);
        events::emit(
            "promise_set",
            json!({ "fund": fund, "season": season, "target_bps": target_bps, "bond_bps": bond_bps,
                    "bond_coins": U128(bond_coins), "bond_usd": U128(bond_usd) }),
        );
    }
}
