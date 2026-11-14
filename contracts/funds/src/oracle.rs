use near_sdk::json_types::U128;
use near_sdk::serde_json::{json, Value};
use near_sdk::{env, near, require};

use listed_common::dna::{hex_decode32, hex_encode};

use crate::rules::*;
use crate::types::{Distribution, Dna, Fund, FundStatus, NavIn, ScoreIn};
use crate::{events, Contract, ContractExt};

impl Contract {

    fn apply_nav(&self, f: &mut Fund, n: &NavIn, bell: u64) {
        let value = n.value_micro_usd.0;
        require!(value > 0, format!("nav: {} value must be positive", f.id));
        let prev = f.value;
        if prev > 0 {
            let moved = prev.abs_diff(value);
            require!(
                moved <= listed_common::math::mul_div(prev, MAX_VALUE_MOVE_BPS, BPS),
                format!("nav: {} value moves more than 50% in one post (unit error?)", f.id)
            );
        }
        let computed = nav_of(value, f.supply);
        let tol = (computed / 10_000).max(2);
        require!(
            n.nav_micro_usd.0.abs_diff(computed) <= tol,
            format!("nav: {} posted nav {} does not match value/supply {}", f.id, n.nav_micro_usd.0, computed)
        );

        let bells = bell - f.nav_bell.unwrap_or(bell.saturating_sub(1)).min(bell);
        let holders_value = usd_for_coins(f.ledger_supply, computed);
        f.fees_accrued_usd += mgmt_fee(holders_value, bells.saturating_mul(self.clock.bell_secs));
        f.nav_bell = Some(bell);
        f.value = value;
        f.nav = computed.max(1);
    }

    fn pay_fees(&mut self, f: &mut Fund, quarter: u64, perf_usd: u128) -> Value {
        let mgmt_usd = f.fees_accrued_usd;
        f.fees_accrued_usd = 0;
        let due = usd_to_yocto(mgmt_usd + perf_usd, self.game_usd_per_near);
        let paid = due.min(f.vault);
        f.vault -= paid;
        let (buyback, seat, protocol) = fee_split(paid);
        let mut protocol_total = protocol;
        let seat_owner = self.nft.owner_by_id.get(&crate::nft::seat_id(&f.id));
        let me = env::current_account_id();
        match &seat_owner {
            Some(o) if *o != me => self.pay(o, seat),
            _ => protocol_total += seat,
        }

        let s = swap_buy(f.pool_near, f.pool_coins, buyback);
        let burned = if s.out > 0 {
            f.pool_near = s.new_near;
            f.pool_coins = s.new_coins;
            f.supply -= s.out;
            f.nav = nav_of(f.value, f.supply).max(1);
            events::mt_burn(&me, &f.id, s.out, "buyback & burn");
            events::emit(
                "buyback_burn",
                json!({ "fund": f.id, "quarter": quarter, "near": U128(buyback), "coins": U128(s.out),
                        "supply": U128(f.supply), "nav": U128(f.nav) }),
            );
            s.out
        } else {
            protocol_total += buyback;
            0
        };
        self.protocol_fees += protocol_total;
        let paid_json = json!({
            "fund": f.id, "quarter": quarter, "mgmt_usd": U128(mgmt_usd), "perf_usd": U128(perf_usd),
            "near_due": U128(due), "near": U128(paid), "near_buyback": U128(if burned > 0 { buyback } else { 0 }),
            "near_seat": U128(if matches!(&seat_owner, Some(o) if *o != me) { seat } else { 0 }),
            "near_protocol": U128(protocol_total), "seat_owner": seat_owner, "coins_burned": U128(burned),
        });
        events::emit("fee_paid", paid_json.clone());
        paid_json
    }
}

#[near]
impl Contract {

