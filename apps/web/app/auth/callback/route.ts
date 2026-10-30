import { NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase/server";
import { userForAuth } from "@/lib/viewer";
import { safeNext } from "@/components/labels";

/**
 * Landing point for email confirmation and magic links. Handles both the PKCE `code` flow
 * and the `token_hash` flow, creates our users row, then sends the person where they were going.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const nextRaw = url.searchParams.get("next") ?? "/";
  const next = safeNext(nextRaw);
  const sb = await supabaseServer();
  if (!sb) return NextResponse.redirect(new URL("/login?error=unavailable", url));

  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;

  const { data, error } = code
    ? await sb.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await sb.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error("missing code") };

  if (error || !data.user) return NextResponse.redirect(new URL("/login?error=link", url));
  await userForAuth(data.user.id, data.user.email, data.user.user_metadata?.handle);
  return NextResponse.redirect(new URL(next, url));
}
