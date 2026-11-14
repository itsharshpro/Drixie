use listed_common::math::{add, mul_div};
use listed_common::U256;

pub const ONE_COIN: u128 = 1_000_000_000_000_000_000;

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

pub const BPS: u128 = 10_000;

pub const RATE_ONE: u128 = 1_000_000_000_000_000_000;

pub const LAUNCH_NAV: u128 = 10_000_000;

pub const HOLDINGS: usize = 10;
pub const MIN_WEIGHT_BPS: u16 = 200;
pub const MAX_WEIGHT_BPS: u16 = 2_500;
pub const MAX_CASH_BPS: u16 = 2_000;
pub const INDIA_CAP_BPS: u16 = 3_000;
pub const MAX_STEP_BPS: u16 = 1_000;
pub const MAX_SWAPS: usize = 2;
pub const CROSS_TARGET_SUPPLY_CAP_BPS: u16 = 1_000;
pub const CROSS_OWN_VALUE_CAP_BPS: u16 = 2_000;
pub const CROSS_MIN_REPUTATION: u8 = 40;

pub const POOL_FEE_BPS: u16 = 30;
pub const EXIT_LOAD_BPS: u16 = 100;
pub const EXIT_LOAD_WAIVED_BELOW_REPUTATION: u8 = 25;

pub const MGMT_FEE_BPS_PER_YEAR: u128 = 200;

pub const YEAR_SECS: u128 = 31_536_000;
pub const PERF_FEE_BPS: u128 = 1_500;
pub const SPLIT_BUYBACK_BPS: u16 = 5_000;
pub const SPLIT_SEAT_BPS: u16 = 3_000;
pub const MAX_BOND_BPS: u16 = 3_000;
pub const START_REPUTATION: u8 = 60;

pub const MAX_VALUE_MOVE_BPS: u128 = 5_000;

pub type Weight = (String, u16);

pub fn usd_to_yocto(usd_micro: u128, usd_per_near: u64) -> u128 {
    mul_div(usd_micro, 1_000_000_000_000_000_000, usd_per_near as u128)
}

pub fn yocto_to_usd(yocto: u128, usd_per_near: u64) -> u128 {
    mul_div(yocto, usd_per_near as u128, 1_000_000_000_000_000_000)
}

pub fn coins_for_usd(usd_micro: u128, nav: u128) -> u128 {
    if nav == 0 {
        0
    } else {
        mul_div(usd_micro, ONE_COIN, nav)
    }
}

pub fn usd_for_coins(coins: u128, nav: u128) -> u128 {
    mul_div(coins, nav, ONE_COIN)
}

pub fn nav_of(value_micro: u128, supply: u128) -> u128 {
    if supply == 0 {
        0
    } else {
        mul_div(value_micro, ONE_COIN, supply)
    }
}

pub fn pool_price_usd(pool_near: u128, pool_coins: u128, usd_per_near: u64) -> u128 {
    if pool_coins == 0 {
        0
    } else {
        mul_div(pool_near, usd_per_near as u128, pool_coins)
    }
}

pub fn premium_bps(price: u128, nav: u128) -> i64 {
    if nav == 0 || price == 0 {
        return 0;
    }
    ((price as i128 - nav as i128) * BPS as i128 / nav as i128) as i64
}

pub fn return_bps(from: u128, to: u128) -> i64 {
    if from == 0 {
        return 0;
    }
    ((to as i128 - from as i128) * BPS as i128 / from as i128) as i64
}

pub fn valid_fund_id(id: &str) -> bool {
    !id.is_empty() && id.len() <= 16 && id.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-')
}

pub fn valid_asset_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 24
        && id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'.' || c == b'-' || c == b'_')
}

#[derive(Clone, Debug)]
pub struct AssetClass {
    pub basket: String,
    pub startup: bool,
    pub india: bool,
    pub crypto: bool,
}

