pub mod dna;
pub mod events;
pub mod math;
pub mod params;

pub use events::emit;
pub use math::{bps, mul_div, U256};
pub use params::CompanyParams;

pub const ONE_NEAR: u128 = 1_000_000_000_000_000_000_000_000;

pub const ONE_SHARE: u128 = 1_000_000_000_000_000_000;

pub const BPS_DENOM: u128 = 10_000;

pub const AGENT_METHODS: [&str; 8] = [
    "deliver",
    "set_service_price",
    "spend",
    "order_subcontract",
    "accept_subcontract",
    "reject_subcontract",
    "refuse",
    "post_letter",
];

pub const DEFAULT_AGENT_KEY_ALLOWANCE: u128 = ONE_NEAR;

pub const MAX_AGENT_KEY_ALLOWANCE: u128 = 10 * ONE_NEAR;
