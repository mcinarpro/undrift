# Undrift

A desktop cockpit for getting back into work left half-done. It opens on the **Loose Ends** –
the Projects where a Claude Code Session ran after the last commit and left changes behind – then
the GitHub **Issues ready to Start**, and resumes or starts one in a click.

Undrift routes you to the right Project folder without a model. It reads git and `~/.claude`
instead of asking, so a decision costs nothing, and it starts nothing by itself: the only process
it ever launches is a terminal running `claude`, when you click.

Tauri v2 bridge in Rust, Vite + React window. Linux first, a Windows build for the terminals.
MIT.

## Pages

- **Home** – the Loose Ends, newest first; beside them **Needs You**, the open Sessions waiting on
  you, busy, or gone quiet, and the Issues ready to Start.
- **Projects** – every Project as a card or a row, with a rail of filters: the groups – In motion,
  Drifting, Parked – the Loose Ends and the Focus.
- **Graph** – the Projects as a network: one hub, a node per Project, a dot per Session.
- **A page per Project** – its git state, its open and earlier Sessions, its Issues, and the
  actions: Resume, New Session, Start, Focus, Let Go. Hides are set in `config.json` for now.

The words – Project, Session, Loose End, Drift, Focus, Let Go – are defined in
[GLOSSARY.md](GLOSSARY.md). The visual system is [DESIGN.md](DESIGN.md). The decisions that would
look wrong without their reason are in [docs/adr/](docs/adr/).

## What it reads

| Source | What is kept |
| --- | --- |
| `~/.claude/sessions/<pid>.json` | the open Sessions: id, folder, busy or waiting |
| `~/.claude/projects/<slug>/<sessionId>.jsonl` | when each turn happened, and the title and last-prompt lines Claude Code writes for its own resume picker – never the prompt text, file contents or tool output |
| `git` in each Project folder (`rev-parse`, `log`, `status`, `diff`, `remote`) | the branch, the last commit, what is changed and what is unpushed, the days with a commit, the `origin` URL |
| `gh issue list`, `gh repo view`, `gh api user` | the open Issues, the repository's description, the account and its avatar |

Projects are discovered: every git root directly under `~/workspace`, plus every folder a Session
ran in. Undrift's own state lives in `~/.config/undrift/config.json` (roots, Hides, Focus, and
`terminal`, the terminal to open on Linux – empty takes `$TERMINAL`, then the first one on the
PATH) and `~/.local/share/undrift/` (the transcript cache, the Let Gos, the avatar).

## What it starts

Terminals running `claude` in a Project folder, and nothing else:

- **Resume** – `claude --resume <id>`, in the Session's folder.
- **New Session** – a bare `claude`.
- **Start** – `claude` with an Issue as its first prompt.

## Privacy

Undrift watches your own work, so the bridge is a read-only observer: under `~/.claude` it only
reads; in a Project folder it runs `git` and `gh` read-only – never `fetch`, never a write; over the
network it reaches GitHub alone, and never writes to it. It calls no model. The whole contract is
in [AGENTS.md](AGENTS.md).

## Run

```bash
bun install
bun tauri dev
```

Needs Rust (`rustup`), `gh` signed in for the Issues and the avatar, and on Linux the Tauri
packages: `libwebkit2gtk-4.1-dev`, `libayatana-appindicator3-dev`, `librsvg2-dev`,
`libssl-dev`.

Window: `bun run build`. Bridge: `cargo check` in `src-tauri/`. Releases are tagged `vX.Y.Z` on
`main`; the steps are in [AGENTS.md](AGENTS.md).
