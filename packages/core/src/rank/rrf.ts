/**
 * Reciprocal Rank Fusion — combines the lexical and vector rankings.
 *
 * Chosen over a weighted score blend on purpose: BM25 scores are unbounded and
 * corpus-dependent while cosine similarities sit in a narrow band, so blending
 * the raw numbers means inventing a normalization and tuning a weight against
 * a labeled set we do not have yet. RRF ignores scores and uses only rank
 * position, so it needs no tuning and cannot be broken by one ranker's scores
 * drifting. If the eval harness later shows a tuned blend wins, swap it then.
 *
 * Cormack et al., "Reciprocal Rank Fusion outperforms Condorcet and individual
 * rank learning methods" (SIGIR 2009).
 */

import type { ScoredDoc } from "./bm25.ts";

/**
 * Dampens the contribution of top ranks so a single ranker's #1 cannot
 * dominate the fusion. 60 is the value from the original paper and is a
 * reasonable default absent tuning data.
 */
export const DEFAULT_RRF_K = 60;

export type RankedList = {
  /** Identifies the ranker in debug output / ablations. */
  name: string;
  /** Ranked best-first. Only order is used; scores are ignored by design. */
  docs: ScoredDoc[];
};

export type FusedDoc = {
  id: string;
  score: number;
  /** Per-ranker 0-based rank, for explaining why something surfaced. */
  ranks: Record<string, number>;
};

/**
 * Fuse any number of ranked lists. A document missing from a list simply
 * contributes nothing for that ranker rather than being penalized, which is
 * what lets a strong lexical hit rescue a document the vector ranker missed
 * entirely — the main reason to fuse at all.
 */
export function fuse(lists: RankedList[], k: number = DEFAULT_RRF_K): FusedDoc[] {
  const scores = new Map<string, number>();
  const ranks = new Map<string, Record<string, number>>();

  for (const list of lists) {
    list.docs.forEach((doc, index) => {
      scores.set(doc.id, (scores.get(doc.id) ?? 0) + 1 / (k + index + 1));
      const existing = ranks.get(doc.id) ?? {};
      existing[list.name] = index;
      ranks.set(doc.id, existing);
    });
  }

  const fused: FusedDoc[] = [];
  for (const [id, score] of scores) {
    fused.push({ id, score, ranks: ranks.get(id) ?? {} });
  }

  // Deterministic ordering — the eval harness diffs rankings between runs.
  fused.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
  return fused;
}
