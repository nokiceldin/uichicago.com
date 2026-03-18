/**
 * trust-decision.ts
 * lib/chat/trust-decision.ts
 *
 * Sparky Trust Layer — decides HOW to answer before the model is called.
 *
 * Design philosophy:
 *   answer first → hedge when uncertain → abstain only when truly necessary
 *
 * Sits between retrieval and the Anthropic API call in route.ts.
 *
 * Usage:
 *   import { makeTrustDecision, getTrustInstruction } from "@/lib/chat/trust-decision";
 *
 *   const trust = makeTrustDecision(query, rerankedChunks);
 *   if (trust.decision === "abstain") { ... }
 *   const instruction = getTrustInstruction(trust);
 *   // inject instruction into buildSystemPrompt
 */

// ─── TYPES ────────────────────────────────────────────────────────────────────

export type TrustDecision = "answer" | "hedge" | "abstain";

/**
 * Query classification — drives the top-level routing decision.
 *
 * stable_fact    → safe to answer with any decent evidence
 * time_sensitive → prefer hedge; abstain only if no useful evidence
 * financial      → answer if official data present, hedge otherwise
 * personal_data  → always abstain (no student record access)
 * live_status    → abstain (sports scores, "is it open right now")
 * out_of_scope   → abstain (other universities, syllabus policies)
 * ambiguous      → hedge by default, escalate with evidence
 */
export type QueryClass =
  | "stable_fact"
  | "time_sensitive"
  | "financial"
  | "personal_data"
  | "live_status"
  | "out_of_scope"
  | "ambiguous";

export interface TrustExplanation {
  query_class:          QueryClass;
  primary_domain:       string | null;
  top_score:            number;        // 0–1, combined relevance × confidence
  relevant_chunk_count: number;
  freshness_state:      "fresh" | "stale" | "unknown";
  domain_matched:       boolean;
}

export interface TrustResult {
  decision:    TrustDecision;
  confidence:  number;           // 0–100
  reason:      string;           // short, loggable slug
  explanation: TrustExplanation; // structured — for logging and debugging
}

// Mirror from route.ts — keep in sync if RetrievedChunk changes
export interface ChunkSignal {
  domain:           string;
  content:          string;
  relevanceScore:   number;   // 0–1
  sourceConfidence: number;   // 0–1
  publishedAt?:     string | null; // ISO string or null
}

export interface QuerySignal {
  rawQuery:         string;
  isFact:           boolean;
  answerMode:       string;
  domainConfidence: Partial<Record<string, number>>;
}

// ─── THRESHOLDS ───────────────────────────────────────────────────────────────

// sourceConfidence >= this = data from SQL/JSON, not vector/generated
const HIGH_TRUST_CONF  = 0.88;

// Minimum relevance for a chunk to count as "useful"
const MIN_RELEVANCE    = 0.25; // lowered from 0.45 — bias toward answering

// Minimum combined score (relevance × confidence) to answer at all
const ANSWER_THRESHOLD = 0.28; // low bar — hedge catches the middle ground
const HEDGE_THRESHOLD  = 0.18; // below this = abstain (almost nothing useful)

// Age in days beyond which evidence is considered stale for time-sensitive queries
const STALE_DAYS = 90;

// ─── QUERY CLASS PATTERNS ────────────────────────────────────────────────────

/**
 * PERSONAL DATA — no student record access, always abstain.
 */
const PERSONAL_DATA_PATTERNS: RegExp[] = [
  /\bmy (gpa|grade|transcript|record|financial aid|account|schedule|classes|bill|balance|refund|aid)\b/i,
  /\bwhat (did|do) i (get|have|owe)\b/i,
  /\bhow (am|are) i doing\b/i,
  /\bcheck my\b/i,
];

/**
 * LIVE STATUS — real-time queries the system genuinely cannot answer.
 * Narrower than before: only truly live unknowables.
 * "today" alone does NOT qualify — that's handled by time_sensitive + evidence check.
 */
