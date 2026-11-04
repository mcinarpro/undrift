//! Opens a terminal running `claude` (AGENTS.md § Privacy contract: the only processes Undrift
//! starts) – on Linux the terminal `config.json` names, else `$TERMINAL`, else the first one on
//! the PATH; Windows Terminal or a console window on Windows: `--resume <id>` in a Session's
//! folder for Resume, plain `claude` in a Project folder for New Session, or an Issue as the first
//! prompt in a Project folder for Start.

/// The first prompt Start gives a Session: the implement skill fetches the Issue itself, from the
/// repository of the folder it runs in.
pub fn start_prompt(issue: u32) -> String {
    format!("/mattpocock-skills:implement #{issue}")
}

pub fn resume(cwd: &str, terminal: &str, session_id: &str) -> Result<(), String> {
    // The id reaches `claude` as an argument, never through the shell, but anything other than a
    // session id has no business there.
    if session_id.is_empty() || !session_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
        return Err("not a session id".into());
    }
    open(cwd, terminal, &["--resume", session_id])
}

pub fn new_session(cwd: &str, terminal: &str) -> Result<(), String> {
    open(cwd, terminal, &[])
}

/// Start hands `claude` the session id Undrift chose, so the Session can be told apart later – the
/// Note it began from sits under its Card – without reading a word of the transcript.
pub fn start(cwd: &str, terminal: &str, issue: u32, session_id: &str) -> Result<(), String> {
    open(cwd, terminal, &["--session-id", session_id, &start_prompt(issue)])
}

#[cfg(target_os = "linux")]
mod linux {
    use std::path::Path;
    use std::process::Command;

    /// A terminal Undrift knows: the flag that sets the working folder of the new window, and what
    /// comes before the command it runs.
    struct Known {
        name: &'static str,
        workdir: &'static str,
        /// xfce4-terminal's `-e` takes one string and `-x` the rest of the line; gnome-terminal
        /// wants `--`; kitty runs whatever follows its options.
        exec: &'static str,
    }

    /// Tried in order when `$TERMINAL` is unset.
    const TERMINALS: &[Known] = &[
        Known { name: "ghostty", workdir: "--working-directory=", exec: "-e" },
        Known { name: "konsole", workdir: "--workdir", exec: "-e" },
        Known { name: "gnome-terminal", workdir: "--working-directory=", exec: "--" },
        Known { name: "xfce4-terminal", workdir: "--working-directory=", exec: "-x" },
        Known { name: "alacritty", workdir: "--working-directory", exec: "-e" },
        Known { name: "kitty", workdir: "--directory", exec: "" },
        Known { name: "x-terminal-emulator", workdir: "", exec: "-e" },
    ];

    /// A terminal named by `$TERMINAL` that is not in the list gets no folder flag and the common `-e`.
    const UNKNOWN: Known = Known { name: "", workdir: "", exec: "-e" };

    pub fn open(cwd: &str, terminal: &str, claude_args: &[&str]) -> Result<(), String> {
        if !Path::new(cwd).is_dir() {
            return Err(format!("{cwd} is not a folder"));
        }
        let (program, known) = pick(terminal)?;
        let mut cmd = Command::new(&program);
        cmd.current_dir(cwd);
        match known.workdir {
            "" => {}
            f if f.ends_with('=') => {
                cmd.arg(format!("{f}{cwd}"));
            }
            f => {
                cmd.arg(f).arg(cwd);
            }
        }
        // A login shell gets the user's PATH, since `claude` is rarely on a desktop launcher's.
        // The folder and the arguments go through positional parameters, never into the script.
        if !known.exec.is_empty() {
            cmd.arg(known.exec);
        }
        cmd.arg("bash").arg("-lc").arg(r#"cd "$0" && exec claude "$@""#).arg(cwd).args(claude_args);
        let mut child = cmd.spawn().map_err(|e| format!("{program}: {e}"))?;
        // Reaped whenever it ends, so a closed terminal never lingers as a zombie.
        std::thread::spawn(move || {
            let _ = child.wait();
        });
        Ok(())
    }

    /// The terminal `config.json` names, else `$TERMINAL`, else the first terminal on the PATH. A
    /// named one – a name or a path – must be found, since naming it says the list is wrong.
    fn pick(wanted: &str) -> Result<(String, &'static Known), String> {
        let wanted = Some(wanted.trim().to_owned()).filter(|t| !t.is_empty()).or_else(|| std::env::var("TERMINAL").ok().filter(|t| !t.trim().is_empty()));
        if let Some(wanted) = wanted {
            let name = Path::new(&wanted).file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
            let known = TERMINALS.iter().find(|k| k.name == name).unwrap_or(&UNKNOWN);
            return if on_path(&wanted) { Ok((wanted, known)) } else { Err(format!("terminal not found: {wanted}")) };
        }
        TERMINALS.iter().find(|k| on_path(k.name)).map(|k| (k.name.to_owned(), k)).ok_or_else(|| "no terminal found: set $TERMINAL".into())
    }

    fn on_path(program: &str) -> bool {
        if program.contains('/') {
            return Path::new(program).is_file();
        }
        std::env::var_os("PATH").is_some_and(|p| std::env::split_paths(&p).any(|d| d.join(program).is_file()))
    }
}

#[cfg(target_os = "windows")]
mod windows {
    use std::os::windows::process::CommandExt;
    use std::path::Path;
    use std::process::{Child, Command};

    /// The creation flag that gives a console program a window of its own.
    const CREATE_NEW_CONSOLE: u32 = 0x0000_0010;

    /// The terminal `config.json` names is a Linux setting: here Windows Terminal is the one tried.
    pub fn open(cwd: &str, _terminal: &str, claude_args: &[&str]) -> Result<(), String> {
        if !Path::new(cwd).is_dir() {
            return Err(format!("{cwd} is not a folder"));
        }
        // Windows Terminal, when it is there, opens a new window in the folder running `claude`.
        // It splits its command line on `;`, which neither a session id nor a Start prompt holds.
        // Without it, `claude` gets a console window of its own.
        let child = Command::new("wt.exe")
            .args(["-w", "new", "-d", cwd, "claude"])
            .args(claude_args)
            .spawn()
            .or_else(|_| Command::new("claude").args(claude_args).current_dir(cwd).creation_flags(CREATE_NEW_CONSOLE).spawn())
            .map_err(|e| format!("claude: {e}"))?;
        reap(child);
        Ok(())
    }

    /// Waited for whenever it ends, so the handle is released with the window.
    fn reap(mut child: Child) {
        std::thread::spawn(move || {
            let _ = child.wait();
        });
    }
}

#[cfg(target_os = "linux")]
use linux::open;

#[cfg(target_os = "windows")]
use windows::open;

#[cfg(not(any(target_os = "linux", target_os = "windows")))]
fn open(_cwd: &str, _terminal: &str, _claude_args: &[&str]) -> Result<(), String> {
    Err("opening a terminal is only built for Linux and Windows".into())
}
