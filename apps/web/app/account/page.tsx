import { redirect } from "next/navigation";
import { randomBytes, createHash } from "node:crypto";
import { eq, and, isNull } from "drizzle-orm";
import { apiKeys } from "@gitit/db";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
export const dynamic = "force-dynamic";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ created?: string }> }) {
  const { created } = await searchParams;
  const session = await auth(); if (!session?.user?.id) redirect("/");
  const d = await db();
  const keys = await d.select().from(apiKeys).where(and(eq(apiKeys.userId, session.user.id), isNull(apiKeys.revokedAt)));

  async function create(fd: FormData) {
    "use server";
    const s = await auth(); if (!s?.user?.id) redirect("/");
    const key = `gitit_${randomBytes(24).toString("base64url")}`;
    await (await db()).insert(apiKeys).values({ userId: s.user.id, keyHash: createHash("sha256").update(key).digest("hex"), label: String(fd.get("label") ?? "default").slice(0, 60) });
    redirect(`/account?created=${encodeURIComponent(key)}`);
  }
  async function revoke(fd: FormData) {
    "use server";
    const s = await auth(); if (!s?.user?.id) redirect("/");
    await (await db()).update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, String(fd.get("id"))), eq(apiKeys.userId, s.user.id)));
    redirect("/account");
  }

  return (
    <div className="card" style={{ maxWidth: 640 }}>
      <h1 style={{ marginTop: 0 }}>API keys</h1>
      <p className="muted">Used by the MCP server and CLI for voting and compatibility reports, and for the free tier of 1,000 searches a month. Set <code>GITIT_API_KEY</code> in your agent&apos;s environment.</p>
      {created && <div className="note">Copy this key now, it is not shown again:<pre>{created}</pre></div>}
      <form action={create} className="inline"><input name="label" placeholder="label (e.g. laptop claude code)" /><button className="primary">Create key</button></form>
      <table style={{ width: "100%", marginTop: 12, fontSize: 14 }}><tbody>
        {keys.map((k) => <tr key={k.id}><td>{k.label}</td><td className="muted">{k.tier} · {k.monthlyLimit}/mo</td><td className="muted">{k.createdAt.toISOString().slice(0, 10)}</td><td style={{ textAlign: "right" }}><form action={revoke}><input type="hidden" name="id" value={k.id} /><button>Revoke</button></form></td></tr>)}
      </tbody></table>
    </div>
  );
}
