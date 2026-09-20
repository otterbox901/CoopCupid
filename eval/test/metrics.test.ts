import test from "node:test";
import assert from "node:assert/strict";
import {
  ndcgAt,
  dcgAt,
  recallAt,
  precisionAt,
  evaluate,
  formatReports,
  type Label,
  type Labels,
} from "../src/metrics.ts";

const labels = (entries: Record<string, Label>): Labels =>
  new Map(Object.entries(entries));

test("a perfect ranking scores nDCG 1.0", () => {
  const l = labels({ a: "relevant", b: "relevant", c: "maybe", d: "not" });
  assert.equal(ndcgAt(["a", "b", "c", "d"], l, 4), 1);
});

test("nDCG punishes burying the good results", () => {
  const l = labels({ a: "relevant", b: "relevant", c: "not", d: "not" });
  const good = ndcgAt(["a", "b", "c", "d"], l, 4);
  const bad = ndcgAt(["c", "d", "a", "b"], l, 4);
  assert.ok(bad < good, `${bad} should be < ${good}`);
  assert.ok(bad > 0, "results still present should score above zero");
});

test("nDCG prefers graded order — relevant ahead of maybe", () => {
  const l = labels({ hi: "relevant", lo: "maybe" });
  assert.ok(ndcgAt(["hi", "lo"], l, 2) > ndcgAt(["lo", "hi"], l, 2));
});

test("nDCG is 0 when nothing is relevant, rather than NaN", () => {
  // Guards the divide-by-zero in the IDCG normalization.
  const l = labels({ a: "not", b: "not" });
  assert.equal(ndcgAt(["a", "b"], l, 2), 0);
});

test("unlabeled docs are treated as irrelevant", () => {
  const l = labels({ a: "relevant" });
  const withNoise = ndcgAt(["unlabeled", "a"], l, 2);
  assert.ok(withNoise < 1, "an unlabeled doc in slot 1 must cost something");
});

test("dcg applies the log2 position discount", () => {
  const l = labels({ a: "relevant" });
  // Rank 1 is undiscounted: gain 2 / log2(2) = 2.
  assert.equal(dcgAt(["a"], l, 1), 2);
  // Rank 2: gain 2 / log2(3).
  assert.ok(Math.abs(dcgAt(["x", "a"], l, 2) - 2 / Math.log2(3)) < 1e-12);
});

test("recall@k measures how many positives survive the cutoff", () => {
  const l = labels({ a: "relevant", b: "relevant", c: "relevant", d: "not" });
  assert.equal(recallAt(["a", "b", "d"], l, 3), 2 / 3);
  assert.equal(recallAt(["a", "b", "c"], l, 3), 1);
});

test("recall@k ignores positives found beyond the cutoff", () => {
  // The Stage 1 -> Stage 2 handoff is exactly this: past the cutoff is lost.
  const l = labels({ a: "relevant", b: "relevant" });
  assert.equal(recallAt(["a", "x", "b"], l, 2), 0.5);
});

test("recall threshold can include partial matches", () => {
  const l = labels({ a: "relevant", b: "maybe" });
  assert.equal(recallAt(["a"], l, 1, "relevant"), 1);
  assert.equal(recallAt(["a"], l, 1, "maybe"), 0.5);
});

test("precision@k divides by k, penalizing an under-filled list", () => {
  const l = labels({ a: "relevant" });
  // One hit in a 10-slot UI is 0.1, not 1.0.
  assert.equal(precisionAt(["a"], l, 10), 0.1);
  assert.equal(precisionAt(["a", "x", "y", "z"], l, 4), 0.25);
});

test("metrics do not throw on empty rankings or empty labels", () => {
  const empty: Labels = new Map();
  assert.equal(ndcgAt([], empty, 10), 0);
  assert.equal(recallAt([], empty, 10), 0);
  assert.equal(precisionAt([], empty, 10), 0);
  assert.equal(precisionAt(["a"], empty, 0), 0);
});

test("evaluate reports the standard triple and formats as a table", () => {
  const l = labels({ a: "relevant", b: "relevant" });
  const report = evaluate("fusion", ["a", "b"], l);
  assert.equal(report.name, "fusion");
  assert.equal(report.ndcg20, 1);
  assert.equal(report.recall150, 1);

  const table = formatReports([report, evaluate("lexical-only", ["b"], l)]);
  const lines = table.split("\n");
  assert.match(lines[0] ?? "", /ranker\s+nDCG@20\s+recall@150\s+P@10/);
  assert.equal(lines.length, 4, "header + rule + two rows");
  assert.match(table, /fusion/);
  assert.match(table, /lexical-only/);
});
