/**
 * eval-sparky.mjs
 *
 * Sparky Retrieval Evaluation Runner
 *
 * Feeds each query from sparky-eval-queries.json to the live Sparky API,
 * records responses, and scores them across four dimensions:
 *   - answered:       did Sparky attempt an answer?
 *   - abstained:      did Sparky correctly say it doesn't know?
 *   - hallucination:  did it confidently assert something suspicious?
 *   - latency:        how long did it take?
 *
 * Input:   public/data/eval/sparky-eval-queries.json
 * Output:  public/data/eval/sparky-eval-results.json
 *          public/data/eval/sparky-eval-summary.json
 *
 * Run: node scripts/eval-sparky.mjs
 * Run subset: node scripts/eval-sparky.mjs --limit=10
 * Run category: node scripts/eval-sparky.mjs --category=admissions
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const BASE_URL      = "http://localhost:3000";
const CHAT_ENDPOINT = `${BASE_URL}/api/chat`;
const QUERIES_FILE  = path.join(ROOT, "public/data/eval/sparky-eval-queries.json");
const RESULTS_FILE  = path.join(ROOT, "public/data/eval/sparky-eval-results.json");
const SUMMARY_FILE  = path.join(ROOT, "public/data/eval/sparky-eval-summary.json");

const CONCURRENCY       = 3;    // parallel requests — keep low to avoid rate limits
const REQUEST_TIMEOUT_MS = 30000;
const DELAY_BETWEEN_MS  = 200;  // ms between batch dispatches

// ─── SIGNAL DETECTORS ────────────────────────────────────────────────────────

// Sparky said it doesn't know / can't confirm / is redirecting
const ABSTAIN_PATTERNS = [
  /i don't have (that|reliable|current|real-time|specific)/i,
  /i can't (confirm|verify|access|check|provide)/i,
  /i'm not sure/i,
  /you (should|can) (check|contact|visit|reach out)/i,
  /for (the most|current|up-to-date)/i,
  /registrar\.uic\.edu/i,
  /please (contact|check|visit|see)/i,
  /i don't (know|have access)/i,
  /that information (may|might|could) have changed/i,
  /my (knowledge|data|information) (is|may be) (limited|outdated|incomplete)/i,
];

// Sparky gave a confident answer with real content
const ANSWERED_PATTERNS = [
  /\$[\d,]+/,                        // dollar amounts
  /\d{3}-\d{3}-\d{4}/,              // phone numbers
  /suite\s+\d+/i,                   // suite numbers
  /\d{1,2}(:\d{2})?\s*(am|pm)/i,   // times
  /\b(fall|spring)\s+20\d{2}\b/i,  // semesters
  /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/i,
  /gpa\s+(of\s+)?\d\.\d/i,         // GPA numbers
  /.{120,}/,                         // response longer than 120 chars (substantial)
];

// Flags that suggest potential hallucination risk
// These don't mean it hallucinated — they flag for human review
const HALLUCINATION_FLAGS = [
  { pattern: /\b(always|never|guaranteed|definitely|certainly|absolutely)\b/i, label: "overconfident_language" },
  { pattern: /\d{3}-\d{3}-\d{4}/, label: "contains_phone_number" },    // verify accuracy
  { pattern: /suite\s+\d{3,4}/i,  label: "contains_suite_number" },    // verify accuracy
  { pattern: /\$[\d,]{4,}/,       label: "contains_dollar_amount" },   // verify accuracy
  { pattern: /\b(the deadline is|deadline:|due on|due date:)\s+\w+ \d/i, label: "specific_deadline_claimed" },
  { pattern: /as of \d{4}/i,      label: "year_anchored_claim" },
];

// Time-sensitive queries where abstention is often the RIGHT answer
const TIME_SENSITIVE_EXPECTED_ABSTAIN = [
  "q31", "q32", "q33", "q34", "q35", "q36", "q37", "q38", "q39", "q40",
];

// Edge case queries where a graceful redirect is expected
const EDGE_CASE_EXPECTED_REDIRECT = [
  "q41", "q42", "q43", "q44", "q45", "q47", "q48", "q49",
];

// ─── PARSE CLI ARGS ───────────────────────────────────────────────────────────

function parseArgs() {
  const args   = process.argv.slice(2);
  const limit  = args.find(a => a.startsWith("--limit="))?.split("=")[1];
  const cat    = args.find(a => a.startsWith("--category="))?.split("=")[1];
  const ids    = args.find(a => a.startsWith("--ids="))?.split("=")[1]?.split(",");
  return {
    limit:    limit ? parseInt(limit, 10) : null,
    category: cat ?? null,
    ids:      ids ?? null,
  };
}

// ─── LOAD QUERIES ─────────────────────────────────────────────────────────────

function loadQueries(filePath, { limit, category, ids }) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Queries file not found: ${filePath}`);
  }

  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  let queries = data.queries;

  if (ids)      queries = queries.filter(q => ids.includes(q.id));
  if (category) queries = queries.filter(q => q.category === category);
  if (limit)    queries = queries.slice(0, limit);

  return queries;
}

// ─── STREAMING FETCH ─────────────────────────────────────────────────────────

/**
 * POST to /api/chat with streaming response.
 * Returns the full accumulated text and timing info.
 */
