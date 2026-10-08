import NextAuth, { type DefaultSession, type NextAuthResult } from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { users } from "@gitit/db";
import { db } from "./db";

declare module "next-auth" {
  interface Session { user: DefaultSession["user"] & { id: string; login: string } }
}

const hasGitHub = !!(process.env.GITHUB_ID && process.env.GITHUB_SECRET);

const result: NextAuthResult = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    ...(hasGitHub ? [GitHub({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! })] : []),
    // Dev-only login when no GitHub OAuth app is configured. Never enabled in production.
    ...(!hasGitHub && process.env.NODE_ENV !== "production" ? [Credentials({
      name: "Dev login",
      credentials: { login: { label: "Username", type: "text" } },
      async authorize(c) {
        const login = String(c?.login ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
        if (!login) return null;
        const u = await upsertUser({ githubId: `dev:${login}`, login, name: login, avatarUrl: null, githubCreatedAt: new Date(Date.now() - 400 * 86_400_000), publicRepos: 5, followers: 0, isDev: true });
        return { id: u.id, name: u.login, email: null, image: null };
      },
    })] : []),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === "github" && profile) {
        const p = profile as { id?: number | string; login?: string; name?: string | null; avatar_url?: string; created_at?: string; public_repos?: number; followers?: number };
        await upsertUser({
          githubId: String(p.id), login: p.login ?? "unknown", name: p.name ?? null, avatarUrl: p.avatar_url ?? null,
          githubCreatedAt: p.created_at ? new Date(p.created_at) : null, publicRepos: p.public_repos ?? 0, followers: p.followers ?? 0, isDev: false,
        });
      }
      return true;
    },
    async jwt({ token, account, profile, user }) {
      if (account?.provider === "github" && profile) {
        const d = await db();
        const [u] = await d.select().from(users).where(eq(users.githubId, String((profile as { id: number | string }).id)));
        if (u) { token.uid = u.id; token.login = u.login; }
      } else if (user?.id && !token.uid) {
        token.uid = user.id; token.login = user.name ?? "dev";
      }
      return token;
    },
    async session({ session, token }) {
      session.user.id = token.uid as string; session.user.login = token.login as string;
      return session;
    },
  },
});

async function upsertUser(u: { githubId: string; login: string; name: string | null; avatarUrl: string | null; githubCreatedAt: Date | null; publicRepos: number; followers: number; isDev: boolean }) {
  const d = await db();
  const [row] = await d.insert(users).values(u)
    .onConflictDoUpdate({ target: users.githubId, set: { login: u.login, name: u.name, avatarUrl: u.avatarUrl, publicRepos: u.publicRepos, followers: u.followers } })
    .returning();
  return row;
}

// Explicit annotations avoid TS2742 (non-portable inferred types) under pnpm.
export const handlers: NextAuthResult["handlers"] = result.handlers;
export const auth: NextAuthResult["auth"] = result.auth;
export const signIn: NextAuthResult["signIn"] = result.signIn;
export const signOut: NextAuthResult["signOut"] = result.signOut;
