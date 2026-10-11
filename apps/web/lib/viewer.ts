import "server-only";
import { eq } from "drizzle-orm";
import { users } from "@gitit/db";
import { auth } from "./auth";
import { db } from "./db";

/**
 * The signed-in person, as every page and route should see them.
 * Pages call getViewer() and never touch the auth provider directly, so the provider
 * (NextAuth today, Supabase Auth next) can change without touching UI code.
 */
export interface Viewer {
  id: string; // our users.id
  login: string; // display handle
  avatarUrl: string | null;
}

export async function getViewer(): Promise<Viewer | null> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return null;
  const d = await db();
  const [u] = await d.select({ id: users.id, login: users.login, avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, id));
  return u ?? null;
}