async function querySparkly(question) {
  const startMs = Date.now();

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(CHAT_ENDPOINT, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({
        messages: [{ role: "user", content: question }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
    }

    // Stream response — matches how chat/page.tsx handles it
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let   accumulated = "";

    const firstByteMs = Date.now();
    let   firstByteMeasured = false;
    let   ttfbMs = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!firstByteMeasured) {
        ttfbMs = Date.now() - firstByteMs;
        firstByteMeasured = true;
      }

      accumulated += decoder.decode(value, { stream: true });
    }

    const totalMs = Date.now() - startMs;

    // Check response headers for abstention signal from route.ts
    const abstainedHeader = res.headers.get("X-Abstained");
    const abstainReason   = res.headers.get("X-Abstain-Reason");

    return {
      ok:           true,
      response:     accumulated.trim(),
      latencyMs:    totalMs,
      ttfbMs,
      abstainedByServer: abstainedHeader === "true",
      abstainReason: abstainReason ?? null,
    };

  } catch (err) {
    const isTimeout = err.name === "AbortError";
    return {
      ok:        false,
      response:  null,
      latencyMs: Date.now() - startMs,
      ttfbMs:    null,
      error:     isTimeout ? "TIMEOUT" : err.message,
      abstainedByServer: false,
      abstainReason: null,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── SCORE SINGLE RESULT ─────────────────────────────────────────────────────

function scoreResult(query, queryResult) {
  const { response, ok, abstainedByServer, abstainReason } = queryResult;

  if (!ok || !response) {
    return {
      answered:         false,
      abstained:        false,
      abstain_correct:  null,
      hallucination_flags: [],
      response_length:  0,
      notes:            [queryResult.error ?? "no_response"],
    };
  }

  const answered  = ANSWERED_PATTERNS.some(p => p.test(response));
  const abstained = abstainedByServer || ABSTAIN_PATTERNS.some(p => p.test(response));

  // Was abstention the right call for this query?
  const shouldAbstain =
    query.type === "time_sensitive" ||
    TIME_SENSITIVE_EXPECTED_ABSTAIN.includes(query.id);

  const abstain_correct =
    abstained
      ? shouldAbstain       // abstained on a time-sensitive → correct
        ? true
        : null              // abstained on a factual → review (might be wrong)
      : shouldAbstain
        ? false             // didn't abstain on time-sensitive → potentially wrong
        : null;             // didn't abstain on factual → expected

  // Collect hallucination flags — human review items, not automatic failures
  const hallucination_flags = HALLUCINATION_FLAGS
    .filter(({ pattern }) => pattern.test(response))
    .map(({ label }) => label);

  // Edge case handling — short/unclear queries should get a graceful redirect
  const isEdgeCase   = EDGE_CASE_EXPECTED_REDIRECT.includes(query.id);
  const handledGrace = isEdgeCase
    ? abstained || response.length > 20  // gave some response
    : null;

  const notes = [];
  if (abstainedByServer)         notes.push(`server_abstained:${abstainReason}`);
  if (isEdgeCase && handledGrace) notes.push("edge_case_handled");
  if (isEdgeCase && !handledGrace) notes.push("edge_case_not_handled");
  if (shouldAbstain && !abstained) notes.push("should_have_abstained");

  return {
    answered,
    abstained,
    abstain_correct,
    hallucination_flags,
    response_length: response.length,
    notes,
  };
}

// ─── CONCURRENCY RUNNER ───────────────────────────────────────────────────────

/**
 * Run queries in batches of CONCURRENCY with a small delay between batches.
 */
async function runQueries(queries, onProgress) {
  const results = [];

  for (let i = 0; i < queries.length; i += CONCURRENCY) {
    const batch = queries.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (query) => {
        const queryResult = await querySparkly(query.question);
        const scores      = scoreResult(query, queryResult);
        const result      = { query, queryResult, scores };
        onProgress(result, results.length + 1, queries.length);
        return result;
      })
    );

    results.push(...batchResults);

    if (i + CONCURRENCY < queries.length) {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MS));
    }
  }

  return results;
}

