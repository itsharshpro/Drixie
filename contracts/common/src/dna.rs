use near_sdk::env;

pub type Traits = [u8; 4];

pub fn hex_encode(bytes: &[u8]) -> String {
    const DIGITS: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(DIGITS[(b >> 4) as usize] as char);
        out.push(DIGITS[(b & 0x0f) as usize] as char);
    }
    out
}

fn nibble(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

pub fn hex_decode32(s: &str) -> Option<[u8; 32]> {
    let raw = s.as_bytes();
    if raw.len() != 64 {
        return None;
    }
    let mut out = [0u8; 32];
    for (i, pair) in raw.chunks(2).enumerate() {
        out[i] = (nibble(pair[0])? << 4) | nibble(pair[1])?;
    }
    Some(out)
}

pub fn dna_commit(salt: &[u8; 32]) -> [u8; 32] {
    env::sha256_array(salt)
}

pub fn dna_traits(salt: &[u8; 32], seed: &[u8; 32]) -> Traits {
    let mut input = [0u8; 64];
    input[..32].copy_from_slice(salt);
    input[32..].copy_from_slice(seed);
    let h = env::sha256_array(input);
    [1 + h[0] % 10, 1 + h[1] % 10, 1 + h[2] % 10, 1 + h[3] % 10]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_roundtrip_and_rejects_bad_input() {
        let bytes: [u8; 32] = core::array::from_fn(|i| (i * 7 + 3) as u8);
        let s = hex_encode(&bytes);
        assert_eq!(s.len(), 64);
        assert_eq!(hex_decode32(&s), Some(bytes));
        assert_eq!(hex_decode32(&s.to_uppercase()), Some(bytes));
        assert_eq!(hex_decode32(&s[..62]), None);
        assert_eq!(hex_decode32(&format!("{}zz", &s[..62])), None);
    }

    #[test]
    fn traits_test_vector() {
        let salt = [0x11u8; 32];
        let seed = [0x22u8; 32];
        assert_eq!(
            hex_encode(&dna_commit(&salt)),
            "02d449a31fbb267c8f352e9968a79e3e5fc95c1bbeaa502fd6454ebde5a4bedc"
        );

        let t = dna_traits(&salt, &seed);
        assert_eq!(t, [2, 8, 10, 6]);

        assert_eq!(t, dna_traits(&salt, &seed));
        assert_ne!(dna_traits(&salt, &seed), dna_traits(&salt, &[0x23u8; 32]));
    }
}
