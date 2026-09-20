# Phase 0 — Recon

**Status: NOT STARTED.** Requires a live authenticated WaterlooWorks session.

The purpose of this phase is to replace guesses with facts before any product
code is written. Everything in `packages/core/src/schema.ts` tagged `@expected`
or `@hoped` is currently unverified; this document is where those tags get
resolved.

---

## The question that decides the product

**Are the competition signals actually in the payloads?**

The pitch — "rank by realistic odds of an offer, not text similarity" — rests
entirely on metadata that public aggregators cannot see. If it is not in the
JSON, the product is still useful but it is *better filters*, not an
odds-estimator, and the competitive moat is much weaker.

Resolve this first, before anything else:

| Field | Present? | Where (JSON path) | Notes |
|---|---|---|---|
| `applicantCount` | ? | | The single most valuable field |
| `openings` | ? | | Needed for applicants-per-opening |
| `pastHiresByProgram` | ? | | May live on the employer view, not the posting |
| `repeatEmployer` | ? | | Derivable from hiring history if not explicit |
| `employerRating` | ? | | |

If the first two are present, the core ranking thesis holds. If neither is,
**stop and reconsider scope** before building Phase 1.

---

## Capture procedure

1. Open WaterlooWorks, log in, open DevTools → Network, filter to Fetch/XHR.
2. Load the postings list. Note the request that returns the posting array.
3. Page forward once. Note how pagination is expressed.
4. Open a single posting. Note whether detail comes from a separate call or was
   already present in the list payload.
5. Use "Copy as cURL" / "Copy response" rather than retyping.

### Record here

**List endpoint**

- Method + path:
- Query/body params:
- Pagination mechanism (offset / cursor / page number):
- Page size, and whether it can be raised:
- Response shape (top-level keys):

**Detail endpoint** (if separate)

- Method + path:
- How the posting id is passed:

**Auth**

- Session cookie or bearer token?
- Cookie names (do NOT record values):
- Does the API reject requests without an `Origin`/`Referer` from the board?
- Any CSRF token, and where it comes from:

**Rate limiting**

- Any `429`, `Retry-After`, or throttling observed:
- Observed latency per request:

---

## Fixtures

Save 3–5 scrubbed responses to `fixtures/orbis/`.

**Scrub before saving.** These get committed and are the only board data in the
repo:

- Replace employer names with `Employer A`, `Employer B`, …
- Remove recruiter names, emails, phone numbers, internal URLs
- Remove anything identifying you (student id, application history)
- Keep structure, field names, and value *types* exactly as-is — that is the
  entire point of the fixture

Note `.gitignore` blocks `*.raw.json`; keep unscrubbed captures under that
suffix so they cannot be committed by accident.

---

## Portability notes

WaterlooWorks is built by **Orbis Communications**, which **Symplicity
acquired**. Orbis runs 100+ institutions. So while capturing, flag anything
that looks Waterloo-specific versus Orbis-generic:

- Are field names generic (`jobTitle`) or Waterloo-branded?
- Is the path structure `/myAccount/co-op/...` or something more generic?
- Any version string or tenant identifier in the payload?

The more generic it looks, the more likely one adapter covers many schools —
which is the Phase 3 bet.

---

## Outcome

When this document is filled in:

1. Update the `@confirmed` / `@expected` / `@hoped` tags in
   `packages/core/src/schema.ts` to match reality.
2. Delete any schema field that does not exist, rather than carrying it as
   perpetually-optional dead weight.
3. Then, and only then, start Phase 1.