const LIVE_STATUS_PATTERNS: RegExp[] = [
  /\blive score\b/i,
  /\blast (night'?s?|game'?s?|match'?s?) (score|result|final|win|loss)\b/i,
  /\bcurrent(ly)? (open|closed|serving|available|operating)\b/i,
  /\bopen right now\b/i,
  /\bis (it|the .{1,30}) (open|closed|available|running|still open) (right now|at this moment)\b/i,
  /\breal.?time\b/i,
];

/**
 * OUT OF SCOPE — external institutions, syllabus policies.
 */
const OUT_OF_SCOPE_PATTERNS: RegExp[] = [
  /\btransfer to (uiuc|northwestern|depaul|loyola|niu|illinois state|chicago state|purdue|indiana|michigan)\b/i,
  /\bgpa (to|for) (transfer to|get into) (uiuc|northwestern|depaul|loyola)\b/i,
  /\bsyllabus\b/i,
  /\blate (work|policy|submission|assignment)\b/i,
  /\bmakeup (exam|test|quiz)\b/i,
  /\bdoes (prof|professor|instructor).{0,30}(allow|accept|give|offer)\b/i,
];

/**
 * TIME-SENSITIVE signals — "today", "this week", deadlines, schedules.
 * These should HEDGE (not abstain) if evidence exists.
 * Only abstain if evidence is absent or stale.
 */
const TIME_SENSITIVE_PATTERNS: RegExp[] = [
  /\btoday\b/i,
  /\btonight\b/i,
  /\bthis (week|weekend|morning|afternoon|evening)\b/i,
  /\bright now\b/i,
  /\bcurrently\b/i,
  /\bat the moment\b/i,
  /\bstill open\b/i,
  /\bstill (accepting|available|running)\b/i,
  /\bis (the|it) .{0,30} (still|open|closed|available)\b/i,
  /\bthis semester'?s? (schedule|deadline|event)\b/i,
  /\bwhat('?s| is) (happening|going on)\b/i,
  /\banything (happening|going on)\b/i,
  /\bcurrent (deadline|schedule|event|hours)\b/i,
];

/**
 * FINANCIAL signals — tuition, aid, costs.
 */
const FINANCIAL_PATTERNS: RegExp[] = [
  /\b(tuition|cost of attendance|how much (is|does|will)|total cost|out of pocket)\b/i,
  /\b(financial aid|fafsa|scholarship|grant|aspire|loan|work.?study)\b/i,
  /\b(what do i owe|bill|bursar|payment plan|refund)\b/i,
];

/**
 * Structured contact/location data in chunk content.
 * Presence = authoritative official data. Safe to answer if domain matches.
 */
const STRUCTURED_DATA_PATTERNS: RegExp[] = [
  /\d{3}-\d{3}-\d{4}/,              // phone number
  /suite\s+\d{3,4}/i,               // suite number
  /\d{3,4}\s+[wWsSnNeE][\s.]+\w/,  // street address
  /@uic\.edu/i,                      // official email
  /\d{1,2}(:\d{2})?\s*(am|pm)/i,   // hours
];

/**
 * Domains where a single official source is always enough to answer.
 * Contact info, locations, and services don't change frequently.
 */
const DIRECT_ANSWER_DOMAINS = new Set([
  "campus_map",
  "transportation",
  "health",
  "library",
  "admissions",
  "careers",
  "international",
  "safety",
  "housing",
  "dining",
  "student_life",
  "greek_life",
  "athletics",
  "recreation",
]);

/**
 * Domains that are stable facts — answer with any decent evidence.
 */
const STABLE_FACT_DOMAINS = new Set([
  "courses",
  "professors",
  "gen_ed",
  "major_plan",
  "academic_policy",
  "calendar",
  "instagram",
  ...DIRECT_ANSWER_DOMAINS,
]);

const FINANCIAL_DOMAINS = new Set(["tuition", "financial_aid"]);

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(p => p.test(text));
}

function topCombinedScore(chunks: ChunkSignal[]): number {
  if (chunks.length === 0) return 0;
  return Math.max(...chunks.map(c => c.relevanceScore * c.sourceConfidence));
}

function countRelevant(chunks: ChunkSignal[]): number {
  return chunks.filter(c => c.relevanceScore >= MIN_RELEVANCE).length;
}

function hasHighTrust(chunks: ChunkSignal[]): boolean {
  return chunks.some(c => c.sourceConfidence >= HIGH_TRUST_CONF);
}

function hasAnyUsefulChunk(chunks: ChunkSignal[]): boolean {
  return chunks.some(c => c.relevanceScore >= MIN_RELEVANCE);
}

function primaryDomain(query: QuerySignal): string | null {
const entries = Object.entries(query.domainConfidence).sort(([, a], [, b]) => (b ?? 0) - (a ?? 0));  return entries[0]?.[0] ?? null;
}

/**
 * Domain match check — do the top chunks actually belong to the query's primary domain?
 * Prevents confidently answering housing questions with athletics chunks, etc.
 */
function isDomainMatched(query: QuerySignal, chunks: ChunkSignal[]): boolean {
  const domain = primaryDomain(query);
  if (!domain) return true; // no strong domain signal — don't penalize
  const confThreshold = query.domainConfidence[domain] ?? 0;
  if (confThreshold < 0.65) return true; // domain signal too weak to enforce
  return chunks.some(c => c.domain === domain && c.relevanceScore >= MIN_RELEVANCE);
}

/**
 * Structured data match — checks that the structured data in chunks
 * actually aligns with what the query is asking for.
 * Phone number in a housing chunk doesn't help a tuition question.
 */
function hasMatchingStructuredData(query: QuerySignal, chunks: ChunkSignal[]): boolean {
  const domain = primaryDomain(query);
  const relevantChunks = domain
    ? chunks.filter(c => c.domain === domain || !domain)
    : chunks;

  return relevantChunks.some(c =>
    STRUCTURED_DATA_PATTERNS.some(p => p.test(c.content)) &&
    c.relevanceScore >= MIN_RELEVANCE
  );
}

/**
 * Freshness assessment using publishedAt on chunks.
 * Returns "fresh" if any relevant chunk was published within STALE_DAYS.
 * Returns "stale" if we have dates but all are old.
 * Returns "unknown" if no publishedAt data available (most chunks).
 */
function assessFreshness(chunks: ChunkSignal[]): "fresh" | "stale" | "unknown" {
  const relevantWithDates = chunks
    .filter(c => c.relevanceScore >= MIN_RELEVANCE && c.publishedAt)
    .map(c => new Date(c.publishedAt!).getTime())
    .filter(t => !isNaN(t));

  if (relevantWithDates.length === 0) return "unknown";

  const nowMs   = Date.now();
  const staleMs = STALE_DAYS * 24 * 60 * 60 * 1000;
  const newest  = Math.max(...relevantWithDates);

  return nowMs - newest < staleMs ? "fresh" : "stale";
}

/**
 * Classify a query into one of the QueryClass buckets.
 * Priority: personal_data > live_status > out_of_scope > financial > time_sensitive > stable_fact > ambiguous
 */
function classifyQuery(query: QuerySignal): QueryClass {
  const lower = query.rawQuery.toLowerCase();

  if (matchesAny(lower, PERSONAL_DATA_PATTERNS))  return "personal_data";
  if (matchesAny(lower, LIVE_STATUS_PATTERNS))     return "live_status";
  if (matchesAny(lower, OUT_OF_SCOPE_PATTERNS))    return "out_of_scope";
  if (matchesAny(lower, FINANCIAL_PATTERNS))       return "financial";
  if (matchesAny(lower, TIME_SENSITIVE_PATTERNS))  return "time_sensitive";

  const domain = primaryDomain(query);
  if (domain && STABLE_FACT_DOMAINS.has(domain))   return "stable_fact";

  // isFact with no domain classification = still treat as stable
  if (query.isFact)                                return "stable_fact";

  return "ambiguous";
}

// ─── CORE DECISION FUNCTION ───────────────────────────────────────────────────

/**
 * makeTrustDecision
 *
 * Classifies the query, evaluates evidence quality and freshness,
 * and returns a structured decision: answer | hedge | abstain.
 *
 * Bias: answer > hedge > abstain.
 * Abstain is reserved for truly unserviceable queries.
 */
export function makeTrustDecision(
  query:  QuerySignal,
  chunks: ChunkSignal[]
): TrustResult {
  const queryClass     = classifyQuery(query);
  const domain         = primaryDomain(query);
  const score          = topCombinedScore(chunks);
  const nRelevant      = countRelevant(chunks);
  const freshness      = assessFreshness(chunks);
  const domainMatched  = isDomainMatched(query, chunks);

  const explanation: TrustExplanation = {
    query_class:          queryClass,
    primary_domain:       domain,
    top_score:            Math.round(score * 100) / 100,
    relevant_chunk_count: nRelevant,
    freshness_state:      freshness,
    domain_matched:       domainMatched,
  };

  // ── CLASS: personal_data — always abstain ─────────────────────────────────
  if (queryClass === "personal_data") {
    return { decision: "abstain", confidence: 98, reason: "personal_record_query", explanation };
  }

  // ── CLASS: live_status — always abstain ───────────────────────────────────
  if (queryClass === "live_status") {
    return { decision: "abstain", confidence: 95, reason: "live_status_query_no_realtime_feed", explanation };
  }

  // ── CLASS: out_of_scope — always abstain ──────────────────────────────────
  if (queryClass === "out_of_scope") {
    return { decision: "abstain", confidence: 90, reason: "out_of_scope_query", explanation };
  }

  // ── ZERO EVIDENCE — abstain for all remaining classes ────────────────────
  // But be lenient: even one chunk above HEDGE_THRESHOLD is enough to try.
  if (score < HEDGE_THRESHOLD || !hasAnyUsefulChunk(chunks)) {
    return { decision: "abstain", confidence: 80, reason: "insufficient_evidence", explanation };
  }

  // ── CLASS: financial ─────────────────────────────────────────────────────
  if (queryClass === "financial") {
    // Official JSON data for tuition/aid = answer (the data is structured and versioned)
    if (hasHighTrust(chunks) && score >= 0.55 && domainMatched) {
      return { decision: "answer", confidence: 78, reason: "financial_official_data_present", explanation };
    }
    // Any decent evidence = hedge with verification nudge
    if (score >= ANSWER_THRESHOLD) {
      return { decision: "hedge", confidence: 55, reason: "financial_partial_evidence", explanation };
    }
    return { decision: "hedge", confidence: 38, reason: "financial_weak_evidence_direct_to_bursar", explanation };
  }

  // ── CLASS: time_sensitive ─────────────────────────────────────────────────
  // Do NOT auto-abstain. Evaluate evidence instead.
  if (queryClass === "time_sensitive") {
    // Strong official evidence + fresh = answer
    if (hasHighTrust(chunks) && score >= 0.65 && domainMatched && freshness !== "stale") {
      return { decision: "answer", confidence: 72, reason: "time_sensitive_strong_recent_evidence", explanation };
    }
    // Any usable evidence = hedge
    if (score >= ANSWER_THRESHOLD) {
      return { decision: "hedge", confidence: 50, reason: "time_sensitive_hedge_with_verification", explanation };
    }
    // No usable evidence = abstain
    return { decision: "abstain", confidence: 78, reason: "time_sensitive_no_useful_evidence", explanation };
  }

  // ── CLASS: stable_fact ────────────────────────────────────────────────────
  if (queryClass === "stable_fact") {
    // isFact + matching structured data = highest confidence direct answer
    if (query.isFact && hasMatchingStructuredData(query, chunks)) {
      return { decision: "answer", confidence: 93, reason: "fact_query_matching_structured_data", explanation };
    }

    // Domain matched + high trust + decent score = answer
    if (domainMatched && hasHighTrust(chunks) && score >= 0.50) {
      return { decision: "answer", confidence: Math.round(score * 95), reason: "stable_fact_high_trust", explanation };
    }

    // Domain matched + any decent evidence = answer (bias toward helpful)
    // This is the key change: single decent source is enough for stable UIC facts
    if (domainMatched && score >= ANSWER_THRESHOLD) {
      return { decision: "answer", confidence: Math.round(score * 80), reason: "stable_fact_sufficient_evidence", explanation };
    }

    // Domain mismatch but strong evidence = hedge (something relevant found)
    if (!domainMatched && score >= 0.50) {
      return { decision: "hedge", confidence: Math.round(score * 65), reason: "stable_fact_domain_mismatch_hedge", explanation };
    }

    // Weak evidence for a stable fact = hedge not abstain
    // We probably know something useful, just not perfectly matched
    if (score >= HEDGE_THRESHOLD) {
      return { decision: "hedge", confidence: Math.round(score * 60), reason: "stable_fact_weak_evidence_hedge", explanation };
    }
  }

  // ── CLASS: ambiguous ─────────────────────────────────────────────────────
  if (queryClass === "ambiguous") {
    if (domainMatched && hasHighTrust(chunks) && score >= 0.55) {
      return { decision: "answer", confidence: Math.round(score * 85), reason: "ambiguous_strong_evidence", explanation };
    }
    if (score >= ANSWER_THRESHOLD) {
      return { decision: "hedge", confidence: Math.round(score * 70), reason: "ambiguous_partial_evidence", explanation };
    }
    return { decision: "hedge", confidence: 35, reason: "ambiguous_low_evidence_hedge", explanation };
  }

  // ── FINAL FALLBACK ────────────────────────────────────────────────────────
  // Reached only if queryClass wasn't handled above (shouldn't happen).
  // Prefer hedge over abstain — we have some evidence at this point.
  if (score >= ANSWER_THRESHOLD) {
    return { decision: "hedge", confidence: Math.round(score * 60), reason: "fallback_hedge", explanation };
  }
  return { decision: "abstain", confidence: 70, reason: "fallback_insufficient_evidence", explanation };
}

// ─── SYSTEM PROMPT INSTRUCTION BUILDER ───────────────────────────────────────

/**
 * Translates a TrustResult into a concrete instruction for buildSystemPrompt().
 *
 * Usage in route.ts — append to system prompt:
 *   const trustInstruction = getTrustInstruction(trust);
 */
export function getTrustInstruction(trust: TrustResult): string {
  const { decision, confidence, explanation } = trust;
  const domainNote = explanation.primary_domain ? ` (domain: ${explanation.primary_domain})` : "";

  switch (decision) {

    case "answer":
      return [
        `TRUST LEVEL: HIGH — confidence ${confidence}/100${domainNote}.`,
        `Answer directly and specifically.`,
        `Use exact figures, names, and contact details from the retrieved data.`,
        `Do not hedge unless the data itself contains conflicting information.`,
        explanation.freshness_state === "stale"
          ? `Note: source data may not be current — mention the student should verify if time-sensitive.`
          : "",
      ].filter(Boolean).join(" ");

    case "hedge":
      return [
        `TRUST LEVEL: PARTIAL — confidence ${confidence}/100${domainNote}.`,
        `Answer based on the available data but acknowledge uncertainty naturally.`,
        explanation.query_class === "financial"
          ? `For financial figures: use ranges or approximations, not exact numbers. Direct to bursar.uic.edu or financialaid.uic.edu to confirm.`
          : `Use phrases like "based on what I have" or "this may have been updated" where appropriate.`,
        `End your response with a specific verification step — name the UIC office, website, or phone number.`,
        `Do not fabricate specific data points that aren't in the retrieved context.`,
      ].join(" ");

    case "abstain":
      return [
        `TRUST LEVEL: INSUFFICIENT — confidence ${confidence}/100.`,
        `You do not have reliable data to answer this question.`,
        `Do NOT attempt to answer. Instead: tell the student exactly what you cannot confirm,`,
        `then give a specific redirect — office name, URL, or phone number.`,
        `Never end with just "I don't know." Always provide a next step.`,
      ].join(" ");
  }
}