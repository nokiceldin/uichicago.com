/**
 * analyze-eval-failures.mjs
 * scripts/analyze-eval-failures.mjs
 *
 * Sparky Autonomous Eval Failure Analyzer
 *
 * Reads rubric eval results (and optionally heuristic eval results for
 * server-side trace fields), then produces:
 *
 *   artifacts/eval/eval-failures-only.json
 *   artifacts/eval/eval-failure-clusters.json
 *   artifacts/eval/eval-failure-report.md
 *   artifacts/eval/claude-fix-prompts.md
 *   artifacts/eval/rerun-targets.json
 *
 * Run:
 *   node scripts/analyze-eval-failures.mjs
 *   node scripts/analyze-eval-failures.mjs --input=public/data/eval/rubric-results.json
 *   node scripts/analyze-eval-failures.mjs --threshold=8
 *   node scripts/analyze-eval-failures.mjs --llm        # adds LLM diagnosis pass
 */

import fs   from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");

// ─── CONFIG ───────────────────────────────────────────────────────────────────

const DEFAULT_INPUT    = path.join(ROOT, "public/data/eval/rubric-results.json");
const HEURISTIC_INPUT  = path.join(ROOT, "public/data/eval/sparky-eval-results.json");
const OUT_DIR          = path.join(ROOT, "artifacts/eval");

// Failure threshold — cases scoring below this are analyzed
const DEFAULT_THRESHOLD = 7.0;

