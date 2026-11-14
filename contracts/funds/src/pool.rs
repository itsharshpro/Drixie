use near_sdk::json_types::U128;
use near_sdk::serde_json::json;
use near_sdk::{env, near, require};

use crate::rules::{pool_price_usd, premium_bps, swap_buy, swap_sell, POOL_FEE_BPS};
use crate::types::Fund;
use crate::{events, Contract, ContractExt};

#[near(serializers = [json])]
pub struct PoolView {
    pub fund: String,
    pub near: U128,
    pub coins: U128,

    pub price_micro_usd: U128,
    pub nav_micro_usd: U128,
    pub premium_bps: i64,
    pub fee_bps: u16,
}

#[near(serializers = [json])]
pub struct SwapQuote {
    pub out: U128,
    pub fee: U128,
    pub price_after_micro_usd: U128,
}

impl Contract {
    pub(crate) fn pool_view(&self, f: &Fund) -> PoolView {
        let price = pool_price_usd(f.pool_near, f.pool_coins, self.game_usd_per_near);
        PoolView {
            fund: f.id.clone(),
            near: U128(f.pool_near),
            coins: U128(f.pool_coins),
            price_micro_usd: U128(price),
            nav_micro_usd: U128(f.nav),
            premium_bps: premium_bps(price, f.nav),
            fee_bps: POOL_FEE_BPS,
        }
    }

    pub(crate) fn emit_swap(&self, f: &Fund, account: &str, side: &str, near: u128, coins: u128, fee: u128) {
        events::emit(
            "swap",
            json!({
                "fund": f.id, "account": account, "side": side, "near": U128(near), "coins": U128(coins),
                "fee": U128(fee), "pool_near": U128(f.pool_near), "pool_coins": U128(f.pool_coins),
                "price_micro_usd": U128(pool_price_usd(f.pool_near, f.pool_coins, self.game_usd_per_near)),
                "nav_micro_usd": U128(f.nav),
            }),
        );
    }
}

#[near]
impl Contract {

    #[payable]
    pub fn swap_near_for_coin(&mut self, fund: String, min_out: U128) -> U128 {
        self.assert_not_paused();
        self.assert_not_distributing(&fund);
        let buyer = env::predecessor_account_id();
        require!(buyer != env::current_account_id(), "pool: the contract cannot trade its own pool");
        let near_in = env::attached_deposit().as_yoctonear();
        require!(near_in > 0, "pool: attach NEAR to buy coins");
        let mut f = self.fund(&fund);
        let s = swap_buy(f.pool_near, f.pool_coins, near_in);
        require!(s.out > 0, "pool: amount too small (or the pool is empty)");
        require!(s.out >= min_out.0, "pool: price moved; you would get fewer coins than min_out. Refresh the quote and retry");
        f.pool_near = s.new_near;
        f.pool_coins = s.new_coins;
        f.ledger_supply += s.out;
        self.credit(&fund, &buyer, s.out, env::block_timestamp());
        self.emit_swap(&f, buyer.as_str(), "buy", near_in, s.out, s.fee);
        events::mt_transfer(&env::current_account_id(), &buyer, &fund, s.out, Some("pool buy"));
        self.save(f);
        U128(s.out)
    }

    pub fn swap_coin_for_near(&mut self, fund: String, coins: U128, min_out: U128) -> U128 {
        self.assert_not_paused();
        self.assert_not_distributing(&fund);
        let seller = env::predecessor_account_id();
        require!(coins.0 > 0, "pool: coins must be positive");
        let mut f = self.fund(&fund);
        let s = swap_sell(f.pool_near, f.pool_coins, coins.0);
        require!(s.out > 0, "pool: amount too small (or the pool is empty)");
        require!(s.out >= min_out.0, "pool: price moved; you would get less NEAR than min_out. Refresh the quote and retry");
        self.debit(&fund, &seller, coins.0);
        f.pool_near = s.new_near;
        f.pool_coins = s.new_coins;
        f.ledger_supply -= coins.0;
        self.pay(&seller, s.out);
        self.emit_swap(&f, seller.as_str(), "sell", s.out, coins.0, s.fee);
        events::mt_transfer(&seller, &env::current_account_id(), &fund, coins.0, Some("pool sell"));
        self.save(f);
        U128(s.out)
    }

    pub fn quote_near_for_coin(&self, fund: String, near_in: U128) -> SwapQuote {
        let f = self.fund(&fund);
        let s = swap_buy(f.pool_near, f.pool_coins, near_in.0);
        SwapQuote {
            out: U128(s.out),
            fee: U128(s.fee),
            price_after_micro_usd: U128(pool_price_usd(s.new_near, s.new_coins, self.game_usd_per_near)),
        }
    }

    pub fn quote_coin_for_near(&self, fund: String, coins: U128) -> SwapQuote {
        let f = self.fund(&fund);
        let s = swap_sell(f.pool_near, f.pool_coins, coins.0);
        SwapQuote {
            out: U128(s.out),
            fee: U128(s.fee),
            price_after_micro_usd: U128(pool_price_usd(s.new_near, s.new_coins, self.game_usd_per_near)),
        }
    }

    pub fn get_pool(&self, fund: String) -> PoolView {
        self.pool_view(&self.fund(&fund))
    }
}
