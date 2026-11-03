//! Reads First (GLOSSARY.md § Reads First): what every Session in a Project loads before its
//! first prompt – `CLAUDE.md`, `AGENTS.md`, `CLAUDE.local.md`, the rules under `.claude/rules/`
//! that are not scoped to paths, and the frontmatter of each skill – as a size. Only sizes and
//! file names leave this module; the text stays here (AGENTS.md § Privacy contract).

use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Serialize, Clone, PartialEq, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct ReadsFirst {
    pub bytes: u64,
    /// Paths relative to the folder, in the order counted; a skill says that only its frontmatter is.
    pub files: Vec<String>,
}

const WHOLE: [&str; 3] = ["CLAUDE.md", "AGENTS.md", "CLAUDE.local.md"];

/// `None` when the folder has nothing to read, so the window shows nothing rather than 0.
pub fn read(cwd: &Path) -> Option<ReadsFirst> {
    let mut out = ReadsFirst::default();
    for name in WHOLE {
        if let Ok(meta) = std::fs::metadata(cwd.join(name)) {
            out.bytes += meta.len();
            out.files.push(name.to_owned());
        }
    }
    // A rule with a `paths` frontmatter loads only when a matching file is touched, not at start.
    for rule in markdown_in(&cwd.join(".claude/rules")) {
        let Ok(text) = std::fs::read_to_string(&rule) else { continue };
        if frontmatter(&text).is_some_and(|f| f.lines().any(|l| l.starts_with("paths:"))) {
            continue;
        }
        out.bytes += text.len() as u64;
        out.files.push(format!(".claude/rules/{}", file_name(&rule)));
    }
    // A skill's body loads on demand; its frontmatter is what every Session reads.
    let mut skills: Vec<PathBuf> = std::fs::read_dir(cwd.join(".claude/skills")).map(|d| d.flatten().map(|e| e.path()).collect()).unwrap_or_default();
    skills.sort();
    for skill in skills {
        let Ok(text) = std::fs::read_to_string(skill.join("SKILL.md")) else { continue };
        let Some(front) = frontmatter(&text) else { continue };
        out.bytes += front.len() as u64;
        out.files.push(format!(".claude/skills/{}/SKILL.md (frontmatter)", file_name(&skill)));
    }
    (!out.files.is_empty()).then_some(out)
}

/// The `.md` files directly in `dir`, sorted, since `read_dir` has no order.
fn markdown_in(dir: &Path) -> Vec<PathBuf> {
    let mut files: Vec<PathBuf> = std::fs::read_dir(dir)
        .map(|d| d.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|e| e == "md")).collect())
        .unwrap_or_default();
    files.sort();
    files
}

fn file_name(path: &Path) -> String {
    path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default()
}

/// The text between a leading `---` line and the next one; `None` without a frontmatter.
fn frontmatter(text: &str) -> Option<&str> {
    let rest = text.strip_prefix("---\n").or_else(|| text.strip_prefix("---\r\n"))?;
    let end = rest.find("\n---").map(|i| i + 1).or_else(|| rest.starts_with("---").then_some(0))?;
    Some(&rest[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("undrift-reads-first-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_instruction_files_add_up_and_an_empty_folder_is_none() {
        let dir = temp("files");
        assert_eq!(read(&dir), None);
        std::fs::write(dir.join("CLAUDE.md"), "@AGENTS.md\n").unwrap();
        std::fs::write(dir.join("AGENTS.md"), "# Rules\n").unwrap();
        let got = read(&dir).unwrap();
        assert_eq!(got.bytes, 11 + 8);
        assert_eq!(got.files, vec!["CLAUDE.md", "AGENTS.md"]);
    }

    #[test]
    fn a_rule_scoped_to_paths_is_left_out_and_a_skill_counts_its_frontmatter_only() {
        let dir = temp("rules");
        std::fs::create_dir_all(dir.join(".claude/rules")).unwrap();
        std::fs::create_dir_all(dir.join(".claude/skills/release")).unwrap();
        std::fs::write(dir.join(".claude/rules/always.md"), "Say why.\n").unwrap();
        std::fs::write(dir.join(".claude/rules/mobile.md"), "---\npaths:\n  - apps/mobile/**\n---\nCompose only.\n").unwrap();
        std::fs::write(dir.join(".claude/skills/release/SKILL.md"), "---\nname: release\n---\nA long body that loads on demand.\n").unwrap();
        let got = read(&dir).unwrap();
        assert_eq!(got.files, vec![".claude/rules/always.md", ".claude/skills/release/SKILL.md (frontmatter)"]);
        assert_eq!(got.bytes, 9 + "name: release\n".len() as u64);
    }

    #[test]
    fn a_frontmatter_is_the_text_between_the_dashes() {
        assert_eq!(frontmatter("---\nname: x\n---\nbody"), Some("name: x\n"));
        assert_eq!(frontmatter("---\n---\nbody"), Some(""));
        assert_eq!(frontmatter("no frontmatter\n---\n"), None);
        assert_eq!(frontmatter("---\nnever closed"), None);
    }
}
