/**
 * Pure fuzzy-matching helpers for the certification catalog (CR-CERT-002).
 * Dependency-free so they are trivially unit-testable.
 */

/** Levenshtein distance between two strings (case-insensitive). */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  if (s === t) return 0;
  if (!s.length) return t.length;
  if (!t.length) return s.length;

  const prev = new Array<number>(t.length + 1);
  const curr = new Array<number>(t.length + 1);
  for (let j = 0; j <= t.length; j++) prev[j] = j;

  for (let i = 1; i <= s.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= t.length; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      );
    }
    const tmp = prev;
    prev.splice(0, prev.length, ...curr);
    curr.splice(0, curr.length, ...tmp);
  }
  return prev[t.length];
}

/** Normalize a string for comparison: lowercase, collapse whitespace, strip punctuation. */
export function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Similarity score in [0, 1]. 1 = identical. Uses normalized Levenshtein on the
 * longest common prefix of the two normalized strings (codes like "AWS-SAA-C03"
 * share a prefix), falling back to the shorter-string ratio.
 */
export function similarityScore(a: string, b: string): number {
  const na = normalizeForMatch(a);
  const nb = normalizeForMatch(b);
  if (!na && !nb) return 1;
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen === 0 ? 1 : 1 - dist / maxLen;
}

/** True when the two strings are close enough to warrant a duplicate warning. */
export function isLikelyDuplicate(a: string, b: string, threshold = 0.8): boolean {
  return similarityScore(a, b) >= threshold;
}

export interface SimilarCandidate<T> {
  item: T;
  score: number;
}

/**
 * Rank `items` by fuzzy similarity of their `code` and `name` to a query.
 * Returns the top-N best matches (score >= threshold), descending.
 */
export function rankSimilar<T>(
  query: string,
  items: T[],
  toText: (item: T) => { code: string; name: string },
  opts: { limit?: number; threshold?: number } = {}
): SimilarCandidate<T>[] {
  const { limit = 5, threshold = 0.35 } = opts;
  const scored = items
    .map((item) => {
      const { code, name } = toText(item);
      const codeScore = similarityScore(query, code);
      const nameScore = similarityScore(query, name);
      return { item, score: Math.max(codeScore, nameScore) };
    })
    .filter((c) => c.score >= threshold)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
  return scored;
}