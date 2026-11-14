use near_sdk::json_types::{U128, U64};
use near_sdk::{near, require};

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct CompanyParams {
    pub ticker: String,
    pub name: String,
    pub tagline: String,
    pub service: String,
    pub epoch_ns: U64,
    pub ipo_price: U128,
    pub ipo_target: U128,
    pub ipo_min: U128,
    pub ipo_max_epochs: u32,
    pub ipo_treasury_bps: u16,
    pub ipo_pool_bps: u16,

    #[serde(default)]
    pub pool_share_bps: u16,
    pub amm_fee_bps: u16,
    pub founder_fee_bps: u16,
    pub protocol_fee_bps: u16,
    pub buyback_bps: u16,
    pub dividend_bps: u16,
    pub retain_bps: u16,
    pub runway_epochs: u32,
    pub raise_discount_bps: u16,
    pub raise_max_supply_bps: u16,

    #[serde(default = "default_raise_cooldown_epochs")]
    pub raise_cooldown_epochs: u32,

    #[serde(default = "default_rights_twap_epochs")]
    pub rights_twap_epochs: u32,

    #[serde(default = "default_raise_streak_max_bps")]
    pub raise_streak_max_bps: u16,
    pub distress_grace_epochs: u32,
    pub payer_cap_bps: u16,
    pub accept_window_ns: U64,
    pub deliver_deadline_ns: U64,
    pub bell_tip: U128,
    pub gov_propose_bps: u16,
    pub gov_quorum_bps: u16,
    pub gov_pass_bps: u16,
    pub gov_override_bps: u16,
    pub gov_vote_epochs: u32,
    pub gov_timelock_epochs: u32,
    pub service_price: U128,
    pub price_min: U128,
    pub price_max: U128,
    pub spend_cap_per_epoch: U128,
}

pub const MAX_NAME_LEN: usize = 48;
pub const MAX_TAGLINE_LEN: usize = 140;
pub const MAX_SERVICE_LEN: usize = 32;

pub const MIN_PAYER_CAP_BPS: u16 = 500;

pub const MAX_PAYER_CAP_BPS: u16 = 5_000;

pub const MAX_FOUNDER_FEE_BPS: u16 = 1_000;
pub const MAX_PROTOCOL_FEE_BPS: u16 = 1_000;

pub const MIN_WINDOW_NS: u64 = 10_000_000_000;
pub const MAX_WINDOW_NS: u64 = 7 * 86_400_000_000_000;

pub const MIN_EPOCH_NS: u64 = 10_000_000_000;
pub const MAX_EPOCH_NS: u64 = 30 * 86_400_000_000_000;

pub const DEFAULT_RAISE_COOLDOWN_EPOCHS: u32 = 3;
pub const DEFAULT_RIGHTS_TWAP_EPOCHS: u32 = 3;
pub const DEFAULT_RAISE_STREAK_MAX_BPS: u16 = 4_000;
pub const MAX_RAISE_COOLDOWN_EPOCHS: u32 = 100;
pub const MAX_RIGHTS_TWAP_EPOCHS: u32 = 12;

fn default_raise_cooldown_epochs() -> u32 {
    DEFAULT_RAISE_COOLDOWN_EPOCHS
}
fn default_rights_twap_epochs() -> u32 {
    DEFAULT_RIGHTS_TWAP_EPOCHS
}
fn default_raise_streak_max_bps() -> u16 {
    DEFAULT_RAISE_STREAK_MAX_BPS
}

pub const MIN_QUORUM_BPS: u16 = 500;
pub const MIN_PASS_BPS: u16 = 5_000;

pub fn is_valid_ticker(ticker: &str) -> bool {
    (2..=6).contains(&ticker.len()) && ticker.bytes().all(|b| b.is_ascii_uppercase())
}