    pub fn post_nav(&mut self, bell: u64, prices_hash: String, navs: Vec<NavIn>) -> u32 {
        self.assert_operator();
        require!(self.last_nav_bell.is_none_or(|b| bell > b), "nav: bell must be after the last posted bell");
        require!(bell <= self.bell_at(env::block_timestamp()), "nav: that bell has not rung yet");
        require!(hex_decode32(&prices_hash).is_some(), "nav: prices_hash must be 64 hex chars");
        require!(!navs.is_empty(), "nav: no funds posted");
        let mut funds: Vec<Fund> = Vec::with_capacity(navs.len());
        for n in &navs {
            require!(!funds.iter().any(|f| f.id == n.fund), "nav: fund posted twice");
            let mut f = self.fund(&n.fund);
            self.apply_nav(&mut f, n, bell);
            funds.push(f);
        }
        for f in &funds {
            self.save(f.clone());
        }
        self.last_nav_bell = Some(bell);
        self.last_nav_at_ns = env::block_timestamp();
        self.last_prices_hash = prices_hash.clone();
        events::emit(
            "nav_posted",
            json!({
                "bell": bell, "prices_hash": prices_hash,
                "navs": funds.iter().map(|f| json!({
                    "fund": f.id, "nav": U128(f.nav), "value": U128(f.value), "supply": U128(f.supply),
                })).collect::<Vec<_>>(),
            }),
        );
        let coverage = self.coverage_parts();
        let mut filled = 0;
        for mut f in funds {
            filled += self.fill_queue(&mut f, coverage);
            f.nav = nav_of(f.value, f.supply).max(1);
            self.save(f);
        }
        filled
    }

    pub fn anchor_reputation(&mut self, quarter: u64, root: String, scores: Vec<ScoreIn>) {
        self.assert_operator();
        require!(self.last_rep_quarter.is_none_or(|q| quarter >= q), "reputation: quarter is older than the last anchor");
        require!(!root.is_empty() && root.len() <= 128, "reputation: root must be 1-128 chars");
        for s in &scores {
            require!(s.score <= 100, "reputation: score must be 0-100");
            let mut f = self.fund(&s.fund);
            f.reputation = s.score;
            self.save(f);
        }
        self.rep_roots.insert(quarter, root.clone());
        self.last_rep_quarter = Some(quarter);
        events::emit("reputation_anchored", json!({ "quarter": quarter, "root": root, "scores": scores }));
    }

    pub fn close_quarter(&mut self, quarter: u64, spy_return_bps: Option<i32>) {
        self.assert_keeper();
        require!(quarter < self.quarter_at(env::block_timestamp()), "quarter: this quarter has not ended");
        require!(self.last_closed_quarter.is_none_or(|q| quarter > q), "quarter: already closed");
        let mut rows = Vec::new();
        for id in self.fund_ids.clone() {
            let mut f = self.fund(&id);
            let ret = return_bps(f.nav_q_start, f.nav);
            let mut perf = 0;
            if let (Some(spy), true) = (spy_return_bps, f.status == FundStatus::Active) {
                perf = perf_fee(usd_for_coins(f.ledger_supply, f.nav), ret, spy as i64).min(f.value / 2);
                if perf > 0 {
                    f.value -= perf;
                    f.nav = nav_of(f.value, f.supply).max(1);
                }
            }
            let fees = self.pay_fees(&mut f, quarter, perf);
            rows.push(json!({
                "fund": f.id, "nav": U128(f.nav), "return_bps": ret,
                "beat_spy": spy_return_bps.map(|s| ret > s as i64), "turnover_bps": f.turnover_q_bps,
                "fees_near": fees["near"].clone(),
            }));
            f.turnover_q_bps = 0;
            f.nav_q_start = f.nav;
            self.save(f);
        }
        self.last_closed_quarter = Some(quarter);
        events::emit("quarter_closed", json!({ "quarter": quarter, "spy_return_bps": spy_return_bps, "funds": rows }));
    }

    pub fn settle_season(&mut self, season: u64, winner: Option<String>) {
        self.assert_keeper();
        require!(self.last_settled_season.is_none_or(|s| season > s), "season: already settled");
        require!(self.distribution.is_none(), "season: previous promise payout still running");
        let last_q = (season + 1) * self.clock.quarters - 1;
        require!(
            self.last_closed_quarter.is_some_and(|q| q >= last_q),
            format!("season: close quarter {last_q} first")
        );
        let mut rates = Vec::new();
        let mut promises = Vec::new();
        for id in self.fund_ids.clone() {
            let mut f = self.fund(&id);
            if let Some(p) = f.promise.clone().filter(|p| p.season == season) {
                let holder_coins = f.ledger_supply - f.pending_redeem_coins;
                let out = promise_outcome(holder_coins, f.nav_season_start, f.nav, p.target_bps, p.bond_coins);
                if out.coins > 0 {
                    f.manager_coins -= out.coins;
                    f.supply -= out.coins;
                    rates.push((f.id.clone(), out.rate));
                }
                let row = json!({
                    "fund": f.id, "season": season, "target_bps": p.target_bps, "return_bps": out.return_bps,
                    "kept": out.kept, "covered_usd": U128(out.covered_usd), "coins": U128(out.coins),
                    "bond_coins": U128(p.bond_coins),
                });
                events::emit("promise_settled", row.clone());
                promises.push(row);
                f.promise = None;
            }
            f.nav_season_start = f.nav;
            self.save(f);
        }
        let trophy = winner.map(|w| {
            let f = self.fund(&w);
            self.mint_trophy(season, &f)
        });
        self.last_settled_season = Some(season);
        events::emit(
            "season_settled",
            json!({ "season": season, "winner": trophy.as_ref().map(|t| &t.0), "trophy": trophy.as_ref().map(|t| &t.1),
                    "promises": promises }),
        );
        if !rates.is_empty() {
            let minted = rates.iter().map(|(f, _)| (f.clone(), 0u128)).collect();
            self.distribution = Some(Distribution { season, next_holder: 0, rates, minted });
            self.distribute_promises();
        }
    }