// Cluster definitions — deterministic heuristics, evaluated in order
// First matching cluster wins per case
const CLUSTER_RULES = [
  {
    id: "wrong_domain_fallback",
    name: "Wrong Domain Fallback (Athletics Redirect)",
    description: "Sparky returned the athletics redirect for a non-athletics question",
    detect: (r) =>
      r.response_text?.includes("UICFlames.com") &&
      r.category !== "athletics",
    root_cause: "Athletics roster scan in analyzeQuery() matches short common words, boosting athletics confidence above the real domain. getAbstainResponse() then picks the top-confidence domain (athletics) for the redirect.",
    code_areas: ["analyzeQuery() — athletics roster scan word filter", "getAbstainResponse() — domain selection logic"],
    fix: "Increase minimum word length in the athletics roster qParts filter from 3 to 5 chars. Add a stopword list for common academic terms (credits, dorms, graduate, freshmen).",
    issue_type: "system_bug",
    confidence: "high",
  },
  {
    id: "retrieval_empty_but_data_exists",
    name: "Retrieval Empty — Data Exists in System",
    description: "Sparky abstained but the answer exists in structured JSON data",
    detect: (r) =>
      (r.sparky_trace?.abstain_reason === "no_chunks" ||
       r.sparky_trace?.abstain_reason === "insufficient_evidence" ||
       r.sparky_trace?.abstain_reason === "low_score") &&
      r.expected_behavior === "answer" &&
      !r.response_text?.includes("UICFlames.com"),
    root_cause: "Domain confidence scoring didn't assign high enough score to trigger sync retriever, OR rerankChunks dropped valid chunks below MIN_RELEVANCE threshold.",
    code_areas: ["analyzeQuery() — domainConfidence keyword lists", "trust-decision.ts — MIN_RELEVANCE constant", "rerankChunks() — threshold behavior"],
    fix: "Add missing keywords to domain confidence scoring. Lower MIN_RELEVANCE from 0.35 to 0.25 in trust-decision.ts. Add keyword bypass rules in sync dispatch block.",
    issue_type: "system_bug",
    confidence: "high",
  },
  {
    id: "trust_threshold_too_strict",
    name: "Trust Threshold Too Strict",
    description: "Chunks were retrieved but trust layer blocked the answer",
    detect: (r) =>
      r.sparky_trace?.abstain_reason === "insufficient_evidence" &&
      r.expected_behavior === "answer" &&
      !r.response_text?.includes("UICFlames.com"),
    root_cause: "topCombinedScore (relevance × sourceConfidence) falls below ANSWER_THRESHOLD or HEDGE_THRESHOLD in trust-decision.ts. Chunks exist but scored borderline.",
    code_areas: ["trust-decision.ts — ANSWER_THRESHOLD, HEDGE_THRESHOLD, MIN_RELEVANCE"],
    fix: "Lower MIN_RELEVANCE threshold. Ensure stable-fact domains always answer with any single high-confidence source.",
    issue_type: "trust_logic",
    confidence: "medium",
  },
  {
    id: "over_confident_factual_error",
    name: "Over-Confident Factual Error",
    description: "Sparky answered confidently with wrong or partially wrong facts",
    detect: (r) =>
      r.forbidden_claims_found?.length > 0 &&
      r.subscores?.safety < 1,
    root_cause: "Retrieved chunk contains correct general data but model overgeneralizes or ignores a caveat present in the data. The chunk wording doesn't explicitly flag the exception.",
    code_areas: ["retrieval content strings — specific retriever functions", "system prompt trust instruction for 'answer' mode"],
    fix: "Add explicit exception language to the chunk content (e.g., 'excluding basketball' for ticket pricing). Use hedge trust instruction for financial/access claims.",
    issue_type: "system_bug",
    confidence: "high",
  },
  {
    id: "correct_abstain_incomplete_redirect",
    name: "Correct Abstain — Incomplete Redirect",
    description: "Sparky correctly abstained but didn't provide the right redirect URL",
    detect: (r) =>
      r.actual_behavior === "abstain" &&
      r.expected_behavior === "abstain" &&
      r.missed_facts?.some(f => f.includes(".edu") || f.includes("url") || f.includes("URL")),
    root_cause: "getAbstainResponse() for this domain doesn't include specific URL redirects that the eval spec requires.",
    code_areas: ["getAbstainResponse() — domain response strings"],
    fix: "Add specific URLs (events.uic.edu, connect.uic.edu) to the relevant getAbstainResponse domain entries.",
    issue_type: "system_bug",
    confidence: "high",
  },
  {
    id: "eval_spec_issue",
    name: "Eval Spec Issue — Not a Sparky Bug",
    description: "Sparky's answer was likely correct but the spec's reference facts were incomplete or the judge penalized accurate data",
    detect: (r) =>
      r.score < 7 &&
      r.actual_behavior === r.expected_behavior &&
      r.behavior_correct === true &&
      r.judge_reasoning?.toLowerCase().includes("fabricat") &&
      r.subscores?.factual_correctness < 2,
    root_cause: "Judge flagged accurate data from Sparky's DB as 'fabricated' because the spec's reference_facts didn't include those specific values. The spec is incomplete, not Sparky.",
    code_areas: ["public/data/eval/sparky-eval-specs.json — reference_facts arrays"],
    fix: "Update the spec's reference_facts to include the correct values Sparky produces (GPA ranges, specific numbers from grade DB).",
    issue_type: "eval_spec",
    confidence: "medium",
  },
  {
    id: "partial_answer_missing_core_fact",
    name: "Partial Answer — Missing Core Fact",
    description: "Sparky answered but missed a required core fact from the spec",
    detect: (r) =>
      r.actual_behavior === "answer" &&
      r.missed_facts?.length > 0 &&
      r.subscores?.completeness < 2,
    root_cause: "Retrieved chunk doesn't contain the specific fact, or the chunk was ranked below the token budget cutoff in assembleContext().",
    code_areas: ["assembleContext() — TOKEN_LIMIT and scoring", "specific retriever content strings"],
    fix: "Add missing fact to the relevant retriever's content string. Or increase TOKEN_LIMIT for this domain type.",
    issue_type: "system_bug",
    confidence: "medium",
  },
  {
    id: "incorrect_abstain_has_data",
    name: "Incorrect Abstain — Data Was Available",
    description: "Sparky abstained on a question the system has clear data for",
    detect: (r) =>
      r.actual_behavior === "abstain" &&
      r.expected_behavior === "answer" &&
      r.score < 4,
    root_cause: "Domain not detected, retriever not triggered, or trust layer rejected valid chunks. Multi-step failure.",
    code_areas: ["analyzeQuery() domainConfidence", "sync dispatch block", "trust-decision.ts"],
    fix: "Add keyword detection for the query's topic. Add sync dispatch bypass. Check MIN_RELEVANCE threshold.",
    issue_type: "system_bug",
    confidence: "high",
  },
];

// ─── CLI ARGS ─────────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    input:     args.find(a => a.startsWith("--input="))?.split("=")[1] ?? DEFAULT_INPUT,
    threshold: parseFloat(args.find(a => a.startsWith("--threshold="))?.split("=")[1] ?? DEFAULT_THRESHOLD),
    llm:       args.includes("--llm"),
  };
}

