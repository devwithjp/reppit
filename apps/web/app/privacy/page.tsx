import type { Metadata } from "next";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { getViewer } from "@/lib/viewer";

export const metadata: Metadata = { title: "Privacy" };
export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const viewer = await getViewer();
  return <>
    <Masthead viewer={viewer} next="/privacy" />
    <main className="wrap" id="main">
      <div className="head"><h1>Privacy</h1><p className="sub">What reppit stores, and why. Last updated 29 October 2026.</p></div>
      <section className="sec prose">
        <h2>What we collect</h2>
        <p>You can browse and search without an account. If you sign in, we store your account ID, handle, and the votes, comments, reports, submissions, or API tokens you create.</p>
        <p>Like most web services, our hosting provider receives basic request data such as your IP address, browser details, requested page, and time. We use it to run the service, prevent abuse, and fix failures.</p>
        <h2>Where the data comes from</h2>
        <p>Repository and skill records use public metadata from GitHub and public package registries. This includes names, links, activity dates, licence data, and maintenance signals.</p>
        <h2>Who processes it</h2>
        <p>Vercel hosts the website. Supabase provides the database and account system. GitHub and package registries provide public project data. Their own privacy terms apply when you use their services.</p>
        <h2>Control and retention</h2>
        <p>You may delete your own comments. API tokens are stored as one-way hashes and can be revoked. Operational logs are kept only as long as needed for security and reliability. To request an account or data deletion, use the public project contact listed on the reppit source page.</p>
        <h2>Cookies</h2>
        <p>We use the session storage needed to keep you signed in and remember basic site choices. We do not sell personal data or use third-party advertising cookies.</p>
      </section>
    </main>
    <Footer />
  </>;
}
