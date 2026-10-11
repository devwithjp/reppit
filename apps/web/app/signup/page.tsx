import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { SignupForm } from "@/components/AuthForms";
import { safeNext } from "@/components/labels";

export const metadata: Metadata = { title: "Create an account" };
export const dynamic = "force-dynamic";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getViewer()) redirect(next);
  return (
    <>
      <Masthead viewer={null} variant="bare" />
      <main className="wrap" id="main">
        <div className="auth">
          <h1>Create an account</h1>
          <p className="auth-lede">An account lets you vote and file agent reports. Every downvote you cast has to name a
            reason, and your handle is shown next to it.</p>
          <div className="panel"><div className="panel-b">
            <SignupForm next={next} />
          </div></div>
        </div>
      </main>
      <Footer />
    </>
  );
}
