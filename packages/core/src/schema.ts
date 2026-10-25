/**
 * The normalized contract between board adapters and the matching core.
 *
 * NOTHING in this file may reference a specific job board. Adapters translate
 * their board's payloads into these shapes; the core consumes only these shapes.
 * That boundary is what makes a second school adapter — and the later B2B API —
 * additive rather than a rewrite.
 *
 * FIELD CONFIDENCE: Static page recon confirmed some fields; live API payload
 * recon remains outstanding. Each field below is tagged:
 *   @confirmed — seen in a real captured payload
 *   @expected  — near-certain to exist, not yet observed
 *   @hoped     — the moat depends on this; verify FIRST in recon
 * Update the tags as recon lands. See docs/recon.md.
 */

// ---------------------------------------------------------------------------
// Postings
// ---------------------------------------------------------------------------

/** Where a posting came from. Opaque to the core; used only for display + dedupe. */
export type BoardId = string;

export type WorkModel = "onsite" | "hybrid" | "remote" | "unknown";

/**
 * A hiring cycle. Boards express terms inconsistently ("Fall 2026", "F26",
 * "2026-09"), so adapters normalize to this and the core never parses strings.
 */
export type Term = {
  /** Calendar year the work period starts. */
  year: number;
  /** Season the work period starts. */
  season: "winter" | "spring" | "summer" | "fall";
};

/**
 * Signals a public aggregator cannot see. These are the reason this product can
 * rank by *odds of an offer* rather than by text similarity, so their presence
 * is the single most important recon finding.
 */
export type CompetitionSignal = {
  /** Applications submitted so far. @confirmed in rendered listing columns */
  applicantCount?: number;
  /** Positions available. @confirmed in rendered listing columns */
  openings?: number;
  /** How many students this employer hired previously, keyed by program name. @hoped */
  pastHiresByProgram?: Record<string, number>;
  /** Employer has hired from this board before. @hoped */
  repeatEmployer?: boolean;
  /** Board-native employer rating, normalized to 0..1. @hoped */
  employerRating?: number;
};

export type Posting = {
  /** Stable within a board. Adapters must guarantee uniqueness. @confirmed */
  id: string;
  board: BoardId;
  /** @confirmed */
  title: string;
  /** Employer name. @confirmed */
  org: string;
  /** Deep link back to the posting on the board. @expected */
  url?: string;

  /** @expected */
  term?: Term;
  /** Free-form; adapters should not try to geocode. @expected */
  location?: string;
  /** @expected */
  workModel?: WorkModel;
  /** Study levels the posting accepts, e.g. ["junior", "senior"]. @expected */
  levelsAccepted?: string[];
  /** Programs/disciplines the posting is open to. @expected */
  disciplines?: string[];
  /** Application deadline, ISO 8601. @expected */
  deadline?: string;
  /** Raw compensation text; deliberately not parsed into a number. @expected */
  compensation?: string;

  /** Full job description text. The main input to matching. @confirmed */
  jdText: string;
  /** Requirements section alone, when the board separates it. @expected */
  requirementsText?: string;

  competition?: CompetitionSignal;

  /**
   * Content hash over the fields that affect matching. Used to cache
   * requirements extraction — postings are immutable within a cycle, so this
   * turns a per-run LLM cost into a one-time cost.
   */
  contentHash?: string;
};

/**
 * The interface every board adapter implements. The core depends on this type
 * and never on a concrete adapter.
 */
export type BoardAdapter = {
  readonly board: BoardId;
  /** True if this adapter can handle the given payload/URL. */
  matches(url: string): boolean;
  /** Translate one raw board payload into normalized postings. */
  normalize(raw: unknown): Posting[];
};

// ---------------------------------------------------------------------------
// Candidate profile
// ---------------------------------------------------------------------------

/**
 * A claimed skill plus the resume text that supports it. The evidence span is
 * not decoration: it is what lets the reranker cite *why* a match holds, and
 * what stops the model inventing experience the candidate does not have.
 */
export type SkillClaim = {
  name: string;
  /** Verbatim span from the resume backing this skill. */
  evidence: string;
  /** Rough exposure in months, if inferable. */
  months?: number;
};

export type Profile = {
  skills: SkillClaim[];
  /** Past job/co-op titles, most recent first. */
  titles: string[];
  /** Domains worked in, e.g. "systems", "fintech", "ML infra". */
  domains: string[];
  /** Completed work terms — the usual seniority proxy on co-op boards. */
  priorTermCount: number;
  /** Academic program, used against Posting.disciplines. */
  program?: string;
  /** Terms the candidate is available for. */
  availableTerms: Term[];
  /** Countries/regions the candidate can work in without sponsorship. */
  workAuth?: string[];
};

/**
 * Profile with direct identifiers removed. THIS is the only profile shape
 * permitted to cross the network to the rerank proxy. See stripPII().
 */
export type AnonymizedProfile = Omit<Profile, never> & {
  readonly __anonymized: true;
};

// ---------------------------------------------------------------------------
// Extracted requirements
// ---------------------------------------------------------------------------

export type Requirement = {
  text: string;
  /** A must-have gates the application; a nice-to-have does not. */
  kind: "must" | "nice";
};

export type Requirements = {
  items: Requirement[];
  /** Expected seniority, expressed as prior work terms. */
  seniorityTerms?: number;
  domain?: string;
};

// ---------------------------------------------------------------------------
// Ranking output
// ---------------------------------------------------------------------------

/**
 * One rubric dimension of a rerank verdict. `evidence` must quote the profile
 * or the posting — a score without a citation is not displayable.
 */
export type RubricScore = {
  dimension: "must_haves" | "nice_to_haves" | "seniority" | "domain";
  /** 0..1. */
  score: number;
  evidence: string;
};

/**
 * The unit the UI renders. The explanation is the product; `score` alone is a
 * toy, so consumers should never display it without `rubric` and `gaps`.
 */
export type MatchResult = {
  postingId: string;
  /** 0..1, fused across rubric dimensions. */
  score: number;
  rubric: RubricScore[];
  /** Must-haves the candidate does not meet, in plain language. */
  gaps: string[];
  /** One-sentence human-readable rationale. */
  why: string;
  /** Which stage produced this — lets the eval harness run ablations. */
  stage: "recall" | "rerank";
};