// ─── LOAD + ENRICH ────────────────────────────────────────────────────────────

function loadResults(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Results file not found: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  return raw.results ?? raw;
}

/**
 * Load heuristic eval results (sparky-eval-results.json) and merge
 * server-side trace fields (server_abstained, abstain_reason, latency_ms)
 * into the rubric results where IDs match.
 */
function mergeHeuristicTrace(rubricResults) {
  if (!fs.existsSync(HEURISTIC_INPUT)) return rubricResults;

  const heuristic = JSON.parse(fs.readFileSync(HEURISTIC_INPUT, "utf-8"));
  const hMap = {};
  for (const r of (heuristic.results ?? heuristic)) {
    hMap[r.id] = r;
  }

  return rubricResults.map(r => {
    const h = hMap[r.id];
    if (!h) return r;
    return {
      ...r,
      // Fill in sparky_trace from heuristic results if rubric runner didn't capture it
      sparky_trace: r.sparky_trace ?? {
        server_abstained: h.server_abstained ?? false,
        abstain_reason:   h.abstain_reason   ?? null,
      },
      latency_ms:   r.latency_ms   ?? h.latency_ms,
      // Fill in response_text from heuristic if rubric runner didn't store it
      response_text: r.response_text ?? h.response ?? null,
    };
  });
}

// ─── CLUSTER ─────────────────────────────────────────────────────────────────

function clusterFailures(failures) {
  const clusters = {};
  const unclustered = [];

  for (const r of failures) {
    let matched = false;
    for (const rule of CLUSTER_RULES) {
      if (rule.detect(r)) {
        if (!clusters[rule.id]) {
          clusters[rule.id] = {
            cluster_id:      rule.id,
            name:            rule.name,
            description:     rule.description,
            root_cause:      rule.root_cause,
            code_areas:      rule.code_areas,
            fix:             rule.fix,
            issue_type:      rule.issue_type,
            confidence:      rule.confidence,
            cases:           [],
          };
        }
        clusters[rule.id].cases.push(r);
        matched = true;
        break; // first matching rule wins
      }
    }
    if (!matched) unclustered.push(r);
  }

  // Add unclustered group if any
  if (unclustered.length > 0) {
    clusters["unclustered"] = {
      cluster_id:  "unclustered",
      name:        "Unclustered Failures",
      description: "Failed cases that don't match any known failure pattern",
      root_cause:  "Unknown — requires manual inspection",
      code_areas:  [],
      fix:         "Manual investigation required",
      issue_type:  "unknown",
      confidence:  "low",
      cases:       unclustered,
    };
  }

  // Build final cluster objects with stats
  return Object.values(clusters).map(c => ({
    cluster_id:        c.cluster_id,
    name:              c.name,
    description:       c.description,
    affected_count:    c.cases.length,
    affected_ids:      c.cases.map(r => r.id),
    avg_score:         Math.round(c.cases.reduce((s, r) => s + r.score, 0) / c.cases.length * 10) / 10,
    common_symptoms:   extractSymptoms(c.cases),
    root_cause:        c.root_cause,
    code_areas:        c.code_areas,
    recommended_fix:   c.fix,
    confidence:        c.confidence,
    issue_type:        c.issue_type,
    cases:             c.cases.map(r => ({
      id:             r.id,
      question:       r.question,
      score:          r.score,
      actual_behavior: r.actual_behavior,
      abstain_reason: r.sparky_trace?.abstain_reason ?? null,
      judge_reasoning: r.judge_reasoning,
      missed_facts:   r.missed_facts,
    })),
  })).sort((a, b) => b.affected_count - a.affected_count);
}

function extractSymptoms(cases) {
  const symptoms = new Set();
  for (const r of cases) {
    if (r.actual_behavior !== r.expected_behavior) symptoms.add(`behavior_mismatch: expected ${r.expected_behavior}, got ${r.actual_behavior}`);
    if (r.sparky_trace?.server_abstained) symptoms.add("server_abstained");
    if (r.sparky_trace?.abstain_reason) symptoms.add(`abstain_reason:${r.sparky_trace.abstain_reason}`);
    if (r.subscores?.factual_correctness === 0) symptoms.add("zero_factual_correctness");
    if (r.subscores?.trust_behavior === 0) symptoms.add("zero_trust_behavior");
    if (r.forbidden_claims_found?.length > 0) symptoms.add("forbidden_claim_found");
    if (r.missed_facts?.length > 0) symptoms.add("missed_required_facts");
    if (r.response_text?.includes("UICFlames.com")) symptoms.add("athletics_redirect_on_non_athletics");
    if (r.response_length <= 110) symptoms.add("response_too_short_likely_canned");
  }
  return [...symptoms];
}

