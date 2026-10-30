import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { LoginForm } from "@/components/AuthForms";
import { safeNext } from "@/components/labels";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const message = params.error === "link"
    ? "That sign-in link has expired or was already used. Request a new link below."
    : params.error === "unavailable" ? "Sign-in is not available right now. Try again in a few minutes." : null;
  if (await getViewer()) redirect(next);
  return (
    <>
      <Masthead viewer={null} variant="bare" />
      <main className="wrap" id="main">
        <div className="auth">
          <h1>Sign in</h1>
          <p className="auth-lede">Sign in to vote and add reports.
            You don&rsquo;t need an account to search.</p>
          <div className="panel"><div className="panel-b">
            {message && <p role="alert" className="auth-msg bad">{message}</p>}
            <LoginForm next={next} />
          </div></div>
        </div>
      </main>
      <Footer />
    </>
  );
}
