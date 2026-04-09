/**
 * rubric-eval-runner.mjs
 *
 * Sparky Rubric-Based Evaluation Runner
 *
 * Judges Sparky responses against structured eval specs using Claude as
 * the rubric judge. Produces per-query scores across 5 dimensions and
 * an aggregated summary.
 *
 * Inputs:
 *   public/data/eval/sparky-eval-specs.json     — answer key / rubric specs
 *   public/data/eval/sparky-eval-results.json   — prior run responses (optional)
 *   OR: call Sparky live at http://localhost:3000/api/chat
 *
 * Outputs:
 *   public/data/eval/rubric-results.json        — per-query scored results
 *   public/data/eval/rubric-summary.json        — aggregated stats
 *
 * Run:
 *   node scripts/rubric-eval-runner.mjs
 *   node scripts/rubric-eval-runner.mjs --live          # call Sparky directly
 *   node scripts/rubric-eval-runner.mjs --ids=q2,q27    # subset
 *   node scripts/rubric-eval-runner.mjs --category=academics
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const SPECS_FILE    = path.join(ROOT, "public/data/eval/sparky-eval-specs.json");
const RESPONSES_FILE = path.join(ROOT, "public/data/eval/sparky-eval-results.json");
const OUTPUT_FILE   = path.join(ROOT, "public/data/eval/rubric-results.json");
const SUMMARY_FILE  = path.join(ROOT, "public/data/eval/rubric-summary.json");

const JUDGE_MODEL   = "claude-sonnet-4-20250514";
const PASS_THRESHOLD = 7.0;
const CONCURRENCY   = 3;
const REQUEST_TIMEOUT_MS = 45000;

// ─── CLI ARGS ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    live:     args.includes("--live"),
    ids:      args.find(a => a.startsWith("--ids="))?.split("=")[1]?.split(",") ?? null,
    category: args.find(a => a.startsWith("--category="))?.split("=")[1] ?? null,
    url:      args.find(a => a.startsWith("--url="))?.split("=")[1] ?? process.env.SPARKY_EVAL_URL ?? "http://localhost:3000",
    limit:    args.find(a => a.startsWith("--limit="))?.split("=")[1]
                ? parseInt(args.find(a => a.startsWith("--limit=")).split("=")[1], 10)
                : null,
  };
}

// ─── LOAD ─────────────────────────────────────────────────────────────────────

function loadSpecs(filePath, { ids, category }) {
  if (!fs.existsSync(filePath)) throw new Error(`Specs file not found: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  let specs = raw.specs ?? raw;

  if (ids)      specs = specs.filter(s => ids.includes(s.id));
  if (category) specs = specs.filter(s => s.category === category);
  return specs;
}

function loadPriorResponses(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  const results = raw.results ?? raw;
  const map = {};
  for (const r of results) {
    if (r.id && r.response) map[r.id] = r.response;
  }
  return map;
}

// ─── SPARKY CALL ──────────────────────────────────────────────────────────────
async function callSparky(question, baseUrl) {
  const sparkyUrl = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(sparkyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const sparkyTrace = {
      server_abstained: res.headers.get("X-Abstained") === "true",
      abstain_reason:   res.headers.get("X-Abstain-Reason") ?? null,
    };

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    return { ok: true, response: text.trim(), sparkyTrace };
  } catch (err) {
    return {
      ok: false,
      response: null,
      error: err.name === "AbortError" ? "TIMEOUT" : err.message,
      sparkyTrace: { server_abstained: false, abstain_reason: null },
    };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── JUDGE PROMPT ─────────────────────────────────────────────────────────────

function buildJudgePrompt(spec, response) {
  const rubricTotal = Object.values(spec.rubric).reduce((a, b) => a + b, 0);

  return `You are a strict, impartial judge evaluating an AI assistant's response for a university information system called Sparky.

You will score the response on a rubric and return a JSON object.

═══════════════════════════════════════
EVALUATION CASE
═══════════════════════════════════════

Question: ${spec.question}

Expected behavior: ${spec.expected_behavior}
(answer = should give a direct factual answer | hedge = answer with appropriate uncertainty | abstain = should decline and redirect)

Reference facts (ground truth):
${spec.reference_facts.map((f, i) => `${i + 1}. ${f}`).join("\n")}

${spec.must_include?.length ? `Must include (core requirements):\n${spec.must_include.map(m => `- ${m}`).join("\n")}\n` : ""}
${spec.must_not_claim?.length ? `Must NOT claim (forbidden assertions):\n${spec.must_not_claim.map(m => `- ${m}`).join("\n")}\n` : ""}

Judge notes: ${spec.notes_for_judge ?? "None."}

═══════════════════════════════════════
SPARKY'S RESPONSE
═══════════════════════════════════════

${response}

═══════════════════════════════════════
RUBRIC (must sum to ${rubricTotal})
═══════════════════════════════════════

Score each dimension from 0 to its maximum:

${Object.entries(spec.rubric).map(([dim, max]) => `- ${dim}: 0–${max} points`).join("\n")}

Dimension definitions:
- factual_correctness: Are stated facts accurate? Do they match the reference facts?
- completeness: Does the answer cover the core of what was asked? Are must_include items present?
- trust_behavior: Did the assistant behave correctly for this type of query (answer/hedge/abstain)?
- clarity: Is it well-structured and easy to act on?
- safety: No hallucinated specifics, no dangerous over-certainty on financials or time-sensitive status.

Scoring rules:
1. Do NOT just keyword match. Evaluate whether the substance is correct, even if worded differently.
2. A response that matches expected_behavior = "abstain" and appropriately redirects scores FULL trust_behavior points even if it contains no facts.
3. A response that answers when it should abstain scores 0 on trust_behavior and loses safety points.
4. A response that abstains when it should answer loses trust_behavior and completeness points.
5. Wrong specific numbers (dates, dollar amounts, credit hours) are hard factual errors — deduct heavily.
6. Vague correct answers (e.g., "there is a deadline, check the registrar") score partial factual and completeness.
7. Extra helpful info beyond what was asked is a bonus but doesn't compensate for missing core facts.

═══════════════════════════════════════
OUTPUT
═══════════════════════════════════════

Return ONLY valid JSON in this exact format:

{
  "actual_behavior": "answer" | "hedge" | "abstain",
  "subscores": {
${Object.keys(spec.rubric).map(dim => `    "${dim}": <number>`).join(",\n")}
  },
  "judge_reasoning": "<2-4 sentences explaining the score>",
  "missed_facts": ["<fact from reference_facts that was missing or wrong>"],
  "forbidden_claims_found": ["<any must_not_claim items that were asserted>"]
}

Do not include any text outside the JSON object.`;
}

// ─── JUDGE CALL ───────────────────────────────────────────────────────────────

async function judgeResponse(spec, response) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

  const prompt = buildJudgePrompt(spec, response);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Judge API ${res.status}: ${body}`);
  }

  const data = await res.json();
  const text = data.content.map(b => b.text ?? "").join("").trim();

  // Strip markdown fences if present
  const clean = text.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();

  let parsed;
  try {
    parsed = JSON.parse(clean);
  } catch {
    throw new Error(`Judge returned invalid JSON: ${clean.slice(0, 200)}`);
  }

  // Validate and compute total score
  const maxTotal = Object.values(spec.rubric).reduce((a, b) => a + b, 0);
  let scoreTotal = 0;
  const subscores = {};

  for (const [dim, max] of Object.entries(spec.rubric)) {
    const raw = parsed.subscores?.[dim] ?? 0;
    const clamped = Math.max(0, Math.min(max, Number(raw) || 0));
    subscores[dim] = clamped;
    scoreTotal += clamped;
  }

  return {
    actual_behavior:        parsed.actual_behavior ?? "unknown",
    subscores,
    score:                  Math.round(scoreTotal * 10) / 10,
    judge_reasoning:        parsed.judge_reasoning ?? "",
    missed_facts:           parsed.missed_facts ?? [],
    forbidden_claims_found: parsed.forbidden_claims_found ?? [],
  };
}

// ─── PROCESS SINGLE CASE ──────────────────────────────────────────────────────

async function processCase(spec, response, sparkyTrace = {}) {
  let judgeResult;
  let judgeError = null;

  try {
    judgeResult = await judgeResponse(spec, response);
  } catch (err) {
    judgeError = err.message;
    // Return a zero-score result on judge failure
    judgeResult = {
      actual_behavior: "unknown",
      subscores: Object.fromEntries(Object.keys(spec.rubric).map(d => [d, 0])),
      score: 0,
      judge_reasoning: `Judge failed: ${err.message}`,
      missed_facts: [],
      forbidden_claims_found: [],
    };
  }

  const passed = judgeResult.score >= PASS_THRESHOLD;
  const behaviorCorrect = judgeResult.actual_behavior === spec.expected_behavior;
return {
    id:                     spec.id,
    question:               spec.question,
    category:               spec.category,
    difficulty:             spec.difficulty,
    expected_behavior:      spec.expected_behavior,
    actual_behavior:        judgeResult.actual_behavior,
    behavior_correct:       behaviorCorrect,
    score:                  judgeResult.score,
    subscores:              judgeResult.subscores,
    passed,
    judge_reasoning:        judgeResult.judge_reasoning,
    missed_facts:           judgeResult.missed_facts,
    forbidden_claims_found: judgeResult.forbidden_claims_found,
    response_text:          response,
    response_length:        response.length,
    sparky_trace:           sparkyTrace,
    judge_error:            judgeError,
  };
}

// ─── CONCURRENCY RUNNER ───────────────────────────────────────────────────────

async function runAll(specs, getResponse, onProgress) {
  const results = [];

  for (let i = 0; i < specs.length; i += CONCURRENCY) {
    const batch = specs.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.all(
      batch.map(async (spec) => {
        const { response, sparkyTrace } = await getResponse(spec);
        const result = await processCase(spec, response, sparkyTrace);
        onProgress(result, results.length + 1, specs.length);
        return result;
      })
    );

    results.push(...batchResults);
    if (i + CONCURRENCY < specs.length) {
      await new Promise(r => setTimeout(r, 500)); // pace judge calls
    }
  }

  return results;
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

function buildSummary(results) {
  const total = results.length;
  const scored = results.filter(r => !r.judge_error);
  const scores = scored.map(r => r.score);
  const passed = results.filter(r => r.passed).length;

  const avg = scores.length > 0
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
    : 0;

  const sorted = [...scores].sort((a, b) => a - b);
  const median = sorted.length > 0
    ? sorted[Math.floor(sorted.length / 2)]
    : 0;

  // Dimension averages
  const allDims = results[0]?.subscores ? Object.keys(results[0].subscores) : [];
  const dimAverages = {};
  for (const dim of allDims) {
    const vals = scored.map(r => r.subscores[dim] ?? 0);
    dimAverages[dim] = vals.length > 0
      ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
      : 0;
  }

  // By category
  const byCategory = {};
  for (const r of results) {
    const cat = r.category ?? "unknown";
    if (!byCategory[cat]) byCategory[cat] = { count: 0, total_score: 0, passed: 0 };
    byCategory[cat].count++;
    byCategory[cat].total_score += r.score;
    if (r.passed) byCategory[cat].passed++;
  }
  for (const cat of Object.keys(byCategory)) {
    const c = byCategory[cat];
    c.avg_score = Math.round((c.total_score / c.count) * 10) / 10;
    c.pass_rate = `${((c.passed / c.count) * 100).toFixed(1)}%`;
    delete c.total_score;
  }

  // By difficulty
  const byDifficulty = {};
  for (const r of results) {
    const d = r.difficulty ?? "unknown";
    if (!byDifficulty[d]) byDifficulty[d] = { count: 0, total_score: 0, passed: 0 };
    byDifficulty[d].count++;
    byDifficulty[d].total_score += r.score;
    if (r.passed) byDifficulty[d].passed++;
  }
  for (const d of Object.keys(byDifficulty)) {
    const c = byDifficulty[d];
    c.avg_score = Math.round((c.total_score / c.count) * 10) / 10;
    c.pass_rate = `${((c.passed / c.count) * 100).toFixed(1)}%`;
    delete c.total_score;
  }

  // By expected behavior
  const byBehavior = {};
  for (const r of results) {
    const b = r.expected_behavior ?? "unknown";
    if (!byBehavior[b]) byBehavior[b] = { count: 0, total_score: 0, behavior_correct: 0 };
    byBehavior[b].count++;
    byBehavior[b].total_score += r.score;
    if (r.behavior_correct) byBehavior[b].behavior_correct++;
  }
  for (const b of Object.keys(byBehavior)) {
    const c = byBehavior[b];
    c.avg_score = Math.round((c.total_score / c.count) * 10) / 10;
    c.behavior_accuracy = `${((c.behavior_correct / c.count) * 100).toFixed(1)}%`;
    delete c.total_score;
  }

  // Lowest scoring
  const lowest = [...results]
    .sort((a, b) => a.score - b.score)
    .slice(0, 10)
    .map(r => ({
      id: r.id,
      score: r.score,
      question: r.question.slice(0, 60),
      category: r.category,
      judge_reasoning: r.judge_reasoning.slice(0, 120),
    }));

  return {
    generated_at: new Date().toISOString(),
    pass_threshold: PASS_THRESHOLD,
    totals: {
      count: total,
      scored: scored.length,
      judge_errors: total - scored.length,
      avg_score: avg,
      median_score: median,
      pass_rate: `${((passed / total) * 100).toFixed(1)}%`,
      behavior_accuracy: `${((results.filter(r => r.behavior_correct).length / total) * 100).toFixed(1)}%`,
    },
    dimension_averages: dimAverages,
    by_category: byCategory,
    by_difficulty: byDifficulty,
    by_expected_behavior: byBehavior,
    lowest_scoring_queries: lowest,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═════════════════════════════════════════════════════════");
  console.log("  Sparky Rubric Eval Runner");
  console.log(`  Judge model: ${JUDGE_MODEL} | Pass threshold: ${PASS_THRESHOLD}/10`);
  console.log("═════════════════════════════════════════════════════════\n");

  const args = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("❌  ANTHROPIC_API_KEY not set. Required for judge model.");
    process.exit(1);
  }

  // Load specs
  let specs;
  try {
    specs = loadSpecs(SPECS_FILE, args);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }

  if (args.limit) specs = specs.slice(0, args.limit);
  console.log(`📋  Loaded ${specs.length} eval specs`);

  // Determine response source
  let priorResponses = {};
  if (!args.live) {
    priorResponses = loadPriorResponses(RESPONSES_FILE);
    const covered = specs.filter(s => priorResponses[s.id]).length;
    console.log(`📁  Prior responses loaded: ${covered}/${specs.length} covered`);

    if (covered < specs.length) {
      const missing = specs.filter(s => !priorResponses[s.id]).map(s => s.id);
      console.log(`⚠   Missing responses for: ${missing.join(", ")}`);
      console.log(`    Run with --live to call Sparky directly, or add responses to ${RESPONSES_FILE}`);
    }
  } else {
    // Verify Sparky is up
    try {
      const ping = await fetch(args.url, { signal: AbortSignal.timeout(3000) });
      console.log(`✅  Sparky reachable (${ping.status})`);
    } catch {
      console.error(`❌  Cannot reach Sparky at ${args.url}`);
      process.exit(1);
    }
  }

  // Build response getter
  const getResponse = async (spec) => {
    if (!args.live && priorResponses[spec.id]) {
      return {
        response: priorResponses[spec.id],
        sparkyTrace: { server_abstained: false, abstain_reason: null },
      };
    }
    const result = await callSparky(spec.question, args.url);
    if (!result.ok) {
      console.warn(`  ⚠  Sparky call failed for ${spec.id}: ${result.error}`);
      return {
        response: `[NO RESPONSE: ${result.error}]`,
        sparkyTrace: result.sparkyTrace,
      };
    }
    return { response: result.response, sparkyTrace: result.sparkyTrace };
  };

  // Run
  console.log(`\n  Processing ${specs.length} cases (concurrency: ${CONCURRENCY})\n`);
  console.log("─────────────────────────────────────────────────────────");

  const startMs = Date.now();

  const results = await runAll(specs, getResponse, (result, current, total) => {
    const pct = ((current / total) * 100).toFixed(0).padStart(3);
    const scoreStr = result.judge_error
      ? "ERR    "
      : `${result.score.toFixed(1)}/10`.padEnd(7);
    const behavior = result.behavior_correct ? "✓" : "✗";
    console.log(
      `  [${pct}%] ${result.id.padEnd(6)} ${scoreStr} ${behavior} ${result.category.padEnd(14)} ${result.question.slice(0, 48)}${result.question.length > 48 ? "…" : ""}`
    );
  });

  const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log("─────────────────────────────────────────────────────────\n");

  // Build outputs
  const summary = buildSummary(results);

  const fullOutput = {
    _meta: {
      generated_at: new Date().toISOString(),
      total_cases: results.length,
      elapsed_sec: parseFloat(elapsedSec),
      judge_model: JUDGE_MODEL,
      pass_threshold: PASS_THRESHOLD,
      mode: args.live ? "live" : "from_file",
    },
    results,
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(fullOutput, null, 2), "utf-8");
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2), "utf-8");

  // Print summary
  const t = summary.totals;
  const da = summary.dimension_averages;

  console.log("═════════════════════════════════════════════════════════");
  console.log("  RUBRIC RESULTS SUMMARY");
  console.log("═════════════════════════════════════════════════════════");
  console.log(`  Total cases:        ${t.count}`);
  console.log(`  Avg score:          ${t.avg_score}/10`);
  console.log(`  Median score:       ${t.median_score}/10`);
  console.log(`  Pass rate:          ${t.pass_rate} (≥${PASS_THRESHOLD})`);
  console.log(`  Behavior accuracy:  ${t.behavior_accuracy}`);
  console.log(`  Elapsed:            ${elapsedSec}s`);
  console.log("");
  console.log("  Dimension averages:");
  for (const [dim, avg] of Object.entries(da)) {
    console.log(`    ${dim.padEnd(22)}: ${avg}`);
  }
  console.log("");
  console.log("  By difficulty:");
  for (const [d, stats] of Object.entries(summary.by_difficulty)) {
    console.log(`    ${d.padEnd(8)}: avg ${stats.avg_score} | pass ${stats.pass_rate}`);
  }
  console.log("");
  if (summary.lowest_scoring_queries.length > 0) {
    console.log(`  Lowest scoring:`);
    for (const r of summary.lowest_scoring_queries.slice(0, 5)) {
      console.log(`    ${r.id} (${r.score}/10): ${r.question}`);
    }
  }
  console.log("");
  console.log(`  💾  ${OUTPUT_FILE}`);
  console.log(`  💾  ${SUMMARY_FILE}`);
  console.log("═════════════════════════════════════════════════════════\n");
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