// ─── LEVERAGE RANKING ────────────────────────────────────────────────────────

function rankByLeverage(clusters) {
  return [...clusters]
    .filter(c => c.issue_type !== "eval_spec") // eval spec issues don't improve Sparky
    .map(c => ({
      ...c,
      leverage_score: c.affected_count * (c.confidence === "high" ? 3 : c.confidence === "medium" ? 2 : 1),
    }))
    .sort((a, b) => b.leverage_score - a.leverage_score);
}

// ─── LLM DIAGNOSIS (optional) ────────────────────────────────────────────────

async function llmDiagnose(clusters, failures) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("  ⚠  ANTHROPIC_API_KEY not set — skipping LLM diagnosis pass");
    return null;
  }

  const evidence = failures.slice(0, 8).map(r => ({
    id: r.id,
    question: r.question,
    score: r.score,
    actual_behavior: r.actual_behavior,
    expected_behavior: r.expected_behavior,
    abstain_reason: r.sparky_trace?.abstain_reason,
    judge_reasoning: r.judge_reasoning?.slice(0, 200),
    missed_facts: r.missed_facts?.slice(0, 3),
  }));

  const prompt = `You are a senior AI systems engineer diagnosing failures in Sparky, a retrieval-based university assistant.

Here are the ${failures.length} failing eval cases (score < ${failures[0]?.score ?? 7}/10):

${JSON.stringify(evidence, null, 2)}

Deterministic clustering already identified these groups:
${clusters.map(c => `- ${c.name} (${c.affected_count} cases)`).join("\n")}

Your job: In 3-5 sentences, identify any patterns the deterministic clustering may have missed. Focus on systemic retrieval or trust logic issues. Be specific about code areas. Do not repeat what clustering already found.

Return JSON: { "additional_patterns": ["..."], "highest_priority_fix": "...", "systemic_observation": "..." }
Do not include any text outside the JSON.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 512,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) return null;
  const data = await res.json();
  const text = data.content.map(b => b.text ?? "").join("").trim()
    .replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(text); } catch { return null; }
}

// ─── REPORT GENERATION ───────────────────────────────────────────────────────

function generateReport(failures, clusters, allResults, threshold, llmDiagnosis) {
  const total = allResults.length;
  const passed = allResults.filter(r => r.passed).length;
  const avgScore = allResults.length > 0
    ? (allResults.reduce((s, r) => s + r.score, 0) / allResults.length).toFixed(1)
    : 0;

  const rankedClusters = rankByLeverage(clusters);
  const specIssues = clusters.filter(c => c.issue_type === "eval_spec");
  const realIssues = clusters.filter(c => c.issue_type !== "eval_spec");

  const scoreDistribution = { "0-3": 0, "4-6": 0, "7-8": 0, "9-10": 0 };
  for (const r of allResults) {
    if (r.score <= 3) scoreDistribution["0-3"]++;
    else if (r.score <= 6) scoreDistribution["4-6"]++;
    else if (r.score <= 8) scoreDistribution["7-8"]++;
    else scoreDistribution["9-10"]++;
  }

  const lines = [];

  lines.push(`# Sparky Eval Failure Report`);
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push(``);

  // 1. Headline summary
  lines.push(`## Summary`);
  lines.push(``);
  lines.push(`| Metric | Value |`);
  lines.push(`|--------|-------|`);
  lines.push(`| Total cases | ${total} |`);
  lines.push(`| Avg score | ${avgScore}/10 |`);
  lines.push(`| Pass rate (≥${threshold}) | ${passed}/${total} (${((passed/total)*100).toFixed(1)}%) |`);
  lines.push(`| Failing cases | ${failures.length} |`);
  lines.push(`| Real system bugs | ${realIssues.reduce((s, c) => s + c.affected_count, 0)} cases |`);
  lines.push(`| Eval spec issues | ${specIssues.reduce((s, c) => s + c.affected_count, 0)} cases |`);
  lines.push(``);

  // 2. Score distribution
  lines.push(`## Score Distribution`);
  lines.push(``);
  for (const [range, count] of Object.entries(scoreDistribution)) {
    const bar = "█".repeat(count);
    lines.push(`\`${range}\` ${bar} ${count}`);
  }
  lines.push(``);

  // 3. Lowest scoring
  lines.push(`## Lowest Scoring Cases`);
  lines.push(``);
  const worst = [...failures].sort((a, b) => a.score - b.score).slice(0, 10);
  for (const r of worst) {
    lines.push(`### ${r.id} — ${r.score}/10 (${r.category})`);
    lines.push(`**Q:** ${r.question}`);
    lines.push(`**Expected:** ${r.expected_behavior} | **Got:** ${r.actual_behavior}`);
    if (r.sparky_trace?.abstain_reason) lines.push(`**Abstain reason:** \`${r.sparky_trace.abstain_reason}\``);
    lines.push(`**Judge:** ${r.judge_reasoning?.slice(0, 200)}`);
    if (r.missed_facts?.length > 0) lines.push(`**Missed:** ${r.missed_facts.slice(0, 3).join("; ")}`);
    if (r.forbidden_claims_found?.length > 0) lines.push(`**Forbidden claims:** ${r.forbidden_claims_found.slice(0, 2).join("; ")}`);
    lines.push(``);
  }

  // 4. Failure clusters
  lines.push(`## Failure Clusters`);
  lines.push(``);
  for (const c of clusters) {
    const typeLabel = { system_bug: "🔴 System Bug", eval_spec: "🟡 Spec Issue", trust_logic: "🟠 Trust Logic", data_issue: "🔵 Data Issue", unknown: "⚪ Unknown" }[c.issue_type] ?? c.issue_type;
    lines.push(`### ${c.name} — ${c.affected_count} cases ${typeLabel}`);
    lines.push(`**IDs:** ${c.affected_ids.join(", ")}`);
    lines.push(`**Avg score:** ${c.avg_score}/10 | **Confidence:** ${c.confidence}`);
    lines.push(`**Root cause:** ${c.root_cause}`);
    lines.push(`**Code areas:** ${c.code_areas.join(", ") || "N/A"}`);
    lines.push(`**Fix:** ${c.recommended_fix}`);
    lines.push(`**Symptoms:** ${c.common_symptoms.join(", ")}`);
    lines.push(``);
  }

  // 5. Recommended fixes ranked by leverage
  lines.push(`## Recommended Fixes (Ranked by Leverage)`);
  lines.push(``);
  lines.push(`_Ranking: expected failures removed × implementation simplicity × low regression risk_`);
  lines.push(``);
  let rank = 1;
  for (const c of rankedClusters.slice(0, 6)) {
    lines.push(`### Fix ${rank}: ${c.name}`);
    lines.push(`- **Affects:** ${c.affected_count} cases (${c.affected_ids.join(", ")})`);
    lines.push(`- **Effort:** ${c.confidence === "high" ? "Low — targeted change" : "Medium — needs investigation"}`);
    lines.push(`- **Change:** ${c.recommended_fix}`);
    lines.push(`- **Files:** ${c.code_areas.join(", ")}`);
    lines.push(``);
    rank++;
  }

  // 6. Spec vs real issues
  lines.push(`## Spec Issues vs Real System Issues`);
  lines.push(``);
  if (specIssues.length > 0) {
    lines.push(`### Eval Spec Issues (not Sparky bugs)`);
    for (const c of specIssues) {
      lines.push(`- **${c.affected_ids.join(", ")}**: ${c.root_cause}`);
    }
    lines.push(``);
  }
  lines.push(`### Real System Issues`);
  for (const c of realIssues) {
    lines.push(`- **${c.name}** (${c.affected_ids.join(", ")}): ${c.recommended_fix}`);
  }
  lines.push(``);

  // 7. Rerun plan
  lines.push(`## Suggested Rerun Plan`);
  lines.push(``);
  const highLeverageIds = rankedClusters.slice(0, 3).flatMap(c => c.affected_ids);
  lines.push(`After applying top fixes, run this minimal subset to verify:`);
  lines.push(``);
  lines.push(`\`\`\`bash`);
  lines.push(`node scripts/eval-sparky.mjs --ids=${[...new Set(highLeverageIds)].join(",")}`);
  lines.push(`ANTHROPIC_API_KEY=your_key node scripts/rubric-eval-runner.mjs --live --ids=${[...new Set(highLeverageIds)].join(",")}`);
  lines.push(`\`\`\``);
  lines.push(``);

  if (llmDiagnosis) {
    lines.push(`## LLM Diagnosis (Additional Patterns)`);
    lines.push(``);
    if (llmDiagnosis.systemic_observation) lines.push(`**Systemic observation:** ${llmDiagnosis.systemic_observation}`);
    if (llmDiagnosis.highest_priority_fix) lines.push(`**Highest priority fix:** ${llmDiagnosis.highest_priority_fix}`);
    if (llmDiagnosis.additional_patterns?.length > 0) {
      lines.push(`**Additional patterns:**`);
      for (const p of llmDiagnosis.additional_patterns) lines.push(`- ${p}`);
    }
  }

  return lines.join("\n");
}

