# AGENTS.md

Undrift is a desktop cockpit for getting back into work left half-done: it opens on the Loose Ends –
Projects where a Session ran after the last commit and left changes behind – then the GitHub Issues
ready to Start, and resumes or starts one in a click. Tauri v2 bridge in Rust, Vite + React window. Linux first.

## Start here

1. `GLOSSARY.md`: Undrift's language. Use its terms in code, UI copy, issues and commits.
2. `DESIGN.md`: the visual system. Read it before any change to a view, a component or a style.
3. `docs/adr/`: the decisions that would look wrong without their reason.

## Privacy contract

Undrift watches someone's own work, so the bridge is a read-only observer:

- Under `~/.claude` it only reads. Its own state lives in `~/.config/undrift/` and
  `~/.local/share/undrift/`, written atomically (temp file, then rename).
- From a transcript it keeps usage numbers, the model, and the title and last-prompt lines
  Claude Code writes for its resume picker. Prompt text, file contents and tool output stay
  inside the parser and never reach the window or the cache.
- In a Project folder it runs `git` and `gh` read-only: never `fetch`, never a write. Every
  `gh` call has a timeout. From git it takes numbers, file names, the branch, the subjects of the
  last commit and of the commits not pushed, and the `origin` URL, never file contents.
- Over the network it reaches only GitHub: `gh` read-only for Issues and the NavUser, and that
  account's avatar, cached on disk. It never writes to GitHub.
- It calls no model. The only processes it starts are terminals running `claude`: in a
  Project folder for Resume, New Session and Start (an Issue as the first prompt).

## Rust ↔ window contract

- The TypeScript types mirror the `Serialize` structs of the bridge
  (`rename_all = "camelCase"`). A field changes on both sides in the same change.
- The files under `~/.claude` are Claude Code internals with no published schema. An unknown
  line or field is skipped (`.ok()?`, `let … else`) and the tick goes on.

## Verify

- Window: `bun run build`. Bridge: `cargo check` in `src-tauri/`.
- `cargo test` and any other test suite run only when Mehmet asks.

## Release

1. The same version in `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`.
2. Mehmet tags `vX.Y.Z` on `main` and pushes the tag.
3. A release workflow builds the Linux bundles and drafts a pre-release; Mehmet publishes it.

## Conventions

- bun is the package manager (`bun.lock`).
- **Mehmet runs every scaffold, install and dependency command himself** (`bun add`,
  `bunx shadcn`, `bun tauri add`, `cargo add`). Give him the command; write the code once he
  says it ran.
- shadcn components in `src/components/ui/` are the project's library: keep them exactly as
  generated, even when nothing imports them yet. Restyle them through the tokens or a wrapper
  (`Action` over `Button`), never by editing them.
- Platform code sits behind `#[cfg(target_os = "linux")]`, with a `not(linux)` fallback where
  the rest of the app needs one.
- Comments say why, in full sentences.
- Everything written is English, with an en dash (–) for asides.
- Commits follow Conventional Commits (`feat:`, `fix:`, `style:`, `docs:`, `chore:`). Agents
  propose the message; Mehmet commits and pushes. No attribution trailers.
