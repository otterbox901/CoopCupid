/**
 * BM25 lexical retrieval — Stage 1's keyword half.
 *
 * Why lexical at all, when we also embed: resumes and job descriptions are
 * different genres of prose and embed into different neighborhoods, so pure
 * vector search drifts toward topical vibe ("both mention software") and away
 * from hard skill tokens. BM25 is unreasonably good at exactly the thing
 * embeddings are weak at here — matching a literal "Rust", "FPGA", "SQL".
 * Fusing the two (see rrf.ts) beats either alone, which the eval harness
 * checks rather than assumes.
 */

const K1 = 1.5; // term-frequency saturation
const B = 0.75; // document-length normalization

/** Tokens shorter than this carry no signal and inflate the index. */
const MIN_TOKEN_LENGTH = 2;

/**
 * Deliberately small stopword list. Aggressive stopping hurts here because job
 * descriptions use otherwise-common words as real signal ("C", "R", "Go" are
 * already lost to MIN_TOKEN_LENGTH; "will", "must" carry requirement intent).
 */
const STOPWORDS = new Set([
  "the", "and", "for", "are", "with", "you", "our", "this", "that", "from",
  "have", "has", "was", "were", "been", "will", "would", "your", "their",
  "they", "them", "its", "into", "than", "then", "there", "these", "those",
]);

export function tokenize(text: string): string[] {
  const out: string[] = [];
  // Keep intra-token + and # so "c++" and "c#" survive as distinct tokens;
  // they are high-signal skill names that a naive \w+ split destroys.
  for (const m of text.toLowerCase().matchAll(/[a-z0-9][a-z0-9+#.]*/g)) {
    const tok = m[0].replace(/\.+$/, "");
    if (tok.length < MIN_TOKEN_LENGTH) continue;
    if (STOPWORDS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

export type Bm25Doc = {
  id: string;
  tokens: string[];
};

export type Bm25Index = {
  docs: Bm25Doc[];
  /** token -> number of docs containing it */
  df: Map<string, number>;
  /** docId -> token -> term frequency */
  tf: Map<string, Map<string, number>>;
  avgDocLength: number;
  docCount: number;
};

export function buildIndex(docs: { id: string; text: string }[]): Bm25Index {
  const prepared: Bm25Doc[] = docs.map((d) => ({ id: d.id, tokens: tokenize(d.text) }));
  const df = new Map<string, number>();
  const tf = new Map<string, Map<string, number>>();
  let totalLength = 0;

  for (const doc of prepared) {
    totalLength += doc.tokens.length;
    const counts = new Map<string, number>();
    for (const tok of doc.tokens) {
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
    tf.set(doc.id, counts);
    // df counts documents, not occurrences — iterate the unique set.
    for (const tok of counts.keys()) {
      df.set(tok, (df.get(tok) ?? 0) + 1);
    }
  }

  return {
    docs: prepared,
    df,
    tf,
    docCount: prepared.length,
    avgDocLength: prepared.length === 0 ? 0 : totalLength / prepared.length,
  };
}

/**
 * Probabilistic IDF with the +1 smoothing that keeps very common terms from
 * going negative (a term in >half the corpus would otherwise subtract score).
 */
function idf(index: Bm25Index, token: string): number {
  const n = index.df.get(token) ?? 0;
  return Math.log(1 + (index.docCount - n + 0.5) / (n + 0.5));
}

export type ScoredDoc = { id: string; score: number };

/**
 * Score every document against the query. Returns all docs with score > 0,
 * sorted descending; ties broken by id so results are deterministic (the eval
 * harness compares rankings across runs and cannot tolerate unstable order).
 */
export function search(index: Bm25Index, query: string): ScoredDoc[] {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0 || index.docCount === 0) return [];

  // Precompute IDF once per unique query term rather than per document.
  const uniq = new Map<string, number>();
  for (const t of queryTokens) {
    if (!uniq.has(t)) uniq.set(t, idf(index, t));
  }

  const results: ScoredDoc[] = [];
  for (const doc of index.docs) {
    const counts = index.tf.get(doc.id);
    if (!counts) continue;
    const lengthNorm = K1 * (1 - B + (B * doc.tokens.length) / (index.avgDocLength || 1));

    let score = 0;
    for (const [token, tokenIdf] of uniq) {
      const f = counts.get(token);
      if (!f) continue;
      score += tokenIdf * ((f * (K1 + 1)) / (f + lengthNorm));
    }
    if (score > 0) results.push({ id: doc.id, score });
  }

  results.sort((a, b) => (b.score - a.score) || a.id.localeCompare(b.id));
  return results;
}
