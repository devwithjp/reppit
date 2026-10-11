import { getTableColumns } from "drizzle-orm";
import { apiKeys } from "@gitit/db";

/**
 * Personal-token scopes, written against the backend's `api_keys.scopes` column (read by default).
 * The column may not exist yet, so it is detected at runtime from the table definition:
 *   - absent: tokens are not scoped, so every token can act as you, and the page says so;
 *   - an array column: stored as ["read"] or ["read", "write"];
 *   - a text column: stored as "read" or "read,write".
 * WRITE_SCOPE is the scope that lets an agent vote and file agent reports. Change it here if the
 * backend names it differently.
 */
export const WRITE_SCOPE = "write";

const column = (getTableColumns(apiKeys) as Record<string, { columnType?: string } | undefined>).scopes;
export const SCOPES_SUPPORTED = !!column;
const isArray = column?.columnType === "PgArray";

/** Extra insert values for a new token, or nothing when scopes are not supported yet. */
export function scopeValues(write: boolean): Record<string, unknown> {
  if (!SCOPES_SUPPORTED) return {};
  const list = write ? ["read", WRITE_SCOPE] : ["read"];
  return { scopes: isArray ? list : list.join(",") };
}

/** Read a stored row's scopes, whatever shape the column has. */
export function readScopes(row: unknown): string[] {
  const v = (row as { scopes?: unknown }).scopes;
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string" && v.trim()) return v.split(/[,\s]+/).filter(Boolean);
  return ["read"];
}

/** One plain phrase for the list. */
export function scopeLabel(row: unknown): string {
  if (!SCOPES_SUPPORTED) return "can search, look up, vote and file agent reports (scopes not enforced yet)";
  return readScopes(row).includes(WRITE_SCOPE) ? "read and act as you: search, look up, vote, file agent reports" : "read only: search and look up repos";
}
