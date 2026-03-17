// scripts/run-eval.mjs
//
// Eval harness for Sparky. Runs questions against your local dev server
// and scores each response.
//
// Usage:
//   node --env-file=.env scripts/run-eval.mjs                         # run all
//   node --env-file=.env scripts/run-eval.mjs --category should_abstain
//   node --env-file=.env scripts/run-eval.mjs --id eval_001
//   node --env-file=.env scripts/run-eval.mjs --url http://localhost:3001
//
// Requires: local dev server running at http://localhost:3000
//   npm run dev

import "dotenv/config";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";

// ── Config ────────────────────────────────────────────────────────────────────
const DEFAULT_URL   = "http://localhost:3000";
const EVAL_FILE     = path.join(process.cwd(), "eval", "questions.json");
const HISTORY_FILE  = path.join(process.cwd(), "eval", "eval-history.json");
const DELAY_MS      = 800; // delay between questions to avoid hammering the server

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}
const filterCategory = getArg("category");
const filterId       = getArg("id");
const chatUrl        = (getArg("url") ?? DEFAULT_URL) + "/api/chat";

// ── Load questions ────────────────────────────────────────────────────────────
if (!fs.existsSync(EVAL_FILE)) {
  console.error(`❌  eval/questions.json not found at ${EVAL_FILE}`);
  console.error("    Create the eval/ directory and questions.json first.");
  process.exit(1);
}

let questions = JSON.parse(fs.readFileSync(EVAL_FILE, "utf8"));
if (filterCategory) questions = questions.filter(q => q.category === filterCategory);
if (filterId)       questions = questions.filter(q => q.id === filterId);

if (questions.length === 0) {
  console.error("❌  No questions matched your filter.");
  process.exit(1);
}

console.log(`\n🧪 Sparky Eval Harness`);
console.log(`   Target: ${chatUrl}`);
console.log(`   Questions: ${questions.length}${filterCategory ? ` (category: ${filterCategory})` : ""}${filterId ? ` (id: ${filterId})` : ""}`);
console.log(`   ${"─".repeat(55)}\n`);

// ── Anthropic client (for haiku judge) ───────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ── Call Sparky ───────────────────────────────────────────────────────────────
async function callSparky(question, priorTurn = null) {
  const messages = [];

  if (priorTurn) {
    messages.push({ role: "user",      content: priorTurn });
    messages.push({ role: "assistant", content: "Got it." });
  }
  messages.push({ role: "user", content: question });

  try {
    const res = await fetch(chatUrl, {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie":        "sparky_session=eval_runner_session_fixed",
      },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      return { text: `HTTP_ERROR:${res.status}`, abstained: false, error: true };
    }

    // Detect abstention from header (set by abstention gate)
    const abstainedHeader = res.headers.get("x-abstained") === "true";

    // Read streamed text to completion
    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }

    // Also detect abstention from response content (in case header isn't set)
    const lowerText = text.toLowerCase();
    const contentAbstained =
      lowerText.includes("don't have") ||
      lowerText.includes("i don't have") ||
      lowerText.includes("can't confirm") ||
      lowerText.includes("not have reliable") ||
      lowerText.includes("don't have reliable");

    return {
      text:      text.trim(),
      abstained: abstainedHeader || contentAbstained,
      error:     false,
    };
  } catch (err) {
    return { text: `FETCH_ERROR: ${err.message}`, abstained: false, error: true };
  }
}

// ── Scoring ───────────────────────────────────────────────────────────────────

// exact_string: all mustContain strings present, none of mustNotContain present
// Case-sensitive by default.
function scoreExactString(answer, gt, caseInsensitive = false) {
  const haystack = caseInsensitive ? answer.toLowerCase() : answer;
  const must    = gt.mustContain    ?? [];
  const mustNot = gt.mustNotContain ?? [];

  const containsPasses = must.every(s =>
    haystack.includes(caseInsensitive ? s.toLowerCase() : s)
  );
  const notContainsPasses = mustNot.every(s =>
    !haystack.includes(caseInsensitive ? s.toLowerCase() : s)
  );

  return {
    pass:   containsPasses && notContainsPasses,
    detail: {
      mustContainChecks:    must.map(s => ({ term: s, found: haystack.includes(caseInsensitive ? s.toLowerCase() : s) })),
      mustNotContainChecks: mustNot.map(s => ({ term: s, found: haystack.includes(caseInsensitive ? s.toLowerCase() : s) })),
    },
  };
}

