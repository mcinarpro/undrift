//! The one way the bridge runs `gh`: read-only commands only, each killed after `TIMEOUT` so a
//! slow network never holds the bridge (AGENTS.md § Privacy contract).

use std::io::Read;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const TIMEOUT: Duration = Duration::from_secs(10);

/// Stdout of `gh`, or `None` when it fails or outlives `TIMEOUT`. Stdout is drained on its own
/// thread: a reply larger than the pipe buffer would otherwise block `gh` until the timeout.
pub fn run(args: &[&str]) -> Option<String> {
    let mut child = Command::new("gh")
        .args(args)
        .env("GH_PROMPT_DISABLED", "1")
        .env("GH_NO_UPDATE_NOTIFIER", "1")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdout = child.stdout.take()?;
    let reader = std::thread::spawn(move || {
        let mut out = String::new();
        stdout.read_to_string(&mut out).ok().map(|_| out)
    });
    let deadline = Instant::now() + TIMEOUT;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break Some(status),
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(100)),
            _ => {
                let _ = child.kill();
                let _ = child.wait();
                break None;
            }
        }
    };
    let out = reader.join().ok().flatten();
    status.filter(|s| s.success()).and(out)
}
