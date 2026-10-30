import "server-only";
import { eq } from "drizzle-orm";
import { users, type User } from "@gitit/db";
import { supabaseServer } from "./supabase/server";
import { db } from "./db";

/**
 * The signed-in person, as every page and route should see them.
 * Pages call getViewer() and never touch the auth provider directly.
 */
export interface Viewer {
  id: string; // our users.id
  login: string; // display handle
  avatarUrl: string | null;
  isDev: boolean; // operators can remove abusive discussion content
  suspendedAt: Date | null;
}

/** Handles are lowercase letters, digits and dashes, 2 to 30 long. */
export function cleanHandle(raw: string): string {
  const h = raw.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  return h.length >= 2 ? h : `dev-${h}`.slice(0, 30);
}

/**
 * Our users row for a Supabase Auth user, created on first sight. Email accounts have no
 * GitHub history, so their votes start at the new-account weight; that is deliberate
 * abuse defence, not an oversight.
 */
export async function userForAuth(authUserId: string, email: string | undefined, handleHint?: string): Promise<User> {
  const d = await db();
  const [existing] = await d.select().from(users).where(eq(users.authUserId, authUserId));
  if (existing) return existing;
  const base = cleanHandle(handleHint || (email ?? "dev").split("@")[0]);
  for (let i = 0; i < 20; i++) {
    const login = i === 0 ? base : `${base}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const [taken] = await d.select({ id: users.id }).from(users).where(eq(users.login, login));
    if (taken) continue;
    const [row] = await d.insert(users).values({ authUserId, login, name: null, avatarUrl: null }).onConflictDoNothing().returning();
    if (row) return row;
    const [raced] = await d.select().from(users).where(eq(users.authUserId, authUserId));
    if (raced) return raced;
  }
  throw new Error("could not allocate a handle");
}

export async function getViewerUser(): Promise<User | null> {
  const sb = await supabaseServer();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  const au = data.user;
  if (!au) return null;
  return userForAuth(au.id, au.email, (au.user_metadata?.handle as string | undefined) ?? undefined);
}

export async function getViewer(): Promise<Viewer | null> {
  const u = await getViewerUser();
  return u ? { id: u.id, login: u.login, avatarUrl: u.avatarUrl, isDev: u.isDev, suspendedAt: u.suspendedAt } : null;
}