pub fn is_valid_service(service: &str) -> bool {
    !service.is_empty()
        && service.len() <= MAX_SERVICE_LEN
        && service.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn bps_ok(v: u16) -> bool {
    v <= 10_000
}

impl CompanyParams {

    pub fn assert_valid(&self) {
        require!(is_valid_ticker(&self.ticker), "params: ticker must be 2-6 uppercase letters");
        require!(
            !self.name.is_empty() && self.name.len() <= MAX_NAME_LEN,
            "params: name must be 1-48 characters"
        );
        require!(self.tagline.len() <= MAX_TAGLINE_LEN, "params: tagline is longer than 140 characters");
        require!(is_valid_service(&self.service), "params: service must be a lowercase slug");
        require!(
            self.epoch_ns.0 >= MIN_EPOCH_NS && self.epoch_ns.0 <= MAX_EPOCH_NS,
            "params: epoch_ns must be between 10 seconds and 30 days"
        );
        require!(self.ipo_price.0 > 0, "params: ipo_price must be positive");
        require!(self.ipo_target.0 > 0, "params: ipo_target must be positive");
        require!(
            self.ipo_min.0 > 0 && self.ipo_min.0 <= self.ipo_target.0,
            "params: ipo_min must be positive and not exceed ipo_target"
        );
        require!(self.ipo_max_epochs >= 1, "params: ipo_max_epochs must be at least 1");
        require!(
            self.ipo_treasury_bps as u32 + self.ipo_pool_bps as u32 == 10_000,
            "params: ipo_treasury_bps + ipo_pool_bps must equal 10000"
        );
        require!(self.ipo_pool_bps > 0, "params: ipo_pool_bps must be positive (the pool needs NEAR)");
        require!(bps_ok(self.pool_share_bps), "params: pool_share_bps must be <= 10000 (ignored)");
        require!(self.amm_fee_bps < 1_000, "params: amm_fee_bps must be below 1000 (10%)");
        require!(
            self.founder_fee_bps <= MAX_FOUNDER_FEE_BPS && self.protocol_fee_bps <= MAX_PROTOCOL_FEE_BPS,
            "params: founder_fee_bps and protocol_fee_bps must each be at most 1000 (10%)"
        );
        require!(
            self.buyback_bps as u32 + self.dividend_bps as u32 + self.retain_bps as u32 == 10_000,
            "params: buyback_bps + dividend_bps + retain_bps must equal 10000"
        );
        require!(self.raise_discount_bps < 10_000, "params: raise_discount_bps must be below 10000");
        require!(bps_ok(self.raise_max_supply_bps), "params: raise_max_supply_bps must be <= 10000");
        require!(
            self.raise_cooldown_epochs <= MAX_RAISE_COOLDOWN_EPOCHS,
            "params: raise_cooldown_epochs must be at most 100"
        );
        require!(
            (1..=MAX_RIGHTS_TWAP_EPOCHS).contains(&self.rights_twap_epochs),
            "params: rights_twap_epochs must be 1-12"
        );
        require!(bps_ok(self.raise_streak_max_bps), "params: raise_streak_max_bps must be <= 10000");
        require!(
            self.payer_cap_bps >= MIN_PAYER_CAP_BPS && self.payer_cap_bps <= MAX_PAYER_CAP_BPS,
            "params: payer_cap_bps must be 500-5000"
        );
        let window = |v: u64| (MIN_WINDOW_NS..=MAX_WINDOW_NS).contains(&v);
        require!(window(self.accept_window_ns.0), "params: accept_window_ns must be between 10 s and 7 days");
        require!(window(self.deliver_deadline_ns.0), "params: deliver_deadline_ns must be between 10 s and 7 days");
        require!(
            bps_ok(self.gov_propose_bps)
                && bps_ok(self.gov_quorum_bps)
                && bps_ok(self.gov_pass_bps)
                && bps_ok(self.gov_override_bps),
            "params: governance thresholds must be <= 10000"
        );
        require!(
            self.gov_override_bps >= self.gov_pass_bps,
            "params: gov_override_bps must be >= gov_pass_bps"
        );
        require!(
            self.gov_quorum_bps >= MIN_QUORUM_BPS && self.gov_pass_bps >= MIN_PASS_BPS,
            "params: gov_quorum_bps must be >= 500 and gov_pass_bps >= 5000"
        );
        require!(
            self.gov_vote_epochs >= 1 && self.gov_timelock_epochs >= 1,
            "params: gov_vote_epochs and gov_timelock_epochs must be at least 1"
        );
        require!(
            self.spend_cap_per_epoch.0 <= self.ipo_target.0,
            "params: spend_cap_per_epoch must not exceed ipo_target"
        );
        require!(self.price_min.0 > 0, "params: price_min must be positive");
        require!(self.price_min.0 <= self.price_max.0, "params: price_min must not exceed price_max");
        require!(
            self.service_price.0 >= self.price_min.0 && self.service_price.0 <= self.price_max.0,
            "params: service_price must be within [price_min, price_max]"
        );
    }
}

#[doc(hidden)]
pub mod fixtures {
    use super::*;

    pub fn demo(ticker: &str) -> CompanyParams {
        let near = 1_000_000_000_000_000_000_000_000u128;
        CompanyParams {
            ticker: ticker.to_string(),
            name: "Babel".into(),
            tagline: "Translation".into(),
            service: "translate".into(),
            epoch_ns: U64(120_000_000_000),
            ipo_price: U128(near / 100),
            ipo_target: U128(50 * near),
            ipo_min: U128(5 * near),
            ipo_max_epochs: 3,
            ipo_treasury_bps: 7000,
            ipo_pool_bps: 3000,
            pool_share_bps: 0,
            amm_fee_bps: 50,
            founder_fee_bps: 500,
            protocol_fee_bps: 100,
            buyback_bps: 5000,
            dividend_bps: 3000,
            retain_bps: 2000,
            runway_epochs: 7,
            raise_discount_bps: 2000,
            raise_max_supply_bps: 2000,
            raise_cooldown_epochs: DEFAULT_RAISE_COOLDOWN_EPOCHS,
            rights_twap_epochs: DEFAULT_RIGHTS_TWAP_EPOCHS,
            raise_streak_max_bps: DEFAULT_RAISE_STREAK_MAX_BPS,
            distress_grace_epochs: 2,
            payer_cap_bps: 2500,
            accept_window_ns: U64(60_000_000_000),
            deliver_deadline_ns: U64(600_000_000_000),
            bell_tip: U128(near / 1000),
            gov_propose_bps: 100,
            gov_quorum_bps: 1000,
            gov_pass_bps: 5000,
            gov_override_bps: 6600,
            gov_vote_epochs: 1,
            gov_timelock_epochs: 1,
            service_price: U128(near / 33),
            price_min: U128(near / 100),
            price_max: U128(near / 5),
            spend_cap_per_epoch: U128(near),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ticker_rules() {
        assert!(is_valid_ticker("BABEL"));
        assert!(is_valid_ticker("AB"));
        assert!(!is_valid_ticker("A"));
        assert!(!is_valid_ticker("TOOLONG"));
        assert!(!is_valid_ticker("babel"));
        assert!(!is_valid_ticker("BA1"));
    }

    #[test]
    fn service_rules() {
        assert!(is_valid_service("translate"));
        assert!(is_valid_service("near-research"));
        assert!(!is_valid_service("Translate"));
        assert!(!is_valid_service(""));
    }

    #[test]
    fn demo_params_are_valid() {
        fixtures::demo("BABEL").assert_valid();
    }

    #[test]
    #[should_panic(expected = "founder_fee_bps and protocol_fee_bps")]
    fn hostile_founder_fee_rejected() {
        let mut p = fixtures::demo("EVIL");
        p.founder_fee_bps = 9899;
        p.assert_valid();
    }

    #[test]
    #[should_panic(expected = "accept_window_ns")]
    fn instant_accept_window_rejected() {
        let mut p = fixtures::demo("EVIL");
        p.accept_window_ns = U64(1);
        p.assert_valid();
    }

    #[test]
    #[should_panic(expected = "payer_cap_bps")]
    fn uncapped_payers_rejected() {
        let mut p = fixtures::demo("EVIL");
        p.payer_cap_bps = 10_000;
        p.assert_valid();
    }

    #[test]
    #[should_panic(expected = "spend_cap_per_epoch")]
    fn unbounded_spend_cap_rejected() {
        let mut p = fixtures::demo("EVIL");
        p.spend_cap_per_epoch = U128(u128::MAX);
        p.assert_valid();
    }

    #[test]
    fn round2_fields_default_when_omitted() {

        let mut v = near_sdk::serde_json::to_value(fixtures::demo("BABEL")).unwrap();
        let obj = v.as_object_mut().unwrap();
        for k in ["raise_cooldown_epochs", "rights_twap_epochs", "raise_streak_max_bps", "pool_share_bps"] {
            obj.remove(k);
        }
        let p: CompanyParams = near_sdk::serde_json::from_value(v).unwrap();
        assert_eq!(p.raise_cooldown_epochs, 3);
        assert_eq!(p.rights_twap_epochs, 3);
        assert_eq!(p.raise_streak_max_bps, 4000);
        assert_eq!(p.pool_share_bps, 0);
        p.assert_valid();
        let mut legacy = p.clone();
        legacy.pool_share_bps = 1000;
        legacy.assert_valid();
    }

    #[test]
    #[should_panic(expected = "rights_twap_epochs")]
    fn rights_twap_window_must_be_positive() {
        let mut p = fixtures::demo("BABEL");
        p.rights_twap_epochs = 0;
        p.assert_valid();
    }

    #[test]
    #[should_panic(expected = "epoch_ns")]
    fn tiny_epoch_rejected() {
        let mut p = fixtures::demo("BABEL");
        p.epoch_ns = U64(5_000_000_000);
        p.assert_valid();
    }

    #[test]
    #[should_panic(expected = "buyback_bps")]
    fn split_must_sum() {
        let mut p = fixtures::demo("BABEL");
        p.retain_bps = 1000;
        p.assert_valid();
    }
}
