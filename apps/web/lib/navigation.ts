export function loginHref(next: string, hash = ""): string {
  return `/login?next=${encodeURIComponent(`${next}${hash}`)}`;
}
