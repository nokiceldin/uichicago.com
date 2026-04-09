/**
 * execute-self-improvement-candidate.mjs
 *
 * Safe candidate executor for Sparky's autonomous improvement loop.
 *
 * This script does not auto-edit production code. It:
 * 1. Picks the top proposed candidate (or a specified candidate)
 * 2. Creates a patch proposal artifact
 * 3. Optionally auto-applies a known safe candidate patch locally
 * 4. Runs targeted rubric evals when the candidate has affected eval IDs
 * 5. Produces a promote / reject / manual decision artifact
 *
 * Run:
 *   node --env-file=.env scripts/execute-self-improvement-candidate.mjs
 *   node --env-file=.env scripts/execute-self-improvement-candidate.mjs --candidate-id=candidate_x
 *   node --env-file=.env scripts/execute-self-improvement-candidate.mjs --with-llm
 *   node --env-file=.env scripts/execute-self-improvement-candidate.mjs --auto-apply
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const PATHS = {
  candidates: path.join(ROOT, "artifacts/autonomous-improvement/candidates.json"),
  clusters: path.join(ROOT, "artifacts/autonomous-improvement/clusters.json"),
  generatedFeedbackEvals: path.join(ROOT, "artifacts/autonomous-improvement/generated-feedback-evals.json"),
  generatedFeedbackEvalResults: path.join(ROOT, "artifacts/autonomous-improvement/generated-feedback-eval-results.json"),
  rubricResults: path.join(ROOT, "public/data/eval/rubric-results.json"),
  execRoot: path.join(ROOT, "artifacts/autonomous-improvement/executions"),
};

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

const AUTO_APPLY_SUPPORTED_CANDIDATES = new Set([
  "candidate_direct_rule_or_fast_path_quality",
]);

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (name, fallback = null) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

  return {
    candidateId: getValue("candidate-id"),
    withLlm: args.includes("--with-llm"),
    skipEvals: args.includes("--skip-evals"),
    autoApply: args.includes("--auto-apply"),
    url: getValue("url", process.env.SPARKY_EVAL_URL ?? "http://localhost:3000"),
    supportedOnly: args.includes("--supported-only"),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function writeText(filePath, text) {
  fs.writeFileSync(filePath, text, "utf-8");
}

function summarize(text, max = 220) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function selectCandidate(candidatesJson, candidateId, supportedOnly = false) {
  const candidates = candidatesJson?.candidates ?? [];
  if (candidates.length === 0) {
    throw new Error("No candidates found. Run the improvement loop first.");
  }

  if (candidateId) {
    const match = candidates.find((candidate) => candidate.candidateId === candidateId);
    if (!match) throw new Error(`Candidate not found: ${candidateId}`);
    return match;
  }

  if (supportedOnly) {
    const supported = [...candidates]
      .filter((candidate) => AUTO_APPLY_SUPPORTED_CANDIDATES.has(candidate.candidateId))
      .sort((a, b) => b.leverageScore - a.leverageScore);
    if (supported.length > 0) return supported[0];
    throw new Error("No supported auto-apply candidates found.");
  }

  return [...candidates].sort((a, b) => b.leverageScore - a.leverageScore)[0];
}

function findCluster(clustersJson, candidate) {
  const clusters = clustersJson?.clusters ?? [];
  return clusters.find((cluster) => cluster.clusterId === candidate.clusterId) ?? null;
}

function extractBaselineResults(rubricJson, ids) {
  const results = rubricJson?.results ?? [];
  if (!ids.length) return [];
  return results.filter((item) => ids.includes(item.id));
}

function buildDeterministicProposal(candidate, cluster) {
  const lines = [];

  lines.push(`# Patch Proposal: ${candidate.title}`);
  lines.push("");
  lines.push(`Candidate ID: \`${candidate.candidateId}\``);
  lines.push(`Patch type: \`${candidate.patchType}\``);
  lines.push("");
  lines.push("## Goal");
  lines.push("");
  lines.push(candidate.hypothesis);
  lines.push("");
  lines.push("## Suggested Scope");
  lines.push("");
  for (const file of candidate.targetFiles) {
    lines.push(`- Inspect and patch \`${file}\``);
  }
  if (candidate.targetFiles.length === 0) {
    lines.push("- Manual investigation required before any code change.");
  }
  lines.push("");
  lines.push("## Why This Candidate");
  lines.push("");
  lines.push(`- Acceptance gate: ${candidate.acceptanceGate}`);
  lines.push(`- Affected eval IDs: ${candidate.affectedEvalIds.length ? candidate.affectedEvalIds.join(", ") : "none"}`);
  lines.push(`- Affected feedback cases: ${candidate.affectedFeedbackIds.length ? candidate.affectedFeedbackIds.join(", ") : "none"}`);
  if (cluster?.description) {
    lines.push(`- Cluster summary: ${cluster.description}`);
  }
  lines.push("");
  lines.push("## Example Incidents");
  lines.push("");
  for (const incident of candidate.exampleIncidents ?? []) {
    lines.push(`- ${incident.sourceId}: ${incident.question}`);
    lines.push(`  Current answer: ${incident.answer}`);
    if (incident.notes?.length) {
      lines.push(`  Notes: ${incident.notes.join(" | ")}`);
    }
  }
  lines.push("");
  lines.push("## Eval Gate");
  lines.push("");
  if (candidate.affectedEvalIds.length) {
    lines.push(`- Re-run rubric evals for: ${candidate.affectedEvalIds.join(", ")}`);
    lines.push("- Promote only if the average score improves and no targeted case regresses.");
  } else {
    lines.push("- No direct eval IDs are attached to this candidate.");
    lines.push("- Use manual review and targeted follow-up eval authoring before promotion.");
  }

  return lines.join("\n") + "\n";
}

async function maybeBuildLlmProposal(candidate, cluster) {
  if (!anthropic) return null;

  const prompt = [
    "You are preparing a patch proposal for Sparky, a UIC student assistant.",
    "Do not propose retraining or autonomous production edits.",
    "Write a concrete implementation proposal that a developer could apply safely.",
    "",
    `Candidate: ${candidate.title}`,
    `Patch type: ${candidate.patchType}`,
    `Hypothesis: ${candidate.hypothesis}`,
    `Acceptance gate: ${candidate.acceptanceGate}`,
    `Target files: ${candidate.targetFiles.join(", ") || "manual triage"}`,
    `Cluster description: ${cluster?.description ?? "n/a"}`,
    "",
    "Example incidents:",
    ...(candidate.exampleIncidents ?? []).map((incident, index) =>
      `${index + 1}. ${incident.question}\nCurrent answer: ${incident.answer}\nNotes: ${(incident.notes ?? []).join(" | ")}`
    ),
    "",
    "Return plain markdown with these sections only:",
    "1. Goal",
    "2. Likely code changes",
    "3. Risks",
    "4. Eval plan",
  ].join("\n");

  try {
    const response = await anthropic.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 500,
      messages: [{ role: "user", content: prompt }],
    });
    return response.content[0]?.type === "text" ? response.content[0].text : null;
  } catch {
    return null;
  }
}

function applyKnownCandidatePatch(candidate, executionDir) {
  if (candidate.candidateId !== "candidate_direct_rule_or_fast_path_quality") {
    return {
      applied: false,
      reason: "No auto-apply handler exists for this candidate yet.",
    };
  }

  const targetFile = path.join(ROOT, "app/api/chat/route.ts");
  const before = fs.readFileSync(targetFile, "utf-8");
  const supportedStages = [
    '    const flamesText = "Lets go Flames!";',
    '    const flamesText = "Playing it now. Go Flames!";',
  ];
  const replacementSnippet = '    const flamesText = "Playing it now.";';
  const matchedSnippet = supportedStages.find((snippet) => before.includes(snippet));

  if (!matchedSnippet) {
    if (before.includes(replacementSnippet)) {
      return {
        applied: false,
        reason: "Best-known patch is already present.",
        targetFile,
        alreadyOptimal: true,
      };
    }
    return {
      applied: false,
      reason: "Expected fast-path snippet not found. Patch handler is out of sync.",
      targetFile,
    };
  }

  const after = before.replace(matchedSnippet, replacementSnippet);
  fs.writeFileSync(targetFile, after, "utf-8");

  const diffLines = [];
  diffLines.push(`--- a/app/api/chat/route.ts`);
  diffLines.push(`+++ b/app/api/chat/route.ts`);
  diffLines.push(`@@`);
  diffLines.push(`-${matchedSnippet}`);
  diffLines.push(`+${replacementSnippet}`);
  diffLines.push("");
  writeText(path.join(executionDir, "auto-apply.diff"), diffLines.join("\n"));

  const beforeAnswer = matchedSnippet.includes("Go Flames!")
    ? "Playing it now. Go Flames!"
    : "Lets go Flames!";
  const afterAnswer = "Playing it now.";
  writeJson(path.join(executionDir, "feedback-probe.json"), {
    generatedAt: new Date().toISOString(),
    probeType: "static_candidate_probe",
    question: "play the song",
    beforeAnswer,
    afterAnswer,
    heuristic: {
      improved: afterAnswer !== beforeAnswer && /playing/i.test(afterAnswer),
      rationale: "The refined reply acknowledges the requested action directly and removes unnecessary commentary.",
    },
  });

  return {
    applied: true,
    targetFile,
    beforeAnswer,
    afterAnswer,
  };
}

function computeEvalSummary(results) {
  if (!results.length) {
    return {
      count: 0,
      avgScore: null,
      passedCount: 0,
      failedIds: [],
    };
  }

  const avgScore = Math.round((results.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / results.length) * 10) / 10;
  return {
    count: results.length,
    avgScore,
    passedCount: results.filter((item) => item.passed).length,
    failedIds: results.filter((item) => !item.passed).map((item) => item.id),
  };
}

function compareEvalRuns(beforeResults, afterResults) {
  const beforeMap = new Map(beforeResults.map((item) => [item.id, item]));
  const afterMap = new Map(afterResults.map((item) => [item.id, item]));
  const ids = [...new Set([...beforeMap.keys(), ...afterMap.keys()])];
  const deltas = ids.map((id) => {
    const before = beforeMap.get(id);
    const after = afterMap.get(id);
    return {
      id,
      beforeScore: before ? Number(before.score ?? 0) : null,
      afterScore: after ? Number(after.score ?? 0) : null,
      scoreDelta: before && after ? Math.round((Number(after.score ?? 0) - Number(before.score ?? 0)) * 10) / 10 : null,
      beforePassed: before?.passed ?? null,
      afterPassed: after?.passed ?? null,
    };
  });

  const improved = deltas.filter((delta) => (delta.scoreDelta ?? 0) > 0).length;
  const regressed = deltas.filter((delta) => (delta.scoreDelta ?? 0) < 0).length;
  const unchanged = deltas.length - improved - regressed;

  return { deltas, improved, regressed, unchanged };
}

function runRubricEvals(ids, executionDir, baseUrl) {
  if (!ids.length) {
    return { ran: false, reason: "no_eval_ids" };
  }

  const commandArgs = ["scripts/rubric-eval-runner.mjs", "--live", `--ids=${ids.join(",")}`, `--url=${baseUrl}`];
  const result = spawnSync("node", commandArgs, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf-8",
    stdio: "pipe",
  });

  writeText(path.join(executionDir, "rubric-run.stdout.txt"), result.stdout ?? "");
  writeText(path.join(executionDir, "rubric-run.stderr.txt"), result.stderr ?? "");

  if (result.status !== 0) {
    return {
      ran: true,
      ok: false,
      exitCode: result.status,
      reason: "rubric_runner_failed",
    };
  }

  const latestRubric = readJson(PATHS.rubricResults);
  writeJson(path.join(executionDir, "rubric-results.after.json"), latestRubric);

  return {
    ran: true,
    ok: true,
    exitCode: result.status,
    rubricJson: latestRubric,
  };
}

function runGeneratedFeedbackEvals(ids, executionDir, baseUrl) {
  if (!ids.length) {
    return { ran: false, reason: "no_generated_feedback_eval_ids" };
  }

  const commandArgs = ["scripts/run-generated-feedback-evals.mjs", `--ids=${ids.join(",")}`, `--url=${baseUrl}`];
  const result = spawnSync("node", commandArgs, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf-8",
    stdio: "pipe",
  });

  writeText(path.join(executionDir, "generated-feedback-evals.stdout.txt"), result.stdout ?? "");
  writeText(path.join(executionDir, "generated-feedback-evals.stderr.txt"), result.stderr ?? "");

  if (result.status !== 0) {
    return {
      ran: true,
      ok: false,
      exitCode: result.status,
      reason: "generated_feedback_eval_runner_failed",
    };
  }

  const latest = readJson(PATHS.generatedFeedbackEvalResults);
  writeJson(path.join(executionDir, "generated-feedback-eval-results.after.json"), latest);
  return {
    ran: true,
    ok: true,
    exitCode: result.status,
    evalJson: latest,
  };
}

function buildDecision(
  candidate,
  baselineResults,
  rerunResult,
  autoApplyResult = null,
  generatedFeedbackEvalResult = null
) {
  const feedbackEvalIds = candidate.affectedGeneratedEvalIds ?? [];
  if (!candidate.affectedEvalIds.length) {
    if (feedbackEvalIds.length) {
      if (!generatedFeedbackEvalResult?.ran) {
        return {
          decision: "manual_review_only",
          reason: "Generated feedback evals were available but did not run.",
          autoApplyResult,
        };
      }
      if (!generatedFeedbackEvalResult.ok) {
        return {
          decision: "reject_candidate",
          reason: `Generated feedback evals failed with exit code ${generatedFeedbackEvalResult.exitCode}.`,
          autoApplyResult,
        };
      }
      const results = generatedFeedbackEvalResult.evalJson?.results ?? [];
      const failed = results.filter((item) => !item.passed);
      if (failed.length === 0 && results.length > 0) {
        return {
          decision: "promote_candidate",
          reason: "Generated feedback evals passed for all attached feedback-derived cases.",
          autoApplyResult,
          generatedFeedbackEvalSummary: {
            count: results.length,
            avgScore: Math.round((results.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / results.length) * 10) / 10,
            failedIds: [],
          },
        };
      }
      return {
        decision: "reject_candidate",
        reason: "Generated feedback eval gate did not clear.",
        autoApplyResult,
        generatedFeedbackEvalSummary: {
          count: results.length,
          avgScore: results.length
            ? Math.round((results.reduce((sum, item) => sum + Number(item.score ?? 0), 0) / results.length) * 10) / 10
            : null,
          failedIds: failed.map((item) => item.id),
        },
      };
    }

    if (autoApplyResult?.applied) {
      return {
        decision: "patched_manual_verification_needed",
        reason: "Candidate patch was auto-applied locally, but no attached eval IDs exist for an automatic promotion gate yet.",
        autoApplyResult,
      };
    }
    return {
      decision: "manual_review_only",
      reason: "Candidate has no attached eval IDs, so there is no automatic gate yet.",
      autoApplyResult,
    };
  }

  if (!rerunResult.ran) {
    return {
      decision: "manual_review_only",
      reason: "Rubric evals did not run.",
      autoApplyResult,
    };
  }

  if (!rerunResult.ok) {
    return {
      decision: "rejected",
      reason: `Rubric eval runner failed with exit code ${rerunResult.exitCode}.`,
      autoApplyResult,
    };
  }

  const afterResults = extractBaselineResults(rerunResult.rubricJson, candidate.affectedEvalIds);
  const beforeSummary = computeEvalSummary(baselineResults);
  const afterSummary = computeEvalSummary(afterResults);
  const comparison = compareEvalRuns(baselineResults, afterResults);

  const avgImproved = (afterSummary.avgScore ?? -Infinity) > (beforeSummary.avgScore ?? -Infinity);
  const noRegressions = comparison.regressed === 0;

  if (avgImproved && noRegressions) {
    return {
      decision: "promote_candidate",
      reason: "Targeted eval average improved and no targeted eval ID regressed.",
      beforeSummary,
      afterSummary,
      comparison,
      autoApplyResult,
    };
  }

  return {
    decision: "reject_candidate",
    reason: "Eval gate did not clear: average score did not improve cleanly.",
    beforeSummary,
    afterSummary,
    comparison,
    autoApplyResult,
  };
}

async function main() {
  const args = parseArgs();
  ensureDir(PATHS.execRoot);

  const candidatesJson = readJson(PATHS.candidates);
  const clustersJson = readJson(PATHS.clusters);
  const candidate = selectCandidate(candidatesJson, args.candidateId, args.supportedOnly);
  const cluster = findCluster(clustersJson, candidate);

  const execId = `${nowStamp()}_${candidate.candidateId}`;
  const executionDir = path.join(PATHS.execRoot, execId);
  ensureDir(executionDir);

  const baselineRubric = fs.existsSync(PATHS.rubricResults) ? readJson(PATHS.rubricResults) : { results: [] };
  const baselineResults = extractBaselineResults(baselineRubric, candidate.affectedEvalIds);
  writeJson(path.join(executionDir, "baseline-rubric-results.json"), {
    generatedAt: new Date().toISOString(),
    ids: candidate.affectedEvalIds,
    results: baselineResults,
  });

  const deterministicProposal = buildDeterministicProposal(candidate, cluster);
  const llmProposal = args.withLlm ? await maybeBuildLlmProposal(candidate, cluster) : null;
  writeText(path.join(executionDir, "patch-proposal.md"), llmProposal ?? deterministicProposal);

  const executionPlan = {
    executionId: execId,
    generatedAt: new Date().toISOString(),
    candidate,
    clusterTitle: cluster?.title ?? null,
    baselineEvalIds: candidate.affectedEvalIds,
    generatedFeedbackEvalIds: candidate.affectedGeneratedEvalIds ?? [],
    baselineSummary: computeEvalSummary(baselineResults),
    nextActions: [
      "Review the patch proposal.",
      "Implement the smallest safe change in the target files.",
      ...(candidate.affectedEvalIds.length ? ["Re-run the targeted rubric evals."] : ["Author or attach eval IDs for this candidate."]),
      "Promote only if the gate clears.",
    ],
    evalUrl: args.url,
  };
  writeJson(path.join(executionDir, "execution-plan.json"), executionPlan);

  let autoApplyResult = {
    applied: false,
    reason: "Auto-apply not requested.",
  };
  if (args.autoApply) {
    autoApplyResult = applyKnownCandidatePatch(candidate, executionDir);
    writeJson(path.join(executionDir, "auto-apply-result.json"), {
      generatedAt: new Date().toISOString(),
      candidateId: candidate.candidateId,
      ...autoApplyResult,
    });
  }

  let rerunResult = { ran: false, reason: "skip_evals" };
  if (!args.skipEvals) {
    rerunResult = runRubricEvals(candidate.affectedEvalIds, executionDir, args.url);
  }

  let generatedFeedbackEvalResult = { ran: false, reason: "skip_feedback_evals" };
  if (!args.skipEvals) {
    generatedFeedbackEvalResult = runGeneratedFeedbackEvals(
      candidate.affectedGeneratedEvalIds ?? [],
      executionDir,
      args.url
    );
  }

  const decision = buildDecision(
    candidate,
    baselineResults,
    rerunResult,
    autoApplyResult,
    generatedFeedbackEvalResult
  );
  writeJson(path.join(executionDir, "decision.json"), {
    executionId: execId,
    generatedAt: new Date().toISOString(),
    candidateId: candidate.candidateId,
    ...decision,
  });

  console.log("Sparky candidate execution created.");
  console.log(`  Execution dir  -> ${path.relative(ROOT, executionDir)}`);
  console.log(`  Proposal       -> ${path.relative(ROOT, path.join(executionDir, "patch-proposal.md"))}`);
  console.log(`  Plan           -> ${path.relative(ROOT, path.join(executionDir, "execution-plan.json"))}`);
  console.log(`  Decision       -> ${path.relative(ROOT, path.join(executionDir, "decision.json"))}`);
  if (args.autoApply) {
    console.log(`  Auto-apply     -> ${autoApplyResult.applied ? "applied" : `not applied (${autoApplyResult.reason})`}`);
  }
  if (candidate.affectedEvalIds.length) {
    console.log(`  Targeted evals -> ${args.skipEvals ? "skipped" : rerunResult.ok ? "ran" : "failed"}`);
  } else {
    console.log("  Targeted evals -> not available for this candidate");
  }
  if ((candidate.affectedGeneratedEvalIds ?? []).length) {
    console.log(`  Feedback evals -> ${args.skipEvals ? "skipped" : generatedFeedbackEvalResult.ok ? "ran" : "failed"}`);
  }
}

main().catch((error) => {
  console.error("execute-self-improvement-candidate failed:", error);
  process.exit(1);
});
