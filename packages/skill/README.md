# reppit skill

Claude Code plugin (this directory) and a portable `SKILL.md` that also works in Codex, Cursor and any agentskills.io-compatible harness.

## Claude Code
```
/plugin marketplace add devwithjp/reppit
/plugin install reppit@reppit
```
Or from a local checkout: `claude --plugin-dir ./packages/skill`.

## Codex CLI
```
mkdir -p ~/.codex/skills && cp -r skills/find-repo ~/.codex/skills/
```
Add the MCP server to `~/.codex/config.toml`:
```toml
[mcp_servers.reppit]
command = "npx"
args = ["-y", "reppit-mcp"]
env = { REPPIT_API_KEY = "<personal token from reppit.dev/account, only needed for votes and compat reports>" }
```

## Any agent via skills CLI
```
npx skills add devwithjp/reppit/packages/skill/skills/find-repo
```