// ─── SUMMARY STATS ────────────────────────────────────────────────────────────

function buildSummary(results) {
  const total     = results.length;
  const succeeded = results.filter(r => r.queryResult.ok).length;
  const failed    = total - succeeded;

  const answered   = results.filter(r => r.scores.answered).length;
  const abstained  = results.filter(r => r.scores.abstained).length;

  // Abstain accuracy: of time-sensitive queries, how many correctly abstained?
  const timeSensitive     = results.filter(r => r.query.type === "time_sensitive");
  const correctlyAbstained = timeSensitive.filter(r => r.scores.abstain_correct === true).length;
  const incorrectlyAnswered = timeSensitive.filter(r => r.scores.abstain_correct === false).length;

  // Hallucination risk: queries with 2+ flags
  const highRisk = results.filter(r => r.scores.hallucination_flags.length >= 2).length;

  // Latency stats (only successful requests)
  const latencies = results.filter(r => r.queryResult.ok).map(r => r.queryResult.latencyMs);
  const avgLatency = latencies.length > 0
    ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
    : null;
  const p95Latency = latencies.length > 0
    ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)]
    : null;

  // By category
  const categories = {};
  for (const r of results) {
    const cat = r.query.category;
    if (!categories[cat]) categories[cat] = { total: 0, answered: 0, abstained: 0, errors: 0 };
    categories[cat].total++;
    if (r.scores.answered)  categories[cat].answered++;
    if (r.scores.abstained) categories[cat].abstained++;
    if (!r.queryResult.ok)  categories[cat].errors++;
  }

  // By difficulty
  const difficulty = {};
  for (const r of results) {
    const d = r.query.difficulty;
    if (!difficulty[d]) difficulty[d] = { total: 0, answered: 0, errors: 0 };
    difficulty[d].total++;
    if (r.scores.answered) difficulty[d].answered++;
    if (!r.queryResult.ok) difficulty[d].errors++;
  }

  // Hallucination flag breakdown
  const flagCounts = {};
  for (const r of results) {
    for (const flag of r.scores.hallucination_flags) {
      flagCounts[flag] = (flagCounts[flag] ?? 0) + 1;
    }
  }

  // Queries needing human review
  const needsReview = results
    .filter(r =>
      r.scores.hallucination_flags.length >= 2 ||
      r.scores.abstain_correct === false ||
      (r.scores.abstained && r.query.type === "factual")
    )
    .map(r => ({
      id:       r.query.id,
      question: r.query.question,
      reason:   r.scores.abstain_correct === false
        ? "should_have_abstained"
        : r.scores.flags?.length >= 2
          ? "hallucination_risk"
          : "abstained_on_factual",
      flags:    r.scores.hallucination_flags,
    }));

  return {
    generated_at:     new Date().toISOString(),
    totals: {
      total,
      succeeded,
      failed,
      answered,
      abstained,
      answer_rate:     `${((answered / succeeded) * 100).toFixed(1)}%`,
      abstain_rate:    `${((abstained / succeeded) * 100).toFixed(1)}%`,
    },
    time_sensitive_accuracy: {
      total:              timeSensitive.length,
      correctly_abstained: correctlyAbstained,
      incorrectly_answered: incorrectlyAnswered,
      accuracy:           timeSensitive.length > 0
        ? `${((correctlyAbstained / timeSensitive.length) * 100).toFixed(1)}%`
        : "n/a",
    },
    hallucination_risk: {
      high_risk_count: highRisk,
      flag_breakdown:  flagCounts,
    },
    latency: {
      avg_ms: avgLatency,
      p95_ms: p95Latency,
    },
    by_category:   categories,
    by_difficulty: difficulty,
    needs_review:  needsReview,
  };
}

// ─── PROGRESS LOGGER ─────────────────────────────────────────────────────────

