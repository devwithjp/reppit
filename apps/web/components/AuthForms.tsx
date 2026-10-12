"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { signInWithPassword, signUp, sendMagicLink, type AuthResult } from "@/app/auth/actions";

function Message({ state, id }: { state: AuthResult | null; id: string }) {
  return (
    <p id={id} className={`auth-msg${state ? (state.ok ? " ok" : " bad") : ""}`} role={state && !state.ok ? "alert" : "status"}
      data-testid="auth-message" hidden={!state}>
      {state?.message}
    </p>
  );
}

export function LoginForm({ next }: { next: string }) {
  const [mode, setMode] = useState<"password" | "link">("password");
  // Kept across the mode switch so "email me a link instead" does not make you retype it.
  const [email, setEmail] = useState("");
  const [pwState, pwAction, pwPending] = useActionState(signInWithPassword, null);
  const [mlState, mlAction, mlPending] = useActionState(sendMagicLink, null);
  const signupHref = `/signup${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;

  if (mode === "link") {
    return (
      <form action={mlAction} className="auth-form" aria-describedby="ml-msg">
        <input type="hidden" name="next" value={next} />
        <label className="fld"><span className="lbl">Email</span>
          <input type="email" name="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={mlPending} data-testid="magic-link-submit">
          {mlPending ? "Sending" : "Email me a sign-in link"}
        </button>
        <Message state={mlState} id="ml-msg" />
        <p className="auth-alt">
          <button type="button" className="linkish" onClick={() => setMode("password")}>Use a password instead</button>
        </p>
      </form>
    );
  }

  return (
    <>
      <form action={pwAction} className="auth-form" aria-describedby="pw-msg">
        <input type="hidden" name="next" value={next} />
        <label className="fld"><span className="lbl">Email</span>
          <input type="email" name="email" autoComplete="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="fld"><span className="lbl">Password</span>
          <input type="password" name="password" autoComplete="current-password" required />
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={pwPending} data-testid="auth-submit">
          {pwPending ? "Signing in" : "Sign in"}
        </button>
        <Message state={pwState} id="pw-msg" />
      </form>
      <p className="auth-alt">
        <button type="button" className="linkish" onClick={() => setMode("link")}>Email me a sign-in link instead</button>
      </p>
      <p className="auth-alt">No account? <Link className="inline-link" href={signupHref}>Create one</Link>.</p>
    </>
  );
}

export function SignupForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, null);
  const loginHref = `/login${next !== "/" ? `?next=${encodeURIComponent(next)}` : ""}`;
  return (
    <>
      <form action={action} className="auth-form" aria-describedby="su-msg">
        <input type="hidden" name="next" value={next} />
        <label className="fld"><span className="lbl">Handle</span>
          <input name="handle" autoComplete="username" required minLength={2} maxLength={39}
            pattern="[A-Za-z0-9](?:[A-Za-z0-9\-]*[A-Za-z0-9])?" title="Letters, numbers and single hyphens" autoFocus
            aria-describedby="handle-hint" />
          <span className="hint" id="handle-hint">Shown next to your votes and reports. Letters, numbers, hyphens.</span>
        </label>
        <label className="fld"><span className="lbl">Email</span>
          <input type="email" name="email" autoComplete="email" required />
        </label>
        <label className="fld"><span className="lbl">Password</span>
          <input type="password" name="password" autoComplete="new-password" required minLength={8} aria-describedby="pw-hint" />
          <span className="hint" id="pw-hint">At least 8 characters.</span>
        </label>
        <button type="submit" className="btn btn-primary btn-block" disabled={pending} data-testid="auth-submit">
          {pending ? "Creating account" : "Create account"}
        </button>
        <Message state={state} id="su-msg" />
      </form>
      <p className="auth-alt">Already have one? <Link className="inline-link" href={loginHref}>Sign in</Link>.</p>
    </>
  );
}
