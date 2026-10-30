"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServer } from "@/lib/supabase/server";
import { cleanHandle, userForAuth } from "@/lib/viewer";
import { safeNext } from "@/components/labels";

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
 */
export interface AuthResult {
  ok: boolean;
  message: string;
}

const UNAVAILABLE: AuthResult = { ok: false, message: "Sign-in is not available right now. Try again in a few minutes." };

async function origin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3100";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`;
}

function field(fd: FormData, name: string): string {
  const v = fd.get(name);
  return typeof v === "string" ? v.trim() : "";
}

/** Supabase error messages are fine to show, except ones that reveal whether an email exists. */
function plain(message: string): string {
  if (/invalid login credentials/i.test(message)) return "That email and password do not match.";
  if (/email not confirmed/i.test(message)) return "Confirm your email first. The link is in your inbox.";
  if (/rate limit/i.test(message)) return "Too many attempts. Wait a minute and try again.";
  if (/password should (be|contain)/i.test(message)) return "Use a longer password: at least 8 characters.";
  if (/email address .* is invalid/i.test(message)) return "That email address cannot receive mail. Check it and try again.";
  return message;
}

export async function signInWithPassword(_prev: AuthResult | null, fd: FormData): Promise<AuthResult> {
  const sb = await supabaseServer();
  if (!sb) return UNAVAILABLE;
  const email = field(fd, "email");
  const password = typeof fd.get("password") === "string" ? (fd.get("password") as string) : "";
  if (!email || !password) return { ok: false, message: "Enter your email and password." };
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, message: plain(error?.message ?? "Sign-in failed.") };
  await userForAuth(data.user.id, data.user.email, data.user.user_metadata?.handle);
  redirect(safeNext(fd.get("next")));
}

export async function signUp(_prev: AuthResult | null, fd: FormData): Promise<AuthResult> {
  const sb = await supabaseServer();
  if (!sb) return UNAVAILABLE;
  const email = field(fd, "email");
  const password = typeof fd.get("password") === "string" ? (fd.get("password") as string) : "";
  const handle = cleanHandle(field(fd, "handle") || email.split("@")[0] || "dev");
  if (!email.includes("@")) return { ok: false, message: "Enter a valid email address." };
  if (password.length < 8) return { ok: false, message: "Use a password of at least 8 characters." };
  const next = safeNext(fd.get("next"));
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { data: { handle }, emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { ok: false, message: plain(error.message) };
  if (data.session && data.user) {
    await userForAuth(data.user.id, data.user.email, handle);
    redirect(next);
  }
  return { ok: true, message: `Check ${email} for a confirmation link. It signs you in.` };
}

export async function sendMagicLink(_prev: AuthResult | null, fd: FormData): Promise<AuthResult> {
  const sb = await supabaseServer();
  if (!sb) return UNAVAILABLE;
  const email = field(fd, "email");
  if (!email.includes("@")) return { ok: false, message: "Enter a valid email address." };
  const next = safeNext(fd.get("next"));
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${await origin()}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  });
  if (error) {
    // Only a rate limit is worth telling the person. Anything else (an address the mail provider
    // refuses, a provider outage) is logged and answered like success, so the form never reveals
    // which addresses exist or how our mail is set up.
    if (/rate limit/i.test(error.message)) return { ok: false, message: plain(error.message) };
    console.error("[auth] magic link failed:", error.message);
  }
  // Same message whether or not the address has an account.
  return { ok: true, message: `If ${email} can sign in, a link is on its way. It expires in an hour.` };
}

export async function signOut(): Promise<void> {
  const sb = await supabaseServer();
  if (sb) await sb.auth.signOut();
  redirect("/");
}