function logProgress(result, current, total) {
  const { query, queryResult, scores } = result;
  const pct    = ((current / total) * 100).toFixed(0).padStart(3);
  const status = !queryResult.ok
    ? "✗ ERROR  "
    : scores.abstained
      ? "○ ABSTAIN"
      : scores.answered
        ? "✓ ANSWERED"
        : "? UNCLEAR";

  const flags  = scores.hallucination_flags.length > 0
    ? ` [⚠ ${scores.hallucination_flags.join(", ")}]`
    : "";

  const latency = queryResult.ok ? ` ${queryResult.latencyMs}ms` : ` ${queryResult.error}`;

  console.log(
    `  [${pct}%] ${query.id.padEnd(5)} ${status.padEnd(10)} ` +
    `${latency.padStart(7)} | ${query.question.slice(0, 55)}${query.question.length > 55 ? "…" : ""}` +
    flags
  );
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═════════════════════════════════════════════════════════");
  console.log("  Sparky Eval Runner");
  console.log(`  Endpoint: ${CHAT_ENDPOINT}`);
  console.log("═════════════════════════════════════════════════════════\n");

  const args = parseArgs();

  // ── Load queries ──────────────────────────────────────────────────────────
  let queries;
  try {
    queries = loadQueries(QUERIES_FILE, args);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }

  console.log(`📋  Loaded ${queries.length} queries`);
  if (args.category) console.log(`    Category filter: ${args.category}`);
  if (args.limit)    console.log(`    Limit: ${args.limit}`);
  console.log(`    Concurrency: ${CONCURRENCY} | Timeout: ${REQUEST_TIMEOUT_MS}ms\n`);

  // ── Verify server is up ───────────────────────────────────────────────────
  try {
    const ping = await fetch(BASE_URL, { signal: AbortSignal.timeout(3000) });
    console.log(`✅  Server reachable at ${BASE_URL} (${ping.status})\n`);
  } catch {
    console.error(`❌  Cannot reach ${BASE_URL} — is the Next.js server running?\n`);
    console.error(`    Run: npm run dev\n`);
    process.exit(1);
  }

  // ── Run queries ───────────────────────────────────────────────────────────
  console.log("─────────────────────────────────────────────────────────");
  const startMs = Date.now();
  const results = await runQueries(queries, logProgress);
  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log("─────────────────────────────────────────────────────────\n");

  // ── Build outputs ─────────────────────────────────────────────────────────
  const summary = buildSummary(results);

  // Full results — one entry per query
  const fullResults = {
    _meta: {
      generated_at:  new Date().toISOString(),
      total_queries: results.length,
      elapsed_sec:   parseFloat(elapsedSec),
      endpoint:      CHAT_ENDPOINT,
    },
    results: results.map(({ query, queryResult, scores }) => ({
      id:           query.id,
      question:     query.question,
      category:     query.category,
      difficulty:   query.difficulty,
      type:         query.type,
      response:     queryResult.response ?? null,
      error:        queryResult.error    ?? null,
      latency_ms:   queryResult.latencyMs,
      ttfb_ms:      queryResult.ttfbMs   ?? null,
      server_abstained: queryResult.abstainedByServer,
      abstain_reason:   queryResult.abstainReason,
      scores,
    })),
  };

  // ── Write files ───────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(RESULTS_FILE), { recursive: true });
  fs.writeFileSync(RESULTS_FILE, JSON.stringify(fullResults, null, 2), "utf-8");
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2),     "utf-8");

  // ── Print summary ─────────────────────────────────────────────────────────
  const t = summary.totals;
  const ts = summary.time_sensitive_accuracy;
  const lat = summary.latency;

  console.log("═════════════════════════════════════════════════════════");
  console.log("  RESULTS SUMMARY");
  console.log("═════════════════════════════════════════════════════════");
  console.log(`  Total queries:        ${t.total}`);
  console.log(`  Succeeded:            ${t.succeeded}`);
  console.log(`  Failed/timeout:       ${t.failed}`);
  console.log(`  Answered:             ${t.answered} (${t.answer_rate})`);
  console.log(`  Abstained:            ${t.abstained} (${t.abstain_rate})`);
  console.log("");
  console.log(`  Time-sensitive:       ${ts.total} queries`);
  console.log(`  → Correctly abstained: ${ts.correctly_abstained} (${ts.accuracy})`);
  console.log(`  → Incorrectly answered: ${ts.incorrectly_answered}`);
  console.log("");
  console.log(`  Hallucination risk:   ${summary.hallucination_risk.high_risk_count} high-risk responses`);
  console.log(`  Avg latency:          ${lat.avg_ms}ms`);
  console.log(`  P95 latency:          ${lat.p95_ms}ms`);
  console.log(`  Total elapsed:        ${elapsedSec}s`);
  console.log("");

  if (summary.needs_review.length > 0) {
    console.log(`  ⚠  ${summary.needs_review.length} responses flagged for human review:`);
    for (const r of summary.needs_review.slice(0, 10)) {
      console.log(`    ${r.id}: ${r.reason} — "${r.question.slice(0, 50)}"`);
    }
    if (summary.needs_review.length > 10) {
      console.log(`    ... and ${summary.needs_review.length - 10} more (see summary file)`);
    }
  }

  console.log("");
  console.log(`  💾  ${RESULTS_FILE}`);
  console.log(`  💾  ${SUMMARY_FILE}`);
  console.log("═════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
