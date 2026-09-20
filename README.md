# coopmatch

A board-agnostic matching layer that ranks university job postings against a
resume, with explained reasoning — starting with WaterlooWorks as the first
ingestion adapter.

University job boards host thousands of postings per cycle behind filters that
match on coarse structured fields. They cannot tell a student which postings
they are genuinely competitive for. This ranks them, and says why.

## Architecture

```
packages/adapters/     board-specific, disposable
  orbis/                 WaterlooWorks + Orbis-family schools
                              |
                              v  normalize to a common schema
packages/core/         THE ASSET — knows nothing about any board
  schema.ts              the adapter <-> core contract
  rank/                  BM25 + RRF fusion, then LLM rerank
  profile/               resume -> structured Profile
  requirements/          posting -> structured Requirements
                              |
                              v
surfaces/              delivery shells, swappable
  extension/             MV3 Chrome extension
  api/                   B2B HTTP surface (later)

eval/                  offline harness — gates every core change
```

**The one rule:** nothing in `packages/core/` may import from an adapter or
reference a board by name, and it must run unchanged in both Node and the
browser. That boundary is what makes a second school — and the later B2B API —
additive rather than a rewrite.

## Status

| Phase | State |
|---|---|
| 0 — Recon and schema | **Not started.** Needs a live session. See [`docs/recon.md`](docs/recon.md) |
| 1 — Matching core + eval | In progress. Ranking primitives and metrics done and tested |
| 2 — Extension shell | Not started |
| 3 — Second adapter | Not started |
| 4 — Pilot | Not started |

Phase 1's ranking primitives (`packages/core/src/rank/`) and eval metrics
(`eval/src/metrics.ts`) are pure functions with no dependency on board data,
so they were built and tested ahead of recon. The LLM-backed stages — profile
extraction, requirements extraction, rerank — are blocked on Phase 0, since
their prompts depend on which fields actually exist.

## Develop

Requires Node >= 22.6. Uses native TypeScript type stripping, so there is **no
build step and no dependencies** for `core` and `eval`.

```sh
npm test     # 30 tests, ~130ms
```

`tsconfig.base.json` sets `erasableSyntaxOnly`, which enforces that all code
stays type-strippable — no enums, no namespaces, no parameter properties.

## Data handling

This is a design constraint, not a footnote. The board's terms almost certainly
prohibit automated access, and postings contain employer information not meant
to leave the platform.

- **Client-side only.** Runs inside the student's own authenticated session;
  surfaces only data they were already entitled to see.
- **No central mirror of postings, ever.** This is the line between a
  defensible tool and a cease-and-desist.
- **Active indexing is opt-in** and rate-limited, off by default.
- **The raw resume never leaves the device.** Only an anonymized structured
  profile reaches the rerank proxy.
- No API key ships in the extension.

Only scrubbed fixtures belong in this repo. See `.gitignore`.
