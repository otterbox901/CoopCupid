/**
 * Ranking metrics for the offline eval harness.
 *
 * These exist to answer one question the plan makes the gate for Phase 2:
 * does the ranker beat the board's own filters on a hand-labeled set? Every
 * metric here is a pure function of (ranking, labels) so the harness can run
 * ablations — keyword-only vs vector-only vs fusion vs fusion+rerank — and
 * show that each stage earns its cost instead of assuming it does.
 */

/** Graded relevance, assigned by hand during labeling. */
export type Label = "relevant" | "maybe" | "not";

/** Graded gain. "maybe" earns partial credit so near-misses are not scored as failures. */
export const GAIN: Record<Label, number> = {
  relevant: 2,
  maybe: 1,
  not: 0,
};

export type Labels = Map<string, Label>;

/** Unlabeled documents count as "not" — the labeled set is the ground truth. */
function gainOf(labels: Labels, id: string): number {
  return GAIN[labels.get(id) ?? "not"];
}

/**
 * Discounted cumulative gain over the top k.
 * Position discount is log2(rank+1) with rank 1-based, so the top result is
 * undiscounted and the decay is steep early — which matches how far down a
 * ranked list a student actually reads.
 */
export function dcgAt(ranking: string[], labels: Labels, k: number): number {
  let dcg = 0;
  const limit = Math.min(k, ranking.length);
  for (let i = 0; i < limit; i++) {
    const id = ranking[i];
    if (id === undefined) continue;
    dcg += gainOf(labels, id) / Math.log2(i + 2);
  }
  return dcg;
}

/**
 * nDCG@k — the headline ranking-quality number.
 *
 * Normalized against the best achievable ordering *of the labeled set*, so a
 * score of 1.0 means "put the known-good postings in the best possible order",
 * and scores are comparable across candidates with different numbers of good
 * matches. Returns 0 when nothing relevant exists, since no ranking can be
 * credited or blamed in that case.
 */
export function ndcgAt(ranking: string[], labels: Labels, k: number): number {
  const ideal = [...labels.entries()]
    .filter(([, label]) => GAIN[label] > 0)
    .sort((a, b) => GAIN[b[1]] - GAIN[a[1]])
    .map(([id]) => id);

  const idcg = dcgAt(ideal, labels, k);
  if (idcg === 0) return 0;
  return dcgAt(ranking, labels, k) / idcg;
}

/**
 * Fraction of all positives that survive into the top k.
 *
 * This is the metric that matters most for Stage 1: the reranker can only
 * reorder what recall hands it, so a good posting dropped here is lost for
 * good. Watch recall@150 specifically — if it is low, no amount of Stage 2
 * spending can recover it.
 */
export function recallAt(
  ranking: string[],
  labels: Labels,
  k: number,
  threshold: Label = "relevant",
): number {
  const minGain = GAIN[threshold];
  let totalPositives = 0;
  for (const label of labels.values()) {
    if (GAIN[label] >= minGain) totalPositives++;
  }
  if (totalPositives === 0) return 0;

  let found = 0;
  const limit = Math.min(k, ranking.length);
  for (let i = 0; i < limit; i++) {
    const id = ranking[i];
    if (id !== undefined && gainOf(labels, id) >= minGain) found++;
  }
  return found / totalPositives;
}

/**
 * Fraction of the top k that is actually good.
 *
 * Divides by k rather than by the number retrieved, so a short ranking is
 * penalized for under-filling the slots the UI will show.
 */
export function precisionAt(
  ranking: string[],
  labels: Labels,
  k: number,
  threshold: Label = "relevant",
): number {
  if (k <= 0) return 0;
  const minGain = GAIN[threshold];
  let hits = 0;
  const limit = Math.min(k, ranking.length);
  for (let i = 0; i < limit; i++) {
    const id = ranking[i];
    if (id !== undefined && gainOf(labels, id) >= minGain) hits++;
  }
  return hits / k;
}

export type EvalReport = {
  name: string;
  ndcg20: number;
  recall150: number;
  precision10: number;
};

/** Score one ranking on the standard triple used across all ablations. */
export function evaluate(name: string, ranking: string[], labels: Labels): EvalReport {
  return {
    name,
    ndcg20: ndcgAt(ranking, labels, 20),
    recall150: recallAt(ranking, labels, 150),
    precision10: precisionAt(ranking, labels, 10),
  };
}

/** Render ablation results as a fixed-width table for the terminal. */
export function formatReports(reports: EvalReport[]): string {
  const header = ["ranker", "nDCG@20", "recall@150", "P@10"];
  const rows = reports.map((r) => [
    r.name,
    r.ndcg20.toFixed(3),
    r.recall150.toFixed(3),
    r.precision10.toFixed(3),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => (row[i] ?? "").length)),
  );
  const line = (cells: string[]) =>
    cells.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map(line)].join("\n");
}
