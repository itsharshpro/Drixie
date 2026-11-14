use near_sdk::json_types::{U128, U64};
use near_sdk::{near, AccountId};

use crate::rules::Weight;

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AssetKind {
    Stock,
    Startup,

    Crypto,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Asset {
    pub id: String,
    pub basket: String,
    pub kind: AssetKind,
    pub region: String,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Caps {
    pub startup_cap_bps: u16,
    pub basket_cap_bps: u16,
    pub turnover_bps: u16,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum FundStatus {
    Active,
    Retired,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Commit {
    pub hash: [u8; 32],
    pub bell: u64,
    pub at_ns: u64,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct PromiseInfo {
    pub season: u64,
    pub target_bps: u16,
    pub bond_bps: u16,
    pub bond_coins: u128,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Dna {
    pub season: u64,
    pub commit: [u8; 32],
    pub seed: [u8; 32],

    pub traits: Option<[u8; 5]>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Fund {
    pub id: String,
    pub name: String,
    pub mandate: String,
    pub caps: Caps,
    pub manager: AccountId,
    pub status: FundStatus,
    pub created_at_ns: u64,

    pub nav: u128,

    pub value: u128,

    pub supply: u128,

    pub manager_coins: u128,

    pub ledger_supply: u128,

    pub vault: u128,
    pub pending_sub_yocto: u128,
    pub pending_redeem_coins: u128,
    pub pool_near: u128,
    pub pool_coins: u128,
    pub weights: Vec<Weight>,
    pub cash_bps: u16,
    pub commit: Option<Commit>,
    pub last_reveal_bell: Option<u64>,
    pub editions: u32,
    pub turnover_q_bps: u32,
    pub reputation: u8,
    pub nav_q_start: u128,
    pub nav_season_start: u128,
    pub fees_accrued_usd: u128,

    pub nav_bell: Option<u64>,
    pub promise: Option<PromiseInfo>,
    pub dna: Option<Dna>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug, Default)]
pub struct Holding {
    pub coins: u128,
    pub since_ns: u64,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OrderSide {
    Subscribe,
    Redeem,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Order {
    pub id: u64,
    pub fund: String,
    pub account: AccountId,
    pub side: OrderSide,

    pub amount: u128,

    pub since_ns: u64,
    pub queued_at_ns: u64,

    pub after_bell: Option<u64>,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct SeatAuction {
    pub fund: String,
    pub highest_bid: u128,
    pub highest_bidder: Option<AccountId>,
    pub started_at_ns: u64,
    pub ends_at_ns: u64,
    pub settled: bool,

    pub proceeds_to_vault: bool,
}

#[near(serializers = [borsh])]
#[derive(Clone, Debug)]
pub struct Distribution {
    pub season: u64,
    pub next_holder: u32,

    pub rates: Vec<(String, u128)>,
    pub minted: Vec<(String, u128)>,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Clock {

    pub genesis_ns: U64,
    pub bell_secs: u64,
    pub quarter_secs: u64,
    pub quarters: u64,

    pub reveal_secs: u64,

    pub auction_secs: u64,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct WeightIn {
    pub asset: String,
    pub bps: u16,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct NavIn {
    pub fund: String,
    pub nav_micro_usd: U128,
    pub value_micro_usd: U128,
}

#[near(serializers = [json])]
#[derive(Clone, Debug)]
pub struct ScoreIn {
    pub fund: String,
    pub score: u8,
}

#[near(serializers = [json])]
#[derive(Clone, Debug, Default)]
pub struct ClockIn {
    pub genesis_ns: Option<U64>,
    pub bell_secs: Option<u64>,
    pub quarter_secs: Option<u64>,
    pub quarters: Option<u64>,
    pub reveal_secs: Option<u64>,
    pub auction_secs: Option<u64>,
}

pub fn weights_from(input: Vec<WeightIn>) -> Vec<Weight> {
    input.into_iter().map(|w| (w.asset, w.bps)).collect()
}
