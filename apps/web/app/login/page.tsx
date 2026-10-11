import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "@/lib/viewer";
import { Masthead } from "@/components/Masthead";
import { Footer } from "@/components/Footer";
import { LoginForm } from "@/components/AuthForms";
import { safeNext } from "@/components/labels";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeNext((await searchParams).next);
  if (await getViewer()) redirect(next);
  return (
    <>
      <Masthead viewer={null} variant="bare" />
      <main className="wrap" id="main">
        <div className="auth">
          <h1>Sign in</h1>
          <p className="auth-lede">You need an account to vote and to report how a repo runs under your agent.
            Reading, searching and the trust score never need one.</p>
          <div className="panel"><div className="panel-b">
            <LoginForm next={next} />
          </div></div>
        </div>
      </main>
      <Footer />
    </>
  );
}
