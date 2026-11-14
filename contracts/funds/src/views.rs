use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, AccountId};

use listed_common::dna::hex_encode;

use crate::rules::*;
use crate::types::{Asset, Caps, Clock, Fund, FundStatus};
use crate::{Contract, ContractExt};

#[near(serializers = [json])]
pub struct WeightView {
    pub asset: String,
    pub bps: u16,
}

#[near(serializers = [json])]
pub struct FundView {
    pub id: String,
    pub name: String,
    pub mandate: String,
    pub caps: Caps,

    pub crypto_cap_bps: u16,
    pub manager: AccountId,
    pub status: FundStatus,
    pub created_at_ns: U64,
    pub nav: U128,
    pub value: U128,
    pub supply: U128,
    pub manager_coins: U128,
    pub ledger_supply: U128,
    pub vault: U128,
    pub pending_sub_yocto: U128,
    pub pending_redeem_coins: U128,
    pub pool_near: U128,
    pub pool_coins: U128,
    pub coin_price: U128,
    pub premium_bps: i64,
    pub weights: Vec<WeightView>,
    pub cash_bps: u16,

    pub committed_bell: Option<u64>,
    pub commit_hash: Option<String>,
    pub last_reveal_bell: Option<u64>,

    pub nav_bell: Option<u64>,
    pub editions: u32,
    pub turnover_quarter_bps: u32,
    pub reputation: u8,
    pub nav_quarter_start: U128,
    pub nav_season_start: U128,
    pub fees_accrued_usd: U128,
    pub cross_value: U128,

    pub cross: Vec<Value>,
    pub promise: Option<Value>,
    pub dna: Option<Value>,
    pub seat_owner: Option<AccountId>,
}

#[near(serializers = [json])]
pub struct FundCoverage {
    pub fund: String,
    pub vault: U128,
    pub liabilities: U128,

    pub coverage_bps: Option<u32>,
}

#[near(serializers = [json])]
pub struct VaultView {

    pub balance: U128,
    pub vaults: U128,
    pub reserve: U128,
    pub pending_subscriptions: U128,
    pub pools: U128,
    pub protocol_fees: U128,
    pub auction_escrow: U128,

    pub liabilities: U128,
    pub liabilities_micro_usd: U128,

    pub coverage_bps: Option<u32>,
    pub funds: Vec<FundCoverage>,
}

#[near(serializers = [json])]
pub struct ClockView {
    pub now_ns: U64,
    pub bell: u64,
    pub bell_at_ns: U64,
    pub next_bell: u64,
    pub next_bell_at_ns: U64,

    pub reveal_open: bool,
    pub reveal_closes_at_ns: U64,
    pub quarter: u64,
    pub quarter_ends_at_ns: U64,
    pub season: u64,
    pub quarter_in_season: u64,
    pub last_nav_bell: Option<u64>,
    pub last_closed_quarter: Option<u64>,
    pub last_settled_season: Option<u64>,
}

fn coverage(assets: u128, liabilities: u128) -> Option<u32> {
    if liabilities == 0 {
        None
    } else {
        Some(listed_common::math::mul_div(assets, BPS, liabilities).min(u32::MAX as u128) as u32)
    }
}