    pub fn distribute_promises(&mut self) -> bool {
        let Some(mut d) = self.distribution.take() else { return true };
        let len = self.holders.len();
        while d.next_holder < len && self.gas_ok() {
            let (fund, account) = self.holders.get(d.next_holder).cloned().unwrap();
            d.next_holder += 1;
            let Some(rate) = d.rates.iter().find(|(f, _)| *f == fund).map(|(_, r)| *r) else { continue };
            let held = self.holding(&fund, &account);
            let extra = listed_common::math::mul_div(held.coins, rate, RATE_ONE);
            if extra == 0 {
                continue;
            }
            self.credit(&fund, &account, extra, held.since_ns);
            let mut f = self.fund(&fund);
            f.supply += extra;
            f.ledger_supply += extra;
            self.save(f);
            if let Some(m) = d.minted.iter_mut().find(|(f, _)| *f == fund) {
                m.1 += extra;
            }
            events::mt_mint(&account, &fund, extra, "promise payout");
        }
        if d.next_holder < len {
            self.distribution = Some(d);
            return false;
        }
        for (fund, _) in &d.rates {
            let mut f = self.fund(fund);
            f.nav = nav_of(f.value, f.supply).max(1);
            self.save(f);
        }
        events::emit(
            "promise_distributed",
            json!({ "season": d.season, "minted": d.minted.iter().map(|(f, c)| json!({ "fund": f, "coins": U128(*c) })).collect::<Vec<_>>() }),
        );
        true
    }

    pub fn seal_dna(&mut self, fund: String, commit: String) {
        self.assert_operator();
        let c = hex_decode32(&commit).unwrap_or_else(|| env::panic_str("dna: commit must be 64 hex chars"));
        let mut f = self.fund(&fund);
        let season = self.season_of_quarter(self.quarter_at(env::block_timestamp()));
        require!(f.dna.as_ref().is_none_or(|d| d.season < season), "dna: already sealed this season");
        f.dna = Some(Dna { season, commit: c, seed: env::random_seed_array(), traits: None });
        self.save(f);
        events::emit("dna_sealed", json!({ "fund": fund, "season": season, "commit": commit }));
    }

    pub fn reveal_dna(&mut self, fund: String, salt: String) -> Vec<u8> {
        self.assert_operator();
        let s = hex_decode32(&salt).unwrap_or_else(|| env::panic_str("dna: salt must be 64 hex chars"));
        let mut f = self.fund(&fund);
        let mut d = f.dna.clone().unwrap_or_else(|| env::panic_str("dna: nothing sealed"));
        require!(d.traits.is_none(), "dna: already revealed");
        require!(self.last_settled_season.is_some_and(|x| x >= d.season), "dna: reveal after the season is settled");
        require!(listed_common::dna::dna_commit(&s) == d.commit, "dna: salt does not match the commit");
        let t = dna_traits5(&s, &d.seed);
        d.traits = Some(t);
        f.dna = Some(d.clone());
        self.save(f);
        events::emit(
            "dna_revealed",
            json!({ "fund": fund, "season": d.season, "salt": salt, "seed": hex_encode(&d.seed),
                    "risk": t[0], "patience": t[1], "greed": t[2], "loyalty": t[3], "smarts": t[4] }),
        );
        t.to_vec()
    }
}

pub fn dna_traits5(salt: &[u8; 32], seed: &[u8; 32]) -> [u8; 5] {
    let mut input = [0u8; 64];
    input[..32].copy_from_slice(salt);
    input[32..].copy_from_slice(seed);
    let h = env::sha256_array(input);
    core::array::from_fn(|i| 1 + h[i] % 10)
}
