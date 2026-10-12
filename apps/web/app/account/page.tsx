import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { randomBytes, createHash } from "node:crypto";
import { eq, and, isNull, desc } from "drizzle-orm";
import { apiKeys, votes, items, agentCompatReports } from "@gitit/db";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";
import { signOut } from "@/app/auth/actions";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { ago } from "@/components/trust";
import { REASON_LABEL, AGENT_LABEL, itemHref } from "@/components/labels";
import { InstallCmd } from "@/components/InstallCmd";
import { scopeValues, scopeLabel } from "./scopes";

export const metadata: Metadata = { title: "Account" };
export const dynamic = "force-dynamic";

const FLASH = "reppit_new_token";
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

/** One personal token per person. The plain value exists only in this response; we store its sha256. */
async function createToken(fd: FormData) {
  "use server";
  const v = await getViewer(); if (!v) redirect("/login?next=%2Faccount");
  const d = await db();
  const [existing] = await d.select({ id: apiKeys.id }).from(apiKeys).where(and(eq(apiKeys.userId, v.id), isNull(apiKeys.revokedAt))).limit(1);
  if (existing) redirect("/account#token");
  const token = `reppit_${randomBytes(24).toString("base64url")}`;
  // Read only unless the box was ticked. The checkbox is off by default.
  const write = fd.get("write") === "on";
  await d.insert(apiKeys).values({ userId: v.id, keyHash: sha(token), label: "personal token", ...scopeValues(write) } as typeof apiKeys.$inferInsert);
  // Shown once: a 60-second httpOnly cookie scoped to this page, never the URL (history, logs, referrers).
  (await cookies()).set(FLASH, token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/account", maxAge: 60 });
  redirect("/account#token");
}

async function revokeToken(fd: FormData) {
  "use server";
  (await cookies()).delete({ name: FLASH, path: "/account" });
  const v = await getViewer(); if (!v) redirect("/login?next=%2Faccount");
  await (await db()).update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, String(fd.get("id"))), eq(apiKeys.userId, v.id)));
  redirect("/account#token");
}

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Faccount");
  const d = await db();
  const [keys, myVotes, myReports] = await Promise.all([
    d.select().from(apiKeys).where(and(eq(apiKeys.userId, viewer.id), isNull(apiKeys.revokedAt))).orderBy(desc(apiKeys.createdAt)).limit(1),
    d.select({ slug: items.slug, direction: votes.direction, reason: votes.reason, createdAt: votes.createdAt })
      .from(votes).innerJoin(items, eq(items.id, votes.itemId)).where(eq(votes.userId, viewer.id)).orderBy(desc(votes.createdAt)).limit(25),
    d.select({ slug: items.slug, agent: agentCompatReports.agent, status: agentCompatReports.status, createdAt: agentCompatReports.createdAt })
      .from(agentCompatReports).innerJoin(items, eq(items.id, agentCompatReports.itemId)).where(eq(agentCompatReports.userId, viewer.id)).orderBy(desc(agentCompatReports.createdAt)).limit(25),
  ]);

  const token = keys[0] ?? null;
  const flash = (await cookies()).get(FLASH)?.value;
  const created = flash && token && token.keyHash === sha(flash) ? flash : null;

  return (
    <>
      <Masthead viewer={viewer} next="/account" />
      <main className="wrap" id="main">
        <div className="head"><div className="head-row">
          <div className="l">
            <h1><span className="ow">@</span>{viewer.login}</h1>
            <p className="sub">{myVotes.length === 0 && myReports.length === 0
              ? "No votes or agent reports from you yet."
              : `${myVotes.length} vote${myVotes.length === 1 ? "" : "s"} and ${myReports.length} agent report${myReports.length === 1 ? "" : "s"} so far.`}</p>
          </div>
          <div className="r" style={{ textAlign: "right" }}>
            <form action={signOut}><button className="btn" type="submit">Sign out</button></form>
          </div>
        </div></div>

        <div className="cols">
          <div>
            <section className="sec">
              <h2>Your votes <em>newest first</em></h2>
              {myVotes.length === 0 ? (
                <p className="meta">None yet. <Link className="inline-link" href="/?sort=trusted">Browse the directory</Link> and vote on something you have used.</p>
              ) : (
                <table className="sig boxed"><tbody>
                  {myVotes.map((v) => (
                    <tr key={v.slug}>
                      <th scope="row"><Link className="mono kv-link" href={itemHref(v.slug)}>{v.slug}</Link></th>
                      <td className="val">{v.direction === "up"
                        ? <span className="tag pos"><span className="n">&#9650;</span> works as described</span>
                        : <span className="tag"><span className="n">&#9660;</span> {REASON_LABEL[v.reason ?? ""] ?? "downvote"}</span>}</td>
                      <td className="pts meta">{ago(v.createdAt)}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </section>
            <section className="sec">
              <h2>Your agent reports</h2>
              {myReports.length === 0 ? <p className="meta">None yet.</p> : (
                <table className="sig boxed"><tbody>
                  {myReports.map((r) => (
                    <tr key={`${r.slug}-${r.agent}`}>
                      <th scope="row"><Link className="mono kv-link" href={itemHref(r.slug)}>{r.slug}</Link></th>
                      <td className="val">{AGENT_LABEL[r.agent] ?? r.agent}: {r.status === "works" ? "works" : "broken"}</td>
                      <td className="pts meta">{ago(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody></table>
              )}
            </section>
          </div>

          <aside>
            <div className="panel" id="token">
              <div className="panel-h"><span className="lbl">Personal token</span></div>
              <div className="panel-b">
                <p className="meta" style={{ margin: "0 0 10px" }}>Lets your agent use the reppit CLI and MCP server.{" "}
                  A read-only token can only search and look up repos.</p>
                {created && (
                  <div style={{ margin: "0 0 12px" }}>
                    <p className="auth-msg ok" role="status" style={{ marginTop: 0, marginBottom: 6 }}>Copy it now. It is not shown again.</p>
                    <span data-testid="token-value" hidden>{created}</span>
                    <InstallCmd command={created} compact prompt="" label="Copy token" />
                  </div>
                )}
                {token ? (
                  <div className="token-row">
                    <span className="meta">Created {ago(token.createdAt)} &middot; {token.createdAt.toISOString().slice(0, 10)}<br />
                      <span className="token-scope" data-testid="token-scope">{scopeLabel(token)}</span></span>
                    <form action={revokeToken}><input type="hidden" name="id" value={token.id} />
                      <button className="btn btn-sm" type="submit" data-testid="token-revoke">Revoke</button></form>
                  </div>
                ) : (
                  <form action={createToken} className="token-form">
                    <label className="check">
                      <input type="checkbox" name="write" data-testid="token-write" />
                      <span>Allow voting and reports (write access)</span>
                    </label>
                    <button className="btn btn-sm" type="submit" data-testid="token-create">Create a token</button>
                  </form>
                )}
                {token && <p className="meta" style={{ margin: "10px 0 0" }}>Lost it, or want a different scope? Revoke this one and create another.</p>}
              </div>
            </div>
          </aside>
        </div>
      </main>
      <Footer />
    </>
  );
}
