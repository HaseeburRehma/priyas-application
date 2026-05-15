/**
 * Sanitises a user-supplied search string before splicing it into a
 * PostgREST `.or()` filter (`name.ilike.%foo%`).
 *
 * Why this matters: PostgREST `.or()` uses `,` as the term separator and
 * `()` for grouping, so any attacker-controlled `,` or `(` inside the
 * spliced value breaks out of the `ilike.%…%` expression and lets them
 * append arbitrary new filter clauses — e.g. `,deleted_at.is.not.null`
 * or `,role.eq.admin`. Backslash is also stripped because PostgREST
 * uses it for escaping inside the same grammar.
 *
 * We also strip the SQL LIKE wildcards `%` and `_` so users can search
 * for literal punctuation without inadvertently widening the match.
 *
 * The length cap (default 200 chars) bounds the query work and is
 * defence-in-depth against accidental DoS on a query column that doesn't
 * have a trigram index.
 */
export function sanitizeQ(q: string, maxLen = 200): string {
  return q
    .slice(0, maxLen)
    .replace(/[%_,()\\]/g, "")
    .trim();
}
