"use server";

/**
 * Sign-in server actions. UI posts forms to these and never calls an auth provider itself.
 * Contract (stable — the UI depends on it):
 *
 *   signInWithPassword(prev, formData) — fields: email, password, next?
 *   signUp(prev, formData)             — fields: email, password, handle, next?
 *   sendMagicLink(prev, formData)      — fields: email, next?
 *   signOut()                          — no fields; redirects to "/"
 *
 * The first three return an AuthResult for useActionState, or redirect on success.
 * The implementation is swapped to Supabase Auth by the lead; until then they report
 * that sign-in is not configured.
 */
export interface AuthResult {
  ok: boolean;
  message: string;
}

const NOT_YET: AuthResult = { ok: false, message: "Sign-in is being set up. Try again shortly." };

export async function signInWithPassword(_prev: AuthResult | null, _formData: FormData): Promise<AuthResult> {
  return NOT_YET;
}

export async function signUp(_prev: AuthResult | null, _formData: FormData): Promise<AuthResult> {
  return NOT_YET;
}

export async function sendMagicLink(_prev: AuthResult | null, _formData: FormData): Promise<AuthResult> {
  return NOT_YET;
}

export async function signOut(): Promise<void> {
  const { signOut } = await import("@/lib/auth");
  await signOut({ redirectTo: "/" });
}
