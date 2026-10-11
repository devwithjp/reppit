import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

/** Public project URL and browser-safe key. Supabase's newer "publishable" key name is accepted too. */
export function supabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anon ? { url, anon } : null;
}

/** Auth client bound to the request's cookies. Use in server components, actions and route handlers. */
export async function supabaseServer() {
  const env = supabaseEnv();
  if (!env) return null;
  const jar = await cookies();
  return createServerClient(env.url, env.anon, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll: (list) => {
        // Server components cannot set cookies; middleware refreshes the session instead.
        try {
          for (const { name, value, options } of list) jar.set(name, value, options);
        } catch {}
      },
    },
  });
}

/**
 * Privileged client for administrative calls only (creating confirmed test users, deleting
 * accounts). Never import this into anything that renders for the browser.
 */
export function supabaseAdmin() {
  const env = supabaseEnv();
  const secret = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env || !secret) return null;
  return createClient(env.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}
