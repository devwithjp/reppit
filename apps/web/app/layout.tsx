import "./globals.css";
import Link from "next/link";
import { auth, signIn, signOut } from "@/lib/auth";

export const metadata = { title: "gitit — community-ranked repos and agent skills", description: "Reddit for repos and agent skills. Describe your problem, get the top repos, install from your agent." };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const hasGitHub = !!(process.env.GITHUB_ID && process.env.GITHUB_SECRET);
  return (
    <html lang="en"><body>
      <header className="site"><div className="in">
        <Link href="/" className="brand">gitit</Link>
        <nav><Link href="/?sort=hot">Hot</Link><Link href="/?sort=top">Top</Link><Link href="/?sort=new">New</Link><Link href="/?kind=skill">Skills</Link><Link href="/submit">Submit</Link></nav>
        <span className="spacer" />
        {session?.user ? (
          <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}>
            <span className="muted" style={{ marginRight: 8 }}>@{session.user.login}</span>
            <Link href="/account" className="btn" style={{ marginRight: 8 }}>API keys</Link>
            <button>Sign out</button>
          </form>
        ) : hasGitHub ? (
          <form action={async () => { "use server"; await signIn("github"); }}><button className="primary">Sign in with GitHub</button></form>
        ) : (
          <form action={async (fd: FormData) => { "use server"; await signIn("credentials", { login: String(fd.get("login") ?? ""), redirectTo: "/" }); }} className="inline" style={{ margin: 0 }}>
            <input name="login" placeholder="dev username" style={{ width: 140 }} required />
            <button className="primary">Dev sign in</button>
          </form>
        )}
      </div></header>
      <main>{children}</main>
    </body></html>
  );
}
