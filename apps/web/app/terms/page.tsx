import type { Metadata } from "next";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Terms" };
export const dynamic = "force-dynamic";

export default async function TermsPage() {
  const viewer = await getViewer();
  return <>
    <Masthead viewer={viewer} next="/terms" />
    <main className="wrap" id="main">
      <div className="head"><h1>Terms</h1><p className="sub">Simple rules for using reppit. Last updated 29 October 2026.</p></div>
      <section className="sec prose">
        <h2>Use the information as a starting point</h2>
        <p>Scores, rankings, comments, and recommendations can be incomplete or wrong. Check the source, licence, security, and fit before using code in a real project. reppit does not provide a warranty for listed software.</p>
        <h2>Community rules</h2>
        <p>Vote from real experience. Give an honest reason for a downvote. Do not post spam, harassment, secrets, malware, illegal material, or claims you know are false. Do not manipulate rankings or create accounts to evade limits.</p>
        <h2>Moderation</h2>
        <p>We may remove content, revoke tokens, limit access, or suspend accounts when needed to protect the service or its users. A deleted parent comment may remain as a placeholder so replies still make sense.</p>
        <h2>Automated access</h2>
        <p>Agents and scripts may use the published API, CLI, and MCP server within their stated limits. Do not bypass rate limits, access controls, or another person&rsquo;s account.</p>
        <h2>Service changes</h2>
        <p>The service may change, pause, or stop. These terms may also change. Continued use after an update means you accept the new terms.</p>
      </section>
    </main>
    <Footer />
  </>;
}
