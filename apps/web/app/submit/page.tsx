import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { eq, and } from "drizzle-orm";
import { items } from "@gitit/db";
import { GitHubClient, ingestRepo, ingestSkillsFromRepo, parseRepoRef, itemEmbeddingText } from "@gitit/core";
import { db } from "@/lib/db";
import { getViewer } from "@/lib/viewer";
import { embedder } from "@/lib/services";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { itemHref } from "@/components/labels";

export const metadata: Metadata = { title: "Submit a repo" };
export const dynamic = "force-dynamic";

const fail = (msg: string, repo = "") => redirect(`/submit?error=${encodeURIComponent(msg)}${repo ? `&repo=${encodeURIComponent(repo)}` : ""}`);

async function submit(fd: FormData) {
  "use server";
  const viewer = await getViewer();
  if (!viewer) redirect(`/login?next=${encodeURIComponent("/submit")}`);
  const raw = String(fd.get("repo") ?? "").trim();
  const ref = parseRepoRef(raw);
  if (!ref) fail("That is not a GitHub repo. Use owner/name or a github.com URL.", raw);
  const asSkills = fd.get("skills") === "on";
  const d = await db();
  const slug = `${ref!.owner}/${ref!.name}`;

  let target: string | null = null;
  let error: string | null = null;
  try {
    const gh = new GitHubClient();
    if (asSkills) {
      const rows = await ingestSkillsFromRepo(gh, ref!.owner, ref!.name);
      if (!rows.length) error = "No skills/*/SKILL.md folders found in that repo.";
      else {
        const vecs = await embedder().embed(rows.map(itemEmbeddingText));
        await d.insert(items).values(rows.map((r, i) => ({ ...r, embedding: vecs[i], embeddedAt: new Date(), submittedBy: viewer!.id }))).onConflictDoNothing();
        target = "/?kind=skill&sort=new";
      }
    } else {
      const [existing] = await d.select({ slug: items.slug }).from(items).where(and(eq(items.slug, slug), eq(items.kind, "repo")));
      if (existing) target = itemHref(existing.slug);
      else {
        const row = await ingestRepo(gh, ref!.owner, ref!.name);
        if (!row) error = "GitHub says that repo does not exist, or it is private.";
        else {
          const [vec] = await embedder().embed([itemEmbeddingText(row)]);
          await d.insert(items).values({ ...row, embedding: vec, embeddedAt: new Date(), submittedBy: viewer!.id });
          target = itemHref(slug);
        }
      }
    }
  } catch (e) {
    console.error("[submit] failed:", (e as Error).message);
    error = "GitHub did not answer, or rate-limited us. Nothing was saved. Try again in a few minutes.";
  }
  if (error || !target) fail(error ?? "Nothing was saved.", raw);
  redirect(target!);
}

export default async function SubmitPage({ searchParams }: { searchParams: Promise<{ error?: string; repo?: string }> }) {
  const { error, repo } = await searchParams;
  const viewer = await getViewer();
  return (
    <>
      <Masthead viewer={viewer} next="/submit" />
      <main className="wrap" id="main">
        <div className="auth wide">
          <h1>Submit a repo</h1>
          <p className="auth-lede">Give it a GitHub repo. Once it is indexed it is measured from its own record, before anybody
            votes. Where too little can be measured, its page says so rather than show a number. If it is already here
            you go straight to its page.</p>
          {!viewer && (
            <p className="auth-msg bad" role="status">You need to be signed in to submit.{" "}
              <Link className="inline-link" href="/login?next=%2Fsubmit">Sign in</Link></p>
          )}
          <div className="panel"><div className="panel-b">
            <form action={submit} className="auth-form">
              <label className="fld"><span className="lbl">GitHub repo</span>
                <input name="repo" defaultValue={repo} placeholder="owner/name or https://github.com/owner/name" required
                  autoComplete="off" spellCheck={false} data-testid="submit-repo-input" aria-describedby={error ? "submit-error" : undefined} />
              </label>
              <label className="check">
                <input type="checkbox" name="skills" />
                <span>Index its <code>skills/*/SKILL.md</code> folders as agent skills instead</span>
              </label>
              <button type="submit" className="btn btn-primary" disabled={!viewer} data-testid="submit-repo-button">Submit</button>
              <p className="auth-msg bad" id="submit-error" role="alert" data-testid="submit-error" hidden={!error}>{error}</p>
            </form>
          </div></div>
          <p className="meta" style={{ marginTop: 12 }}>Fetching from GitHub takes a few seconds. Nothing is ranked by who submitted it.</p>
        </div>
      </main>
      <Footer />
    </>
  );
}
