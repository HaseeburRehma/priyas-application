/**
 * Validates a `?next=` redirect target before we honour it.
 *
 * `router.replace(next)` and the OAuth `redirectTo` will happily follow
 * `//evil.com/x` or `/\evil.com/x` — both are interpreted by browsers as
 * protocol-relative URLs and end up on the attacker's host. We only
 * accept paths that start with a single slash and a path character.
 *
 * Note: this is intentionally conservative. URL-encoded or whitespace-
 * prefixed payloads (`%2F%2Fevil.com`, ` //evil.com`) are rejected too
 * because they don't start with the literal `/` followed by a non-slash,
 * non-backslash byte.
 */
export function safeNext(
  next: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!next) return fallback;
  // must start with `/` and NOT `//` or `/\`
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//") || next.startsWith("/\\")) return fallback;
  return next;
}