impl Contract {
    pub(crate) fn fund_view(&self, f: &Fund) -> FundView {
        let price = pool_price_usd(f.pool_near, f.pool_coins, self.game_usd_per_near);
        FundView {
            id: f.id.clone(),
            name: f.name.clone(),
            mandate: f.mandate.clone(),
            caps: f.caps,
            crypto_cap_bps: self.crypto_cap(&f.id),
            manager: f.manager.clone(),
            status: f.status,
            created_at_ns: U64(f.created_at_ns),
            nav: U128(f.nav),
            value: U128(f.value),
            supply: U128(f.supply),
            manager_coins: U128(f.manager_coins),
            ledger_supply: U128(f.ledger_supply),
            vault: U128(f.vault),
            pending_sub_yocto: U128(f.pending_sub_yocto),
            pending_redeem_coins: U128(f.pending_redeem_coins),
            pool_near: U128(f.pool_near),
            pool_coins: U128(f.pool_coins),
            coin_price: U128(price),
            premium_bps: premium_bps(price, f.nav),
            weights: f.weights.iter().map(|(a, b)| WeightView { asset: a.clone(), bps: *b }).collect(),
            cash_bps: f.cash_bps,
            committed_bell: f.commit.as_ref().map(|c| c.bell),
            commit_hash: f.commit.as_ref().map(|c| hex_encode(&c.hash)),
            last_reveal_bell: f.last_reveal_bell,
            nav_bell: f.nav_bell,
            editions: f.editions,
            turnover_quarter_bps: f.turnover_q_bps,
            reputation: f.reputation,
            nav_quarter_start: U128(f.nav_q_start),
            nav_season_start: U128(f.nav_season_start),
            fees_accrued_usd: U128(f.fees_accrued_usd),
            cross_value: U128(self.cross_value(&f.id)),
            cross: self
                .fund_ids
                .iter()
                .filter_map(|t| {
                    let c = self.cross.get(&(f.id.clone(), t.clone())).copied().filter(|c| *c > 0)?;
                    Some(json!({ "target": t, "coins": U128(c) }))
                })
                .collect(),
            promise: f.promise.as_ref().map(|p| {
                json!({ "season": p.season, "target_bps": p.target_bps, "bond_bps": p.bond_bps,
                        "bond_coins": U128(p.bond_coins), "bond_usd": U128(usd_for_coins(p.bond_coins, f.nav)) })
            }),
            dna: f.dna.as_ref().map(|d| {
                json!({
                    "season": d.season, "commit": hex_encode(&d.commit), "seed": hex_encode(&d.seed),
                    "revealed": d.traits.is_some(),
                    "traits": d.traits.map(|t| json!({ "risk": t[0], "patience": t[1], "greed": t[2], "loyalty": t[3], "smarts": t[4] })),
                })
            }),
            seat_owner: self.nft.owner_by_id.get(&crate::nft::seat_id(&f.id)),
        }
    }
}

#[near]
impl Contract {
    pub fn get_config(&self) -> Value {
        let now = env::block_timestamp();
        let quarter = self.quarter_at(now);
        let season = self.season_of_quarter(quarter);
        let season_start = self.clock.genesis_ns.0 + season * self.clock.quarters * self.clock.quarter_secs * 1_000_000_000;
        json!({
            "bell_secs": self.clock.bell_secs, "quarter_secs": self.clock.quarter_secs, "quarters": self.clock.quarters,
            "reveal_secs": self.clock.reveal_secs, "genesis_ns": self.clock.genesis_ns,
            "bell": self.bell_at(now), "quarter": quarter, "season": season, "season_start_ns": U64(season_start),
            "version": env!("CARGO_PKG_VERSION"),
            "owner": self.owner, "operator": self.operator, "keeper": self.keeper,
            "game_usd_per_near": self.game_usd_per_near, "clock": self.clock, "paused": self.paused,
            "media_base": self.media_base, "funds": self.fund_ids, "assets": self.asset_ids.len(),
            "last_nav_bell": self.last_nav_bell, "last_nav_at_ns": U64(self.last_nav_at_ns),
            "last_prices_hash": self.last_prices_hash,
            "last_closed_quarter": self.last_closed_quarter, "last_settled_season": self.last_settled_season,
            "last_reputation_quarter": self.last_rep_quarter,
            "rules": {
                "holdings": HOLDINGS, "min_weight_bps": MIN_WEIGHT_BPS, "max_weight_bps": MAX_WEIGHT_BPS,
                "max_cash_bps": MAX_CASH_BPS, "india_cap_bps": INDIA_CAP_BPS, "max_step_bps": MAX_STEP_BPS,
                "max_swaps": MAX_SWAPS, "cross_target_supply_cap_bps": CROSS_TARGET_SUPPLY_CAP_BPS,
                "cross_own_value_cap_bps": CROSS_OWN_VALUE_CAP_BPS, "cross_min_reputation": CROSS_MIN_REPUTATION,
                "pool_fee_bps": POOL_FEE_BPS, "exit_load_bps": EXIT_LOAD_BPS,
                "exit_load_waived_below_reputation": EXIT_LOAD_WAIVED_BELOW_REPUTATION,
                "mgmt_fee_bps_per_year": MGMT_FEE_BPS_PER_YEAR as u64, "perf_fee_bps": PERF_FEE_BPS as u64,
                "split_buyback_bps": SPLIT_BUYBACK_BPS, "split_seat_bps": SPLIT_SEAT_BPS,
                "split_protocol_bps": 10_000 - SPLIT_BUYBACK_BPS - SPLIT_SEAT_BPS, "max_bond_bps": MAX_BOND_BPS,
                "start_reputation": START_REPUTATION, "launch_nav_micro_usd": U128(LAUNCH_NAV),
                "min_subscribe_yocto": U128(crate::MIN_SUBSCRIBE_YOCTO), "coin_decimals": 18,
            },
        })
    }

