/**
 * scripts/run-schedule-eval.mjs
 *
 * Tests Sparky's 4-year plan generation for 20 majors.
 * For each case it calls /api/chat and verifies that every
 * FIXED (non-elective) course code from the expected schedule
 * appears in Sparky's response.
 *
 * Usage:
 *   node scripts/run-schedule-eval.mjs              # all 20
 *   node scripts/run-schedule-eval.mjs --id 3       # single case by number
 *   node scripts/run-schedule-eval.mjs --url http://localhost:3001
 *
 * Requires: local dev server running  →  npm run dev
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname  = path.dirname(fileURLToPath(import.meta.url));
const ROOT       = path.resolve(__dirname, "..");
const CASES_FILE = path.join(ROOT, "artifacts/eval/schedule-eval-cases.json");
const DELAY_MS   = 1200;

// ── Args ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const idArg   = args.find(a => a.startsWith("--id="))?.split("=")[1] ?? null;
const urlArg  = args.find(a => a.startsWith("--url="))?.split("=")[1] ?? "http://localhost:3000";
const CHAT_URL = urlArg + "/api/chat";

// ── Load cases ────────────────────────────────────────────────────────────────
let cases = JSON.parse(fs.readFileSync(CASES_FILE, "utf-8"));
if (idArg) cases = cases.filter((_, i) => String(i + 1) === idArg);

if (cases.length === 0) {
  console.error("No cases matched.");
  process.exit(1);
}

// ── Extract required course codes from a case ─────────────────────────────────
// Parse the expected_schedule string to pull out all non-elective course codes
function extractFixedCodes(expectedSchedule) {
  const codes = [];
  for (const line of expectedSchedule.split("\n")) {
    // Lines like: "- CS 111 — Program Design I (3 cr)"  (no [electiveType])
    if (line.startsWith("- ") && !line.includes("[") && !line.includes("(elective)")) {
      const match = line.match(/^- ([A-Z]{2,5}\s+\d{3}[A-Z]?)/);
      if (match) codes.push(match[1]);
    }
  }
  return [...new Set(codes)];
}

// ── Call Sparky ───────────────────────────────────────────────────────────────
async function callSparky(query) {
  const res = await fetch(CHAT_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ messages: [{ role: "user", content: query }] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text.trim();
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log("\n========================================================");
console.log("  Sparky Schedule Eval");
console.log(`  Target : ${CHAT_URL}`);
console.log(`  Cases  : ${cases.length}`);
console.log("========================================================\n");

const results = [];
let passed = 0;
let failed = 0;

for (let i = 0; i < cases.length; i++) {
  const c      = cases[i];
  const num    = idArg ? idArg : i + 1;
  const fixed  = extractFixedCodes(c.expected_schedule);
  const label  = c.major.replace(/ - (BS|BA|BFA|BMus).*/, "").trim();

  process.stdout.write(`  [${num}/${idArg ? 1 : cases.length}] ${label.padEnd(42)} `);

  let answer = "";
  let error  = null;

  try {
    answer = await callSparky(c.query);
  } catch (err) {
    error = err.message;
  }

  if (error) {
    console.log(`ERROR — ${error}`);
    results.push({ major: c.major, pass: false, error });
    failed++;
    continue;
  }

  // Check every fixed course code appears in the answer
  const missing = fixed.filter(code => !answer.includes(code));
  const pass    = missing.length === 0;

  if (pass) {
    console.log(`PASS  (${fixed.length} required courses all present)`);
    passed++;
  } else {
    console.log(`FAIL  — missing ${missing.length}/${fixed.length}: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? "…" : ""}`);
    failed++;
  }

  results.push({
    major:        c.major,
    query:        c.query,
    pass,
    fixedCount:   fixed.length,
    missingCodes: missing,
    answerSnippet: answer.slice(0, 400),
  });

  if (i < cases.length - 1) await new Promise(r => setTimeout(r, DELAY_MS));
}

// ── Summary ───────────────────────────────────────────────────────────────────
const total = passed + failed;
const pct   = total > 0 ? ((passed / total) * 100).toFixed(0) : "0";

console.log(`\n  ${"─".repeat(55)}`);
console.log(`  RESULTS: ${passed}/${total} passed (${pct}%)\n`);

const failedResults = results.filter(r => !r.pass);
if (failedResults.length > 0) {
  console.log("  FAILED:\n");
  for (const r of failedResults) {
    if (r.error) {
      console.log(`  ✗ ${r.major}`);
      console.log(`    Error: ${r.error}\n`);
    } else {
      console.log(`  ✗ ${r.major}`);
      console.log(`    Missing codes: ${r.missingCodes.join(", ")}`);
      console.log(`    Answer snippet: "${r.answerSnippet.slice(0, 200)}"\n`);
    }
  }
}

// Save results
const outPath = path.join(ROOT, "artifacts/eval/schedule-eval-results.json");
fs.writeFileSync(outPath, JSON.stringify({ runAt: new Date().toISOString(), passed, failed, pct: parseFloat(pct), results }, null, 2));
console.log(`  Results saved → artifacts/eval/schedule-eval-results.json`);
console.log(`  ${"─".repeat(55)}\n`);
