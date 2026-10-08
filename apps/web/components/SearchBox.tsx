export function SearchBox({ q = "", kind = "" }: { q?: string; kind?: string }) {
  return (
    <form action="/search" method="get" className="search">
      <input name="q" defaultValue={q} placeholder="Describe your problem: 'parse PDF tables in Python', 'a skill for writing Playwright tests'…" required minLength={3} />
      <select name="kind" defaultValue={kind} style={{ width: 120 }}>
        <option value="">All</option><option value="repo">Repos</option><option value="skill">Skills</option><option value="mcp">MCP</option>
      </select>
      <button className="primary">Find</button>
    </form>
  );
}
