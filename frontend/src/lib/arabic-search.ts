/**
 * Client-side search matching for Arabic text.
 *
 * Users type without harakat and rarely agree on أ/إ/آ, ى/ي or ة/ه, so a plain
 * `includes()` misses rows the user can see on screen. Every in-browser search
 * box in the app goes through here so they all behave the same way.
 *
 * Note this is client-side only — Postgres ILIKE does none of this folding, so
 * server-side search (invoices, cheques, …) is deliberately weaker.
 */

export function normalizeAr(input: string): string {
  return input
    .toLocaleLowerCase('ar')
    .replace(/[ً-ْٰـ]/g, '') // harakat + dagger alef + tatweel
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ىي]/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Splits a query into normalized tokens. An empty/whitespace query yields []. */
export function tokenize(query: string): string[] {
  const norm = normalizeAr(query);
  if (!norm) return [];
  return norm.split(/\s+/);
}

/**
 * True when every token appears somewhere in `fields`. Tokens are ANDed and
 * order-independent, so "قطن أبيض" matches a row named "أبيض قطن".
 * No tokens (empty query) matches everything; nullish fields are skipped.
 */
export function matchesTokens(tokens: string[], fields: Array<string | null | undefined>): boolean {
  if (tokens.length === 0) return true;
  const haystack = fields
    .filter((f): f is string => Boolean(f))
    .map(normalizeAr)
    .join(' ');
  return tokens.every((t) => haystack.includes(t));
}

/**
 * One-shot convenience for callers with a single row to test. Prefer hoisting
 * `tokenize()` out of a `.filter()` callback and calling `matchesTokens`.
 */
export function matchesQuery(query: string, fields: Array<string | null | undefined>): boolean {
  return matchesTokens(tokenize(query), fields);
}