// abstain_check: Sparky should have refused to answer.
// Passes if response contains abstain signals and no forbidden confident claims.
function scoreAbstainCheck(answer, gt) {
  const lower    = answer.toLowerCase();
  const must     = gt.mustContain    ?? [];
  const mustNot  = gt.mustNotContain ?? [];

  const hasAbstainSignal  = must.some(s => lower.includes(s.toLowerCase()));
  const hasNoForbidden    = mustNot.every(s => !lower.includes(s.toLowerCase()));
  const hasRedirect       = !!(lower.match(/\.edu|\.gov|\d{3}-\d{3}-\d{4}|suite|office|contact/));

  return {
    pass:   hasAbstainSignal && hasNoForbidden,
    detail: { hasAbstainSignal, hasNoForbidden, hasRedirect },
  };
}

// haiku_judge: uses Claude Haiku to evaluate correctness when ground truth
// can't be expressed as simple string matching.
async function scoreHaikuJudge(question, answer, gt) {
  try {
    const prompt = `You are evaluating a university AI assistant called Sparky.

Question: "${question}"
Sparky's answer: "${answer}"
Evaluation criteria: ${gt.judgePrompt ?? "Is this answer accurate, specific, and grounded in real UIC data?"}

Return ONLY valid JSON, no markdown:
{"pass": true or false, "reason": "one sentence explanation"}`;

    const response = await anthropic.messages.create({
      model:      "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw   = (response.content[0]).text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(raw);
    return { pass: parsed.pass, detail: { reason: parsed.reason } };
  } catch (err) {
    return { pass: false, detail: { reason: `Judge error: ${err.message}`, error: true } };
  }
}

async function score(question, answer, evalItem) {
  const gt     = evalItem.groundTruth;
  const method = gt.scoringMethod;

  // Abstain questions: first check that Sparky actually abstained
  if (evalItem.shouldAbstain) {
    return scoreAbstainCheck(answer, gt);
  }

  switch (method) {
    case "exact_string":    return scoreExactString(answer, gt, false);
    case "exact_string_ci": return scoreExactString(answer, gt, true);
    case "abstain_check":   return scoreAbstainCheck(answer, gt);
    case "haiku_judge":     return await scoreHaikuJudge(question, answer, gt);
    default:                return scoreExactString(answer, gt, false);
  }
}

// ── Result formatting ─────────────────────────────────────────────────────────
const PASS = "✅";
const FAIL = "❌";
const WARN = "⚠️ ";

function truncate(s, n = 90) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ── Main eval loop ─────────────────────────────────────────────────────────────
const results   = [];
let passed      = 0;
let failed      = 0;
let errorCount  = 0;
const categoryStats = {};

for (const q of questions) {
  const label = `[${q.id}] ${q.category}`;
  process.stdout.write(`  ${label.padEnd(40)} `);

  const { text: answer, abstained, error } = await callSparky(
    q.question,
    q.priorTurn ?? null
  );

  if (error) {
    console.log(`${FAIL} ${answer}`);
    errorCount++;
    results.push({ ...q, pass: false, answer, error: true, runAt: new Date().toISOString() });
    if (!categoryStats[q.category]) categoryStats[q.category] = { pass: 0, fail: 0 };
    categoryStats[q.category].fail++;
    await sleep(DELAY_MS);
    continue;
  }

  // Extra check: should_abstain questions that Sparky answered confidently
  const failedToAbstain = q.shouldAbstain && !abstained;

  const scoreResult = await score(q.question, answer, q);
  const pass        = scoreResult.pass && !failedToAbstain;

  if (pass) {
    passed++;
    console.log(`${PASS}`);
  } else if (failedToAbstain) {
    failed++;
    console.log(`${WARN} SHOULD HAVE ABSTAINED — answered: "${truncate(answer, 70)}"`);
  } else {
    failed++;
    // Show which mustContain terms were missing
    const missing = scoreResult.detail?.mustContainChecks
      ?.filter(c => !c.found)
      ?.map(c => `"${c.term}"`)
      ?.join(", ");
    const badTerms = scoreResult.detail?.mustNotContainChecks
      ?.filter(c => c.found)
      ?.map(c => `"${c.term}"`)
      ?.join(", ");
    const hint = [
      missing  ? `missing: ${missing}`  : "",
      badTerms ? `bad: ${badTerms}`     : "",
    ].filter(Boolean).join(" | ");
    console.log(`${FAIL} ${hint || truncate(answer, 60)}`);
  }

  if (!categoryStats[q.category]) categoryStats[q.category] = { pass: 0, fail: 0 };
  if (pass) categoryStats[q.category].pass++;
  else      categoryStats[q.category].fail++;

  results.push({
    id:              q.id,
    category:        q.category,
    question:        q.question,
    shouldAbstain:   q.shouldAbstain,
    pass,
    failedToAbstain,
    answer:          answer.slice(0, 500),
    scoreDetail:     scoreResult.detail,
    runAt:           new Date().toISOString(),
  });

  await sleep(DELAY_MS);
}

// ── Summary ───────────────────────────────────────────────────────────────────
const total = passed + failed + errorCount;
const pct   = total > 0 ? ((passed / total) * 100).toFixed(1) : "0";

console.log(`\n  ${"─".repeat(55)}`);
console.log(`  RESULTS: ${passed}/${total} passed (${pct}%)`);
if (errorCount > 0) console.log(`  Errors (server unreachable etc): ${errorCount}`);

// Category breakdown
const categoryOrder = [
  "financial_aid_tuition",
  "housing",
  "academic_calendar",
  "campus_logistics",
  "athletics_student_life",
  "course_gpa",
  "gen_ed",
  "professor_for_course",
  "major_requirements",
  "should_abstain",
];

console.log(`\n  By category:`);
const allCategories = [...new Set([...categoryOrder, ...Object.keys(categoryStats)])];
for (const cat of allCategories) {
  const s = categoryStats[cat];
  if (!s) continue;
  const catTotal = s.pass + s.fail;
  const catPct   = catTotal > 0 ? ((s.pass / catTotal) * 100).toFixed(0) : "0";
  const filled   = Math.round((s.pass / catTotal) * 12);
  const bar      = "█".repeat(filled) + "░".repeat(12 - filled);
  console.log(`  ${cat.padEnd(28)} ${bar} ${catPct.padStart(3)}%  (${s.pass}/${catTotal})`);
}

// Failed questions detail
const failedResults = results.filter(r => !r.pass && !r.error);
if (failedResults.length > 0) {
  console.log(`\n  ${"─".repeat(55)}`);
  console.log(`  FAILED QUESTIONS:\n`);
  for (const r of failedResults) {
    const flag = r.failedToAbstain ? `${WARN} Failed to abstain` : `${FAIL} Wrong answer`;
    console.log(`  ${r.id} — ${r.question}`);
    console.log(`  ${flag}`);
    console.log(`  Answer: "${truncate(r.answer, 120)}"`);
    if (r.scoreDetail?.mustContainChecks) {
      const missing = r.scoreDetail.mustContainChecks.filter(c => !c.found).map(c => c.term);
      if (missing.length > 0) console.log(`  Missing: ${missing.join(", ")}`);
    }
    if (r.scoreDetail?.mustNotContainChecks) {
      const bad = r.scoreDetail.mustNotContainChecks.filter(c => c.found).map(c => c.term);
      if (bad.length > 0) console.log(`  Should not contain: ${bad.join(", ")}`);
    }
    console.log();
  }
}

// ── Save history ──────────────────────────────────────────────────────────────
const runRecord = {
  runAt:          new Date().toISOString(),
  totalPass:      passed,
  totalFail:      failed,
  totalQuestions: total,
  passPct:        parseFloat(pct),
  filterCategory: filterCategory ?? null,
  filterId:       filterId ?? null,
  categoryStats,
  results,
};

fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
let history = [];
if (fs.existsSync(HISTORY_FILE)) {
  try { history = JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch {}
}
history.push(runRecord);
fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), "utf8");

// Update questions.json with last run scores
const allQuestions = JSON.parse(fs.readFileSync(EVAL_FILE, "utf8"));
const resultMap    = new Map(results.map(r => [r.id, r]));
const updated      = allQuestions.map(q => {
  const r = resultMap.get(q.id);
  if (!r) return q;
  return {
    ...q,
    lastRunScore:  r.pass ? 1 : 0,
    lastRunAt:     r.runAt,
    lastRunAnswer: r.answer?.slice(0, 200) ?? null,
  };
});
fs.writeFileSync(EVAL_FILE, JSON.stringify(updated, null, 2), "utf8");

console.log(`  ${"─".repeat(55)}`);
console.log(`  History saved → eval/eval-history.json\n`);

// ── Helpers ───────────────────────────────────────────────────────────────────
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}