//! One line of a session transcript, `~/.claude/projects/<slug>/<sessionId>.jsonl`, reduced
//! to the only thing Undrift keeps from messages: when a prompt or a reply happened. Prompt
//! text, replies and tool output never leave this function.

use serde::Deserialize;
use serde_json::Value;

/// A turn's timestamp (RFC 3339, UTC, as Claude Code writes it).
pub enum Parsed {
    Prompt { ts: String },
    Reply { ts: String },
}

#[derive(Deserialize, Default)]
#[serde(default, rename_all = "camelCase")]
struct Line {
    r#type: String,
    is_sidechain: bool,
    is_meta: bool,
    timestamp: String,
    tool_use_result: Option<Value>,
    message: Option<Message>,
}

#[derive(Deserialize, Default)]
#[serde(default)]
struct Message {
    content: Value,
}

/// Sub-agent lines (`isSidechain`) are skipped: their turns sit inside the session's own.
pub fn parse_line(line: &str) -> Option<Parsed> {
    // Cheap text checks run before the JSON parse: tool results are the longest lines and carry
    // nothing Undrift needs, and only user and assistant lines matter.
    if line.contains("\"toolUseResult\"") || !(line.contains("\"type\":\"assistant\"") || line.contains("\"type\":\"user\"")) {
        return None;
    }
    let l = serde_json::from_str::<Line>(line).ok()?;
    if l.is_sidechain || l.timestamp.is_empty() {
        return None;
    }
    match l.r#type.as_str() {
        "assistant" => Some(Parsed::Reply { ts: l.timestamp }),
        "user" if !l.is_meta && l.tool_use_result.is_none() && l.message.as_ref().is_some_and(|m| is_prompt(&m.content)) => {
            Some(Parsed::Prompt { ts: l.timestamp })
        }
        _ => None,
    }
}

/// A prompt typed by the user, not a tool result or an injected block.
fn is_prompt(content: &Value) -> bool {
    match content {
        Value::String(s) => !s.trim().is_empty() && !s.trim_start().starts_with('<'),
        Value::Array(parts) => {
            let kinds: Vec<&str> = parts.iter().filter_map(|p| p.get("type").and_then(Value::as_str)).collect();
            !kinds.contains(&"tool_result") && kinds.iter().any(|k| *k == "text" || *k == "image")
        }
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_prompts_and_replies_only() {
        let prompt = r#"{"type":"user","timestamp":"2026-10-30T20:00:00Z","message":{"content":"fix the build"}}"#;
        let injected = r#"{"type":"user","timestamp":"2026-10-30T20:00:01Z","message":{"content":"<command-name>/clear</command-name>"}}"#;
        let reply = r#"{"type":"assistant","timestamp":"2026-10-30T20:00:02Z","message":{"content":[]}}"#;
        let sidechain = r#"{"type":"assistant","isSidechain":true,"timestamp":"2026-10-30T20:00:03Z","message":{"content":[]}}"#;
        assert!(matches!(parse_line(prompt), Some(Parsed::Prompt { .. })));
        assert!(parse_line(injected).is_none());
        assert!(matches!(parse_line(reply), Some(Parsed::Reply { .. })));
        assert!(parse_line(sidechain).is_none());
    }
}
