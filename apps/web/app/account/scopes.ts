import { TOKEN_SCOPES } from "@gitit/core";

/**
 * Personal-token scopes. `api_keys.scopes` is a text[] defaulting to {read}; "write" lets an
 * agent vote, file agent reports and submit repos as you. The API enforces it; this file only
 * shapes what the account page writes and shows.
 */
export const WRITE_SCOPE: (typeof TOKEN_SCOPES)[number] = "write";

/** Insert values for a new token. Read-only unless the person ticked the write box. */
export function scopeValues(write: boolean): { scopes: string[] } {
  return { scopes: write ? ["read", WRITE_SCOPE] : ["read"] };
}

/** One plain phrase for the token list. */
export function scopeLabel(row: { scopes?: string[] | null }): string {
  return (row.scopes ?? ["read"]).includes(WRITE_SCOPE)
    ? "read and act as you: search, look up, vote, file agent reports"
    : "read only: search and look up repos";
}
