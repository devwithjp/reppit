import Link from "next/link";
import { db } from "@/lib/db";
import { mcpCount } from "@/app/_data/items";
import { ThemeToggle } from "./ThemeToggle";

export async function Footer() {
  // The MCP servers link appears only once there are any; a failed count hides it rather than breaking the page.
  const hasMcp = await db().then(mcpCount).then((n) => n > 0, () => false);
  return (
    <footer className="foot"><div className="wrap">
      <div className="mono foot-links">
        <span>reppit.dev</span>
        <Link href="/?kind=repo">repos</Link>
        <Link href="/?kind=skill">skills</Link>
        {hasMcp && <Link href="/?kind=mcp">mcp servers</Link>}
        <Link href="/trust">how the trust score works</Link>
        <Link href="/agent">mcp server</Link>
        <Link href="/submit">submit a repo</Link>
        <Link href="/privacy">privacy</Link>
        <Link href="/terms">terms</Link>
      </div>
      <div className="foot-row">
        <span>Nothing here is sponsored.</span>
        <ThemeToggle />
      </div>
    </div></footer>
  );
}