    pub fn get_clock(&self) -> ClockView {
        let now = env::block_timestamp();
        let bell = self.bell_at(now);
        let bell_at = self.bell_time(bell);
        let reveal_close = bell_at + self.clock.reveal_secs * 1_000_000_000;
        let q = self.quarter_at(now);
        let q_end = self.clock.genesis_ns.0 + (q + 1) * self.clock.quarter_secs * 1_000_000_000;
        ClockView {
            now_ns: U64(now),
            bell,
            bell_at_ns: U64(bell_at),
            next_bell: bell + 1,
            next_bell_at_ns: U64(self.bell_time(bell + 1)),
            reveal_open: now >= self.clock.genesis_ns.0 && now <= reveal_close,
            reveal_closes_at_ns: U64(reveal_close),
            quarter: q,
            quarter_ends_at_ns: U64(q_end),
            season: self.season_of_quarter(q),
            quarter_in_season: q % self.clock.quarters,
            last_nav_bell: self.last_nav_bell,
            last_closed_quarter: self.last_closed_quarter,
            last_settled_season: self.last_settled_season,
        }
    }

    pub fn get_universe(&self) -> Vec<Asset> {
        self.asset_ids.iter().filter_map(|id| self.assets.get(id).cloned()).collect()
    }

    pub fn get_fund(&self, fund: String) -> Option<FundView> {
        self.funds.get(&fund).map(|f| self.fund_view(f))
    }

    pub fn get_funds(&self) -> Vec<FundView> {
        self.all_funds().iter().map(|f| self.fund_view(f)).collect()
    }

    pub fn get_weights(&self, fund: String) -> Value {
        let f = self.fund(&fund);
        json!({
            "fund": f.id,
            "weights": f.weights.iter().map(|(a, b)| json!({ "asset": a, "bps": b })).collect::<Vec<_>>(),
            "cash_bps": f.cash_bps, "bell": f.last_reveal_bell, "edition": f.editions,
        })
    }

    pub fn get_reputation(&self, fund: String) -> Value {
        let f = self.fund(&fund);
        let root = self.last_rep_quarter.and_then(|q| self.rep_roots.get(&q).cloned());
        json!({ "fund": f.id, "score": f.reputation, "quarter": self.last_rep_quarter, "root": root,
                "cross_buy_allowed": f.reputation >= CROSS_MIN_REPUTATION })
    }

