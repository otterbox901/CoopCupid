import test from "node:test";
import assert from "node:assert/strict";
import { tokenize, buildIndex, search } from "../src/rank/bm25.ts";

test("tokenize preserves skill names that a naive word split would destroy", () => {
  const tokens = tokenize("Experienced in C++, C#, and Node.js");
  assert.ok(tokens.includes("c++"), `expected c++ in ${JSON.stringify(tokens)}`);
  assert.ok(tokens.includes("c#"), `expected c# in ${JSON.stringify(tokens)}`);
  assert.ok(tokens.includes("node.js"), `expected node.js in ${JSON.stringify(tokens)}`);
});

test("tokenize drops stopwords and sub-2-char tokens", () => {
  const tokens = tokenize("the and for a I x");
  assert.deepEqual(tokens, []);
});

test("tokenize strips trailing periods so sentence-final terms match", () => {
  assert.deepEqual(tokenize("We use Rust."), ["we", "use", "rust"]);
});

test("a rare term outranks a common one", () => {
  // "engineer" appears everywhere; "fpga" appears once. A query for both
  // should put the fpga doc first, which is the whole point of IDF.
  const index = buildIndex([
    { id: "a", text: "software engineer building web services" },
    { id: "b", text: "software engineer working on distributed systems" },
    { id: "c", text: "software engineer designing fpga accelerators" },
    { id: "d", text: "software engineer writing documentation" },
  ]);

  const results = search(index, "engineer fpga");
  assert.equal(results[0]?.id, "c");
});

test("length normalization stops a long doc winning on padding alone", () => {
  // Both docs mention rust once. The short one is more about rust, so it wins.
  const filler = "unrelated content about various other topics ".repeat(40);
  const index = buildIndex([
    { id: "short", text: "rust systems programming" },
    { id: "long", text: `rust ${filler}` },
  ]);

  const results = search(index, "rust");
  assert.equal(results[0]?.id, "short");
});

test("search returns only matching docs", () => {
  const index = buildIndex([
    { id: "a", text: "kubernetes orchestration" },
    { id: "b", text: "frontend react components" },
  ]);
  const results = search(index, "kubernetes");
  assert.equal(results.length, 1);
  assert.equal(results[0]?.id, "a");
});

test("ties break deterministically by id", () => {
  // Identical docs must produce a stable order across runs, because the eval
  // harness diffs rankings between runs and would otherwise see phantom churn.
  const index = buildIndex([
    { id: "zebra", text: "identical text here" },
    { id: "alpha", text: "identical text here" },
    { id: "mango", text: "identical text here" },
  ]);
  const ids = search(index, "identical").map((r) => r.id);
  assert.deepEqual(ids, ["alpha", "mango", "zebra"]);
});

test("empty query and empty corpus are handled without throwing", () => {
  const index = buildIndex([{ id: "a", text: "some text" }]);
  assert.deepEqual(search(index, ""), []);
  assert.deepEqual(search(index, "the and for"), []);

  const empty = buildIndex([]);
  assert.equal(empty.avgDocLength, 0);
  assert.deepEqual(search(empty, "anything"), []);
});

test("term frequency saturates rather than growing linearly", () => {
  // 10 mentions must not score 10x a single mention, or keyword-stuffed
  // postings would dominate the shortlist.
  const index = buildIndex([
    { id: "once", text: "rust alpha beta gamma delta epsilon zeta eta theta iota" },
    { id: "many", text: "rust rust rust rust rust rust rust rust rust rust" },
  ]);
  const results = search(index, "rust");
  const once = results.find((r) => r.id === "once")?.score ?? 0;
  const many = results.find((r) => r.id === "many")?.score ?? 0;
  assert.ok(many > once, "more mentions should still score higher");
  assert.ok(many < once * 3, `saturation failed: ${many} vs ${once}`);
});
