# @gitit/skill

Claude Code plugin (this directory) and a portable `SKILL.md` that also works in Codex, Cursor and any agentskills.io-compatible harness.

## Claude Code
```
/plugin marketplace add jp/gitit
/plugin install gitit@gitit
```
Or from a local checkout: `claude --plugin-dir ./packages/skill`.

## Codex CLI
```
mkdir -p ~/.codex/skills && cp -r skills/find-repo ~/.codex/skills/
```
Add the MCP server to `~/.codex/config.toml`:
```toml
[mcp_servers.gitit]
command = "npx"
args = ["-y", "@gitit/mcp-server"]
```

## Any agent via skills CLI
```
npx skills add jp/gitit/packages/skill/skills/find-repo
```