    pub fn get_cross_holdings(&self, fund: String) -> Vec<Value> {
        self.fund(&fund);
        self.fund_ids
            .iter()
            .filter_map(|t| {
                let coins = self.cross.get(&(fund.clone(), t.clone())).copied().filter(|c| *c > 0)?;
                let tf = self.funds.get(t)?;
                let price = pool_price_usd(tf.pool_near, tf.pool_coins, self.game_usd_per_near);
                Some(json!({ "target": t, "coins": U128(coins), "price_micro_usd": U128(price),
                             "value_micro_usd": U128(usd_for_coins(coins, price)),
                             "share_of_supply_bps": listed_common::math::mul_div(coins, BPS, tf.supply.max(1)) as u64 }))
            })
            .collect()
    }

    pub fn get_holding(&self, fund: String, account: AccountId) -> Value {
        let f = self.fund(&fund);
        let h = self.holding(&fund, &account);
        let now = env::block_timestamp();
        let load = if h.coins == 0 {
            0
        } else {
            exit_load_bps(now.saturating_sub(h.since_ns), self.clock.quarter_secs * 1_000_000_000, f.reputation, f.status == FundStatus::Retired)
        };
        json!({ "fund": fund, "account": account, "coins": U128(h.coins), "since_ns": U64(h.since_ns),
                "value_micro_usd": U128(usd_for_coins(h.coins, f.nav)), "exit_load_bps": load })
    }

    pub fn get_vault(&self) -> VaultView {
        let mut vaults = 0u128;
        let mut pending = 0u128;
        let mut pools = 0u128;
        let mut liabilities = 0u128;
        let mut liabilities_usd = 0u128;
        let mut rows = Vec::new();
        for f in self.all_funds() {
            let l = self.liabilities_yocto(&f);
            vaults += f.vault;
            pending += f.pending_sub_yocto;
            pools += f.pool_near;
            liabilities += l;
            liabilities_usd += usd_for_coins(Contract::outside_coins(&f), f.nav);
            rows.push(FundCoverage { fund: f.id.clone(), vault: U128(f.vault), liabilities: U128(l), coverage_bps: coverage(f.vault, l) });
        }
        let escrow: u128 = self
            .fund_ids
            .iter()
            .filter_map(|id| self.auctions.get(id))
            .filter(|a| !a.settled)
            .map(|a| a.highest_bid)
            .sum();
        VaultView {
            balance: U128(env::account_balance().as_yoctonear()),
            vaults: U128(vaults),
            reserve: U128(self.reserve),
            pending_subscriptions: U128(pending),
            pools: U128(pools),
            protocol_fees: U128(self.protocol_fees),
            auction_escrow: U128(escrow),
            liabilities: U128(liabilities),
            liabilities_micro_usd: U128(liabilities_usd),
            coverage_bps: coverage(vaults + self.reserve, liabilities),
            funds: rows,
        }
    }

    pub fn get_promise(&self, fund: String) -> Option<Value> {
        self.fund_view(&self.fund(&fund)).promise
    }

    pub fn get_dna(&self, fund: String) -> Option<Value> {
        self.fund_view(&self.fund(&fund)).dna
    }

    pub fn commit_preimage(&self, fund: String, bell: u64, weights: Vec<crate::types::WeightIn>, cash_bps: u16, salt: String) -> Value {
        let w = crate::types::weights_from(weights);
        let pre = crate::rules::commit_preimage(&fund, bell, &w, cash_bps, &salt);
        json!({ "preimage": pre, "hash": hex_encode(&env::sha256_array(pre.as_bytes())) })
    }

    pub fn get_promise_payout(&self) -> Option<Value> {
        self.distribution.as_ref().map(|d| {
            json!({ "season": d.season, "next_holder": d.next_holder, "holders": self.holders.len(),
                    "funds": d.rates.iter().map(|(f, r)| json!({ "fund": f, "rate": U128(*r) })).collect::<Vec<_>>() })
        })
    }

    pub fn get_clock_config(&self) -> Clock {
        self.clock.clone()
    }
}
