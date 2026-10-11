import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Footer() {
  return (
    <footer className="foot"><div className="wrap">
      <div className="mono foot-links">
        <span>reppit.dev</span>
        <Link href="/?kind=repo">repos</Link>
        <Link href="/?kind=skill">skills</Link>
        <Link href="/?kind=mcp">mcp servers</Link>
        <Link href="/trust">how the trust score works</Link>
        <Link href="/agent">mcp server</Link>
        <Link href="/submit">submit a repo</Link>
      </div>
      <div className="foot-row">
        <span>Nothing here is sponsored. Ranking and placement are separate systems.</span>
        <ThemeToggle />
      </div>
    </div></footer>
  );
}