// ─── FIX PROMPTS ─────────────────────────────────────────────────────────────

function generateFixPrompts(clusters) {
  const realClusters = clusters.filter(c => c.issue_type !== "eval_spec" && c.affected_count > 0);
  const lines = [];

  lines.push(`# Claude Fix Prompts — Sparky Eval Failures`);
  lines.push(`_Generated: ${new Date().toISOString()}_`);
  lines.push(`_Paste each prompt directly to Claude for implementation._`);
  lines.push(``);

  for (const c of realClusters) {
    lines.push(`---`);
    lines.push(``);
    lines.push(`## ${c.name}`);
    lines.push(`_Affects ${c.affected_count} cases: ${c.affected_ids.join(", ")}_`);
    lines.push(``);
    lines.push(`### Prompt`);
    lines.push(``);
    lines.push(`\`\`\``);
    lines.push(`You are working on Sparky, a retrieval-based AI assistant for UIC (University of Illinois Chicago).`);
    lines.push(``);
    lines.push(`PROBLEM:`);
    lines.push(c.root_cause);
    lines.push(``);
    lines.push(`EVIDENCE FROM FAILING CASES:`);
    for (const cas of c.cases.slice(0, 4)) {
      lines.push(`- ${cas.id}: "${cas.question}" → ${cas.actual_behavior} (score: ${cas.score}/10)`);
      if (cas.abstain_reason) lines.push(`  abstain_reason: ${cas.abstain_reason}`);
      if (cas.judge_reasoning) lines.push(`  judge: ${cas.judge_reasoning.slice(0, 150)}`);
    }
    lines.push(``);
    lines.push(`LIKELY RELEVANT FILES/FUNCTIONS:`);
    for (const area of c.code_areas) lines.push(`- ${area}`);
    lines.push(``);
    lines.push(`PATCH OBJECTIVE:`);
    lines.push(c.recommended_fix);
    lines.push(``);
    lines.push(`CONSTRAINTS:`);
    lines.push(`- Make only the minimal change needed to fix this specific failure`);
    lines.push(`- Do not refactor unrelated code`);
    lines.push(`- Do not change trust-decision.ts (unless this is a trust threshold issue)`);
    lines.push(`- Do not change the eval runner or spec files`);
    lines.push(`- Every change must be justified by the evidence above`);
    lines.push(``);
    lines.push(`REGRESSION CHECK — run these after applying the patch:`);
    lines.push(`node scripts/eval-sparky.mjs --ids=${c.affected_ids.join(",")}`);
    lines.push(`\`\`\``);
    lines.push(``);
  }

  return lines.join("\n");
}