pub fn check_portfolio<F>(
    weights: &[Weight],
    cash_bps: u16,
    class_of: F,
    startup_cap: u16,
    basket_cap: u16,
    crypto_cap: u16,
) -> Result<(), String>
where
    F: Fn(&str) -> Option<AssetClass>,
{
    if weights.len() != HOLDINGS {
        return Err(format!("weights: exactly {HOLDINGS} holdings required, got {}", weights.len()));
    }
    if cash_bps > MAX_CASH_BPS {
        return Err(format!("weights: cash {cash_bps} bps is above the {MAX_CASH_BPS} bps cap"));
    }
    let mut total: u32 = cash_bps as u32;
    let mut startup: u32 = 0;
    let mut india: u32 = 0;
    let mut crypto: u32 = 0;
    let mut baskets: Vec<(String, u32)> = Vec::new();
    for (i, (asset, bps)) in weights.iter().enumerate() {
        if weights[..i].iter().any(|(a, _)| a == asset) {
            return Err(format!("weights: {asset} is listed twice"));
        }
        if *bps < MIN_WEIGHT_BPS || *bps > MAX_WEIGHT_BPS {
            return Err(format!("weights: {asset} at {bps} bps is outside {MIN_WEIGHT_BPS}-{MAX_WEIGHT_BPS} bps"));
        }
        let class = class_of(asset).ok_or_else(|| format!("weights: {asset} is not in the universe"))?;
        total += *bps as u32;
        if class.startup {
            startup += *bps as u32;
        }
        if class.india {
            india += *bps as u32;
        }
        if class.crypto {
            crypto += *bps as u32;
        }
        match baskets.iter_mut().find(|(b, _)| *b == class.basket) {
            Some((_, sum)) => *sum += *bps as u32,
            None => baskets.push((class.basket.clone(), *bps as u32)),
        }
    }
    if total != BPS as u32 {
        return Err(format!("weights: holdings + cash must sum to 10000 bps, got {total}"));
    }
    if startup > startup_cap as u32 {
        return Err(format!("weights: startups at {startup} bps are above this fund's {startup_cap} bps cap"));
    }
    if crypto > crypto_cap as u32 {
        return Err(format!("weights: crypto at {crypto} bps is above this fund's {crypto_cap} bps cap"));
    }
    if india > INDIA_CAP_BPS as u32 {
        return Err(format!("weights: India at {india} bps is above the {INDIA_CAP_BPS} bps cap"));
    }
    if let Some((b, sum)) = baskets.iter().find(|(_, s)| *s > basket_cap as u32) {
        return Err(format!("weights: basket {b} at {sum} bps is above this fund's {basket_cap} bps cap"));
    }
    Ok(())
}

fn weight_of(ws: &[Weight], asset: &str) -> u16 {
    ws.iter().find(|(a, _)| a == asset).map(|(_, b)| *b).unwrap_or(0)
}

pub fn turnover_bps(old: &[Weight], old_cash: u16, new: &[Weight], new_cash: u16) -> u32 {
    let mut sum: u32 = (old_cash as i32 - new_cash as i32).unsigned_abs();
    for (a, b) in new {
        sum += (*b as i32 - weight_of(old, a) as i32).unsigned_abs();
    }
    for (a, b) in old {
        if !new.iter().any(|(n, _)| n == a) {
            sum += *b as u32;
        }
    }
    sum / 2
}

pub fn check_step(old: &[Weight], new: &[Weight]) -> Result<(), String> {
    if old.is_empty() {
        return Ok(());
    }
    let entering = new.iter().filter(|(a, _)| !old.iter().any(|(o, _)| o == a)).count();
    if entering > MAX_SWAPS {
        return Err(format!("rebalance: {entering} holdings swapped; at most {MAX_SWAPS} per bell"));
    }
    for (a, b) in new {
        let d = (*b as i32 - weight_of(old, a) as i32).unsigned_abs();
        if d > MAX_STEP_BPS as u32 {
            return Err(format!("rebalance: {a} moves {d} bps; at most {MAX_STEP_BPS} bps per bell"));
        }
    }
    for (a, b) in old {
        if !new.iter().any(|(n, _)| n == a) && *b > MAX_STEP_BPS {
            return Err(format!("rebalance: exiting {a} moves {b} bps; at most {MAX_STEP_BPS} bps per bell"));
        }
    }
    Ok(())
}

pub fn commit_preimage(fund: &str, bell: u64, weights: &[Weight], cash_bps: u16, salt: &str) -> String {
    let mut w: Vec<&Weight> = weights.iter().collect();
    w.sort_by(|a, b| a.0.as_bytes().cmp(b.0.as_bytes()));
    let body: Vec<String> = w.iter().map(|(a, b)| format!("{a}:{b}")).collect();
    format!("{fund}|{bell}|{}|cash:{cash_bps}|{salt}", body.join(","))
}

