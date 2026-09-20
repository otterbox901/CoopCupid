import test from "node:test";
import assert from "node:assert/strict";
import { fuse, DEFAULT_RRF_K } from "../src/rank/rrf.ts";

const list = (name: string, ids: string[]) => ({
  name,
  // RRF uses position only, so the scores here are deliberately meaningless.
  docs: ids.map((id, i) => ({ id, score: 100 - i })),
});

test("a doc ranked well by both rankers beats one ranked well by only one", () => {
  const fused = fuse([
    list("lexical", ["b", "a", "c"]),
    list("vector", ["b", "c", "a"]),
  ]);
  assert.equal(fused[0]?.id, "b");
});

test("a doc found by only one ranker still beats docs the other ranked poorly", () => {
  // This is the property that makes fusion worth doing: a strong lexical hit
  // rescues a doc the vector ranker never returned at all. Absence costs it
  // one contribution, not the whole race.
  const deep = Array.from({ length: 40 }, (_, i) => `v${i}`);
  const fused = fuse([
    list("lexical", ["rescued"]),
    list("vector", deep),
  ]);

  const rescued = fused.findIndex((d) => d.id === "rescued");
  const midList = fused.findIndex((d) => d.id === "v10");
  assert.ok(rescued >= 0, "a doc in only one list must still appear");
  assert.ok(
    rescued < midList,
    `rescued (${rescued}) should outrank a mid-list vector hit (${midList})`,
  );
});

test("agreement across rankers beats a single strong hit", () => {
  // The flip side of the above, pinned deliberately: appearing in both lists
  // at decent ranks is a stronger signal than topping one list alone.
  // 'both' scores 1/62 + 1/61; 'solo' scores only 1/61.
  const fused = fuse([
    list("lexical", ["solo", "both"]),
    list("vector", ["both"]),
  ]);
  assert.equal(fused[0]?.id, "both");
});

test("raw score magnitude is ignored — only rank position counts", () => {
  // Same order, wildly different scales. Fusion output must be identical,
  // which is exactly why RRF was chosen over a weighted score blend.
  const a = fuse([
    { name: "r", docs: [{ id: "p", score: 1e6 }, { id: "q", score: 2 }] },
  ]);
  const b = fuse([
    { name: "r", docs: [{ id: "p", score: 0.9 }, { id: "q", score: 0.89 }] },
  ]);
  assert.deepEqual(a.map((d) => d.id), b.map((d) => d.id));
  assert.equal(a[0]?.score, b[0]?.score);
});

test("fused score matches the RRF formula", () => {
  const fused = fuse([list("one", ["a"]), list("two", ["a"])]);
  const expected = 2 * (1 / (DEFAULT_RRF_K + 1));
  assert.ok(Math.abs((fused[0]?.score ?? 0) - expected) < 1e-12);
});

test("per-ranker ranks are retained for explaining why a doc surfaced", () => {
  const fused = fuse([
    list("lexical", ["a", "b"]),
    list("vector", ["b", "a"]),
  ]);
  const a = fused.find((d) => d.id === "a");
  assert.deepEqual(a?.ranks, { lexical: 0, vector: 1 });
});

test("smaller k sharpens the advantage of top ranks", () => {
  const lists = [list("one", ["top", "second"]), list("two", ["second", "top"])];
  const sharp = fuse(lists, 1);
  const flat = fuse(lists, 1000);
  const spread = (f: ReturnType<typeof fuse>) =>
    (f[0]?.score ?? 0) - (f[1]?.score ?? 0);
  assert.ok(spread(sharp) >= spread(flat));
});

test("empty input produces empty output", () => {
  assert.deepEqual(fuse([]), []);
  assert.deepEqual(fuse([{ name: "empty", docs: [] }]), []);
});

test("ties break deterministically by id", () => {
  const fused = fuse([list("one", ["zebra", "alpha"]), list("two", ["alpha", "zebra"])]);
  assert.deepEqual(fused.map((d) => d.id), ["alpha", "zebra"]);
});