// ─── RERUN TARGETS ────────────────────────────────────────────────────────────

function buildRerunTargets(failures, clusters) {
  const allFailedIds = failures.map(r => r.id);

  const byCluster = {};
  for (const c of clusters) {
    byCluster[c.cluster_id] = c.affected_ids;
  }

  // Highest leverage: real bugs only, deduped, sorted by cluster priority
  const rankedReal = rankByLeverage(clusters);
  const highLeverageIds = [...new Set(
    rankedReal.slice(0, 3).flatMap(c => c.affected_ids)
  )];

  return {
    all_failed_ids: allFailedIds,
    by_cluster: byCluster,
    highest_leverage_subset: highLeverageIds,
    rerun_commands: {
      heuristic: `node scripts/eval-sparky.mjs --ids=${highLeverageIds.join(",")}`,
      rubric:    `ANTHROPIC_API_KEY=your_key node scripts/rubric-eval-runner.mjs --live --ids=${highLeverageIds.join(",")}`,
      full_rubric: `ANTHROPIC_API_KEY=your_key node scripts/rubric-eval-runner.mjs --live`,
    },
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("\n═══════════════════════════════════════════════════════");
  console.log("  Sparky Eval Failure Analyzer");
  console.log("═══════════════════════════════════════════════════════\n");

  const args = parseArgs();
  const threshold = args.threshold;

  // Load results
  let results;
  try {
    results = loadResults(args.input);
    console.log(`📥  Loaded ${results.length} results from ${path.basename(args.input)}`);
  } catch (err) {
    console.error(`❌  ${err.message}`);
    process.exit(1);
  }

  // Merge heuristic trace fields
  results = mergeHeuristicTrace(results);
  const heuristicMerged = results.filter(r => r.sparky_trace?.abstain_reason !== undefined).length;
  if (heuristicMerged > 0) {
    console.log(`🔗  Merged trace fields from heuristic eval for ${heuristicMerged} cases`);
  }

  // Extract failures
  const failures = results.filter(r => r.score < threshold);
  console.log(`🔍  Failures (score < ${threshold}): ${failures.length}/${results.length}`);

  if (failures.length === 0) {
    console.log(`\n✅  No failures found. Sparky is passing all cases at threshold ${threshold}.\n`);
    process.exit(0);
  }

  // Cluster
  const clusters = clusterFailures(failures);
  console.log(`📊  Clustered into ${clusters.length} groups:`);
  for (const c of clusters) {
    console.log(`    ${c.cluster_id}: ${c.affected_count} cases — ${c.name}`);
  }

  // Optional LLM pass
  let llmDiagnosis = null;
  if (args.llm) {
    console.log(`\n🤖  Running LLM diagnosis pass...`);
    llmDiagnosis = await llmDiagnose(clusters, failures);
    if (llmDiagnosis) console.log(`    Done.`);
  }

  // Generate outputs
  const failuresOnly = failures.map(r => ({
    id:               r.id,
    question:         r.question,
    category:         r.category,
    difficulty:       r.difficulty,
    expected_behavior: r.expected_behavior,
    actual_behavior:  r.actual_behavior,
    score:            r.score,
    subscores:        r.subscores,
    passed:           r.passed,
    judge_reasoning:  r.judge_reasoning,
    missed_facts:     r.missed_facts,
    forbidden_claims_found: r.forbidden_claims_found,
    response_text:    r.response_text,
    sparky_trace:     r.sparky_trace,
    latency_ms:       r.latency_ms,
  }));

  const report    = generateReport(failures, clusters, results, threshold, llmDiagnosis);
  const prompts   = generateFixPrompts(clusters);
  const rerunTargets = buildRerunTargets(failures, clusters);

  // Write outputs
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const writes = [
    [path.join(OUT_DIR, "eval-failures-only.json"),    JSON.stringify(failuresOnly, null, 2)],
    [path.join(OUT_DIR, "eval-failure-clusters.json"), JSON.stringify(clusters, null, 2)],
    [path.join(OUT_DIR, "eval-failure-report.md"),     report],
    [path.join(OUT_DIR, "claude-fix-prompts.md"),      prompts],
    [path.join(OUT_DIR, "rerun-targets.json"),         JSON.stringify(rerunTargets, null, 2)],
  ];

  for (const [filePath, content] of writes) {
    fs.writeFileSync(filePath, content, "utf-8");
  }

  // Summary
  const rankedFixes = rankByLeverage(clusters);
  console.log(`\n─────────────────────────────────────────────────────────`);
  console.log(`  TOP FIXES BY LEVERAGE`);
  console.log(`─────────────────────────────────────────────────────────`);
  for (const [i, c] of rankedFixes.slice(0, 5).entries()) {
    console.log(`  ${i + 1}. [${c.affected_count} cases] ${c.name}`);
    console.log(`     → ${c.recommended_fix.slice(0, 100)}`);
  }

  console.log(`\n  Highest leverage rerun subset: ${rerunTargets.highest_leverage_subset.join(", ")}`);
  console.log(`\n  Output files:`);
  for (const [filePath] of writes) {
    console.log(`  💾  ${filePath}`);
  }
  console.log(`\n═══════════════════════════════════════════════════════\n`);
}

main().catch(err => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
