use near_sdk::env;

#[allow(clippy::manual_div_ceil, clippy::assign_op_pattern, clippy::ptr_offset_with_cast)]
mod u256 {
    uint::construct_uint! {

        pub struct U256(4);
    }
}
pub use u256::U256;

const BPS: u128 = 10_000;

pub fn to_u128(v: U256) -> u128 {
    if v > U256::from(u128::MAX) {
        env::panic_str("math: value does not fit in u128");
    }
    v.as_u128()
}

pub fn mul_div(a: u128, b: u128, d: u128) -> u128 {
    if d == 0 {
        env::panic_str("math: division by zero");
    }
    to_u128(U256::from(a) * U256::from(b) / U256::from(d))
}

pub fn mul_div_ceil(a: u128, b: u128, d: u128) -> u128 {
    if d == 0 {
        env::panic_str("math: division by zero");
    }
    let num = U256::from(a) * U256::from(b);
    let d = U256::from(d);
    let q = num / d;
    let r = num % d;
    to_u128(if r.is_zero() { q } else { q + U256::one() })
}

pub fn bps(a: u128, bps: u16) -> u128 {
    mul_div(a, bps as u128, BPS)
}

pub fn add(a: u128, b: u128) -> u128 {
    a.checked_add(b).unwrap_or_else(|| env::panic_str("math: add overflow"))
}

pub fn sub(a: u128, b: u128) -> u128 {
    a.checked_sub(b).unwrap_or_else(|| env::panic_str("math: sub underflow"))
}

pub fn mul64(a: u64, b: u64) -> u64 {
    a.checked_mul(b).unwrap_or_else(|| env::panic_str("math: u64 mul overflow"))
}

pub fn add64(a: u64, b: u64) -> u64 {
    a.checked_add(b).unwrap_or_else(|| env::panic_str("math: u64 add overflow"))
}

pub fn u256_to_bytes(v: U256) -> [u8; 32] {
    v.to_little_endian()
}

pub fn u256_from_bytes(b: &[u8; 32]) -> U256 {
    U256::from_little_endian(b)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mul_div_handles_large_products() {
        let a = u128::MAX / 3;
        assert_eq!(mul_div(a, 3, 3), a);
        assert_eq!(mul_div(10, 3, 4), 7);
        assert_eq!(mul_div_ceil(10, 3, 4), 8);
        assert_eq!(mul_div_ceil(8, 1, 4), 2);
    }

    #[test]
    fn bps_math() {
        assert_eq!(bps(1_000_000, 500), 50_000);
        assert_eq!(bps(1, 5000), 0);
        assert_eq!(bps(u128::MAX, 10_000), u128::MAX);
    }

    #[test]
    #[should_panic(expected = "does not fit")]
    fn mul_div_overflow_panics() {
        mul_div(u128::MAX, u128::MAX, 1);
    }

    #[test]
    fn u256_roundtrip() {
        let v = U256::from(u128::MAX) * U256::from(12345u64);
        assert_eq!(u256_from_bytes(&u256_to_bytes(v)), v);
    }
}
