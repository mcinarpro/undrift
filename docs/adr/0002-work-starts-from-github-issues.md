# Work starts from GitHub Issues, which Undrift only reads

Undrift used to queue its own Tasks – prompts kept in its config – and to list every Session. Work
now starts from GitHub Issues instead: they already hold the context, Claude Code writes them during
a Session, and they outlive any one Session, so Start opens Claude Code on an Issue and Tasks are
gone. Undrift reads Issues through `gh` and never writes to GitHub, so the privacy contract stays a
read-only observer's; creating or closing an Issue happens on GitHub or inside a Session.
