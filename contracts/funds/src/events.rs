use near_sdk::serde_json::{json, Value};
use near_sdk::{env, AccountId};

pub const STANDARD: &str = "drixie";
pub const VERSION: &str = "1.0.0";

pub fn format_event(standard: &str, version: &str, event: &str, data: Value) -> String {
    let body = json!({ "standard": standard, "version": version, "event": event, "data": [data] });
    format!("EVENT_JSON:{body}")
}

pub fn emit(event: &str, data: Value) {
    env::log_str(&format_event(STANDARD, VERSION, event, data));
}

fn emit_mt(event: &str, data: Value) {
    env::log_str(&format_event("nep245", "1.0.0", event, data));
}

pub fn mt_mint(owner: &AccountId, fund: &str, amount: u128, memo: &str) {
    emit_mt("mt_mint", json!({ "owner_id": owner, "token_ids": [fund], "amounts": [amount.to_string()], "memo": memo }));
}

pub fn mt_burn(owner: &AccountId, fund: &str, amount: u128, memo: &str) {
    emit_mt("mt_burn", json!({ "owner_id": owner, "token_ids": [fund], "amounts": [amount.to_string()], "memo": memo }));
}

pub fn mt_transfer(from: &AccountId, to: &AccountId, fund: &str, amount: u128, memo: Option<&str>) {
    let mut d = json!({
        "old_owner_id": from, "new_owner_id": to, "token_ids": [fund], "amounts": [amount.to_string()],
    });
    if let Some(m) = memo {
        d["memo"] = json!(m);
    }
    emit_mt("mt_transfer", d);
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::serde_json;

    #[test]
    fn formats_drixie_line() {
        let line = format_event(STANDARD, VERSION, "nav_posted", json!({ "bell": 3 }));
        let v: Value = serde_json::from_str(line.strip_prefix("EVENT_JSON:").unwrap()).unwrap();
        assert_eq!(v["standard"], "drixie");
        assert_eq!(v["version"], "1.0.0");
        assert_eq!(v["event"], "nav_posted");
        assert_eq!(v["data"][0]["bell"], 3);
    }
}
