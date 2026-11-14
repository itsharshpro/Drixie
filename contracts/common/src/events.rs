use near_sdk::serde_json::{self, Value};

pub const STANDARD: &str = "listed";
pub const VERSION: &str = "1.0.0";

pub fn format_event(event: &str, data: Value) -> String {
    let body = serde_json::json!({
        "standard": STANDARD,
        "version": VERSION,
        "event": event,
        "data": [data],
    });
    format!("EVENT_JSON:{}", body)
}

pub fn emit(event: &str, data: Value) {
    near_sdk::env::log_str(&format_event(event, data));
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formats_nep297_line() {
        let line = format_event("swap", serde_json::json!({"account": "a.near", "near": "1"}));
        assert!(line.starts_with("EVENT_JSON:"));
        let v: Value = serde_json::from_str(&line["EVENT_JSON:".len()..]).unwrap();
        assert_eq!(v["standard"], "listed");
        assert_eq!(v["version"], "1.0.0");
        assert_eq!(v["event"], "swap");
        assert_eq!(v["data"][0]["account"], "a.near");
    }
}
