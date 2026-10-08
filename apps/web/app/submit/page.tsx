import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { items } from "@gitit/db";
import { GitHubClient, ingestRepo, ingestSkillsFromRepo, parseRepoRef, itemEmbeddingText } from "@gitit/core";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth";
import { embedder } from "@/lib/services";

export const dynamic = "force-dynamic";

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const session = await auth();

  async function submit(fd: FormData) {
    "use server";
    const s = await auth(); if (!s?.user?.id) redirect("/submit?error=Sign+in+first");
    const ref = parseRepoRef(String(fd.get("repo") ?? "")); if (!ref) redirect("/submit?error=Enter+owner%2Fname+or+a+GitHub+URL");
    const asSkills = fd.get("skills") === "on";
    const d = await db(); const gh = new GitHubClient(); const e = embedder();
    if (asSkills) {
      const rows = await ingestSkillsFromRepo(gh, ref.owner, ref.name);
      if (!rows.length) redirect("/submit?error=No+skills%2F*%2FSKILL.md+found");
      const vecs = await e.embed(rows.map(itemEmbeddingText));
      await d.insert(items).values(rows.map((r, i) => ({ ...r, embedding: vecs[i], embeddedAt: new Date(), submittedBy: s.user.id }))).onConflictDoNothing();
      redirect(`/?kind=skill&sort=new`);
    }
    const slug = `${ref.owner}/${ref.name}`;
    const [existing] = await d.select({ slug: items.slug }).from(items).where(and(eq(items.slug, slug), eq(items.kind, "repo")));
    if (existing) redirect(`/r/${slug}`);
    const row = await ingestRepo(gh, ref.owner, ref.name); if (!row) redirect("/submit?error=Repo+not+found");
    const [vec] = await e.embed([itemEmbeddingText(row)]);
    await d.insert(items).values({ ...row, embedding: vec, embeddedAt: new Date(), submittedBy: s.user.id });
    redirect(`/r/${slug}`);
  }

  return (
    <div className="card" style={{ maxWidth: 560 }}>
      <h1 style={{ marginTop: 0 }}>Submit a repo or skill pack</h1>
      {!session?.user && <p className="note">Sign in to submit.</p>}
      {error && <p style={{ color: "var(--down)" }}>{error}</p>}
      <form action={submit}>
        <label>GitHub repo<input name="repo" placeholder="owner/name or https://github.com/owner/name" required /></label>
        <label style={{ display: "block", marginTop: 10 }}><input type="checkbox" name="skills" style={{ width: "auto", marginRight: 6 }} />Index its <code>skills/*/SKILL.md</code> folders as agent skills</label>
        <button className="primary" style={{ marginTop: 12 }} disabled={!session?.user}>Submit</button>
      </form>
    </div>
  );
}