pub fn commit_hash(fund: &str, bell: u64, weights: &[Weight], cash_bps: u16, salt: &str) -> [u8; 32] {
    near_sdk::env::sha256_array(commit_preimage(fund, bell, weights, cash_bps, salt).as_bytes())
}

pub fn weights_text(weights: &[Weight]) -> String {
    weights.iter().map(|(a, b)| format!("{a}:{b}")).collect::<Vec<_>>().join(",")
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SwapOut {

    pub out: u128,

    pub fee: u128,
    pub new_near: u128,
    pub new_coins: u128,
}

pub fn swap_buy(pool_near: u128, pool_coins: u128, near_in: u128) -> SwapOut {
    if pool_near == 0 || pool_coins == 0 || near_in == 0 {
        return SwapOut { out: 0, fee: 0, new_near: pool_near, new_coins: pool_coins };
    }
    let fee = mul_div(near_in, POOL_FEE_BPS as u128, BPS);
    let net = near_in - fee;
    let out = mul_div(pool_coins, net, add(pool_near, net));
    SwapOut { out, fee, new_near: add(pool_near, near_in), new_coins: pool_coins - out }
}

pub fn swap_sell(pool_near: u128, pool_coins: u128, coins_in: u128) -> SwapOut {
    if pool_near == 0 || pool_coins == 0 || coins_in == 0 {
        return SwapOut { out: 0, fee: 0, new_near: pool_near, new_coins: pool_coins };
    }
    let gross = mul_div(pool_near, coins_in, add(pool_coins, coins_in));
    let fee = mul_div(gross, POOL_FEE_BPS as u128, BPS);
    let out = gross - fee;
    SwapOut { out, fee, new_near: pool_near - out, new_coins: add(pool_coins, coins_in) }
}

pub fn mgmt_fee(value_micro: u128, elapsed_secs: u64) -> u128 {
    mul_div(value_micro, MGMT_FEE_BPS_PER_YEAR * elapsed_secs as u128, BPS * YEAR_SECS)
}

pub fn perf_fee(value_micro: u128, quarter_ret_bps: i64, spy_ret_bps: i64) -> u128 {
    let excess = quarter_ret_bps as i128 - spy_ret_bps as i128;
    if excess <= 0 {
        return 0;
    }
    mul_div(value_micro, excess as u128 * PERF_FEE_BPS, BPS * BPS)
}

pub fn fee_split(total: u128) -> (u128, u128, u128) {
    let buyback = mul_div(total, SPLIT_BUYBACK_BPS as u128, BPS);
    let seat = mul_div(total, SPLIT_SEAT_BPS as u128, BPS);
    (buyback, seat, total - buyback - seat)
}

pub fn exit_load_bps(held_ns: u64, quarter_ns: u64, reputation: u8, retired: bool) -> u16 {
    if retired || reputation < EXIT_LOAD_WAIVED_BELOW_REPUTATION || held_ns >= quarter_ns {
        0
    } else {
        EXIT_LOAD_BPS
    }
}

pub fn blend_since(old_coins: u128, old_since: u64, added: u128, now: u64) -> u64 {
    let total = old_coins + added;
    if total == 0 || old_coins == 0 {
        return now;
    }
    let num = U256::from(old_coins) * U256::from(old_since) + U256::from(added) * U256::from(now);
    (num / U256::from(total)).as_u64()
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PromiseOutcome {
    pub return_bps: i64,
    pub kept: bool,

    pub covered_usd: u128,

    pub coins: u128,

    pub rate: u128,
}

pub fn promise_outcome(holder_coins: u128, nav_start: u128, nav_end: u128, target_bps: u16, bond_coins: u128) -> PromiseOutcome {
    let ret = return_bps(nav_start, nav_end);
    if ret >= target_bps as i64 || holder_coins == 0 || nav_end == 0 {
        return PromiseOutcome { return_bps: ret, kept: ret >= target_bps as i64, covered_usd: 0, coins: 0, rate: 0 };
    }
    let gap = (target_bps as i64 - ret) as u128;
    let shortfall = mul_div(usd_for_coins(holder_coins, nav_start), gap, BPS);
    let bond_usd = usd_for_coins(bond_coins, nav_end);
    let covered = shortfall.min(bond_usd);
    let coins = coins_for_usd(covered, nav_end).min(bond_coins);
    let rate = mul_div(coins, RATE_ONE, holder_coins);
    PromiseOutcome { return_bps: ret, kept: false, covered_usd: covered, coins, rate }
}
