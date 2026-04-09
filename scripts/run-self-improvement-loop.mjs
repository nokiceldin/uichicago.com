/**
 * run-self-improvement-loop.mjs
 *
 * Sparky autonomous improvement coordinator.
 *
 * This script does not auto-edit production code. Instead, it mines eval
 * failures and bad-response feedback, clusters the problems, generates ranked
 * improvement candidates, and emits a gated review bundle that can be used for
 * follow-up implementation and eval runs.
 *
 * Inputs:
 *   public/data/eval/rubric-results.json
 *   public/data/eval/sparky-eval-results.json
 *   artifacts/feedback/bad-chat-responses.jsonl
 *
 * Outputs:
 *   artifacts/autonomous-improvement/incidents.json
 *   artifacts/autonomous-improvement/clusters.json
 *   artifacts/autonomous-improvement/candidates.json
 *   artifacts/autonomous-improvement/generated-feedback-evals.json
 *   artifacts/autonomous-improvement/review.md
 *
 * Optional:
 *   --with-llm     Uses Anthropic to generate richer candidate notes if
 *                  ANTHROPIC_API_KEY is set.
 *
 * Run:
 *   node --env-file=.env scripts/run-self-improvement-loop.mjs
 *   node --env-file=.env scripts/run-self-improvement-loop.mjs --threshold=7.5
 *   node --env-file=.env scripts/run-self-improvement-loop.mjs --with-llm
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const DEFAULTS = {
  threshold: 7,
  rubric: path.join(ROOT, "public/data/eval/rubric-results.json"),
  heuristic: path.join(ROOT, "public/data/eval/sparky-eval-results.json"),
  feedback: path.join(ROOT, "artifacts/feedback/bad-chat-responses.jsonl"),
  outDir: path.join(ROOT, "artifacts/autonomous-improvement"),
};

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  : null;

function parseArgs() {
  const args = process.argv.slice(2);
  const getValue = (name, fallback = null) =>
    args.find((arg) => arg.startsWith(`--${name}=`))?.split("=")[1] ?? fallback;

  return {
    threshold: Number(getValue("threshold", DEFAULTS.threshold)),
    rubric: getValue("rubric", DEFAULTS.rubric),
    heuristic: getValue("heuristic", DEFAULTS.heuristic),
    feedback: getValue("feedback", DEFAULTS.feedback),
    outDir: getValue("out-dir", DEFAULTS.outDir),
    withLlm: args.includes("--with-llm"),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function normalizeText(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function summarize(text, max = 180) {
  const value = String(text ?? "").replace(/\s+/g, " ").trim();
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function toHeuristicMap(heuristicJson) {
  const results = heuristicJson?.results ?? [];
  return new Map(results.map((item) => [item.id, item]));
}

function buildEvalIncidents(rubricJson, heuristicMap, threshold) {
  const results = rubricJson?.results ?? [];
  const incidents = [];

  for (const item of results) {
    const heuristic = heuristicMap.get(item.id);
    const failed = item.passed === false || Number(item.score ?? 0) < threshold;

    if (!failed) continue;

    incidents.push({
      incidentType: "eval_failure",
      source: "rubric_eval",
      sourceId: item.id,
      createdAt: rubricJson?._meta?.generated_at ?? new Date().toISOString(),
      title: `${item.id}: ${item.question}`,
      question: item.question,
      answer: item.response_text ?? heuristic?.response ?? "",
      category: item.category ?? heuristic?.category ?? "unknown",
      expectedBehavior: item.expected_behavior ?? null,
      actualBehavior: item.actual_behavior ?? null,
      score: Number(item.score ?? 0),
      severity: Number(item.score ?? 0) <= 4 ? "high" : "medium",
      abstainReason: item.sparky_trace?.abstain_reason ?? heuristic?.abstain_reason ?? null,
      notes: [
        item.judge_reasoning,
        ...(item.missed_facts ?? []).map((fact) => `missed: ${fact}`),
        ...(item.forbidden_claims_found ?? []).map((claim) => `forbidden: ${claim}`),
        ...(heuristic?.scores?.notes ?? []),
      ].filter(Boolean),
      signals: {
        missedFacts: item.missed_facts ?? [],
        forbiddenClaims: item.forbidden_claims_found ?? [],
        hallucinationFlags: heuristic?.scores?.hallucination_flags ?? [],
        responseLength: item.response_length ?? heuristic?.scores?.response_length ?? null,
      },
    });
  }

  return incidents;
}

function buildFeedbackIncidents(feedbackRows) {
  return feedbackRows.map((row, index) => ({
    incidentType: "user_feedback",
    source: "bad_chat_feedback",
    sourceId: `${row.createdAt ?? "feedback"}_${index + 1}`,
    createdAt: row.createdAt ?? new Date().toISOString(),
    title: `Feedback: ${row.question ?? "Unknown question"}`,
    question: row.question ?? "",
    answer: row.answer ?? "",
    category: "feedback",
    expectedBehavior: null,
    actualBehavior: "bad_feedback",
    score: null,
    severity: row.rating === "bad" ? "medium" : "low",
    abstainReason: null,
    notes: [`rating=${row.rating ?? "unknown"}`],
    signals: {
      missedFacts: [],
      forbiddenClaims: [],
      hallucinationFlags: [],
      responseLength: String(row.answer ?? "").length,
    },
  }));
}

function buildGeneratedFeedbackEvals(feedbackIncidents) {
  return feedbackIncidents.map((incident, index) => {
    const normalizedQuestion = String(incident.question ?? "").toLowerCase();
    const generatedEvalId = `feedback_eval_${index + 1}`;

    let judgePrompt =
      "Pass if the new answer clearly responds to the user's request in a more directly helpful way than the prior bad answer. Fail if it remains terse, confusing, or ignores the requested action.";
    let successSignals = [
      "Should acknowledge the user's requested action directly.",
      "Should feel more helpful than the prior bad answer.",
    ];

    if (normalizedQuestion.includes("play the song") || normalizedQuestion.includes("flames song")) {
      judgePrompt =
        "Pass if the reply clearly acknowledges starting the song or playing it now, and feels more helpful than just saying a slogan. Fail if it only says 'Lets go Flames' or gives another non-action response.";
      successSignals = [
        "Mentions playing or starting the song.",
        "Avoids a bare chant-only response.",
      ];
    }

    return {
      id: generatedEvalId,
      sourceIncidentId: incident.sourceId,
      question: incident.question,
      priorBadAnswer: incident.answer,
      category: incident.category,
      expectedBehavior: "answer",
      judgePrompt,
      successSignals,
    };
  });
}

const CLUSTER_DEFS = [
  {
    id: "wrong_domain_fallback",
    title: "Wrong Domain Fallback",
    description: "Sparky answered from the wrong domain or used a canned fallback from the wrong subsystem.",
    matcher(incident) {
      const answer = incident.answer ?? "";
      return answer.includes("UICFlames.com") || answer.includes("uic.edu/events") || answer.includes("connect.uic.edu")
        ? incident.category !== "athletics" && incident.expectedBehavior === "answer"
        : false;
    },
    patchType: "routing",
    targetFiles: ["app/api/chat/route.ts", "lib/chat/intent.ts", "lib/chat/trust-decision.ts"],
    acceptanceGate: "Improve all affected eval IDs by >=1.0 points and introduce no new wrong-domain regressions.",
  },
  {
    id: "incorrect_abstain_or_missing_retrieval",
    title: "Incorrect Abstain Or Missing Retrieval",
    description: "Sparky had data available or should have answered, but abstained or failed to retrieve the right evidence.",
    matcher(incident) {
      const shouldAnswer = incident.expectedBehavior === "answer";
      const abstained = incident.actualBehavior === "abstain";
      const abstainReason = normalizeText(incident.abstainReason);
      return shouldAnswer && (
        abstained ||
        abstainReason.includes("insufficient_evidence") ||
        abstainReason.includes("no_chunks") ||
        abstainReason.includes("low_score")
      );
    },
    patchType: "retrieval_or_trust",
    targetFiles: ["app/api/chat/route.ts", "lib/chat/trust-decision.ts", "lib/chat/data.ts"],
    acceptanceGate: "Affected abstain cases must cross the pass threshold with no new hallucination flags in financial or policy domains.",
  },
  {
    id: "overconfident_answer",
    title: "Overconfident Answer",
    description: "Sparky answered when it should have hedged or abstained, or made a concrete claim that the judge flagged.",
    matcher(incident) {
      const forbidden = incident.signals?.forbiddenClaims?.length > 0;
      const hallucination = incident.signals?.hallucinationFlags?.length > 0;
      const expectedAbstain = incident.expectedBehavior === "abstain" && incident.actualBehavior !== "abstain";
      return forbidden || hallucination || expectedAbstain;
    },
    patchType: "trust_and_prompt",
    targetFiles: ["app/api/chat/route.ts", "lib/chat/trust-decision.ts"],
    acceptanceGate: "Affected cases must gain trust_behavior and safety points with no drop in factual_correctness on stable fact questions.",
  },
  {
    id: "incomplete_answer_missing_core_fact",
    title: "Incomplete Answer Missing Core Fact",
    description: "Sparky answered, but missed the central fact or redirect the rubric required.",
    matcher(incident) {
      return incident.actualBehavior === "answer" && (incident.signals?.missedFacts?.length ?? 0) > 0;
    },
    patchType: "response_shape_or_context",
    targetFiles: ["app/api/chat/route.ts", "lib/chat/data.ts"],
    acceptanceGate: "All affected cases must include their missing core fact and preserve or improve clarity.",
  },
  {
    id: "direct_rule_or_fast_path_quality",
    title: "Direct Rule Or Fast Path Quality",
    description: "A hardcoded response or fast path produced poor output or bad user feedback.",
    matcher(incident) {
      const q = normalizeText(incident.question);
      return incident.source === "bad_chat_feedback" ||
        q === "play the song" ||
        q === "playthe song" ||
        q.includes("flames song");
    },
    patchType: "fast_path",
    targetFiles: ["app/api/chat/route.ts"],
    acceptanceGate: "Direct-rule regressions stay at zero and any targeted feedback case gets a clearly improved response on manual review.",
  },
];

function clusterIncidents(incidents) {
  const buckets = new Map();

  for (const def of CLUSTER_DEFS) {
    buckets.set(def.id, {
      clusterId: def.id,
      title: def.title,
      description: def.description,
      patchType: def.patchType,
      targetFiles: def.targetFiles,
      acceptanceGate: def.acceptanceGate,
      incidents: [],
    });
  }

  buckets.set("unclustered", {
    clusterId: "unclustered",
    title: "Unclustered Issues",
    description: "Incidents that need manual diagnosis before a patch is proposed.",
    patchType: "manual_investigation",
    targetFiles: [],
    acceptanceGate: "Manual triage required.",
    incidents: [],
  });

  for (const incident of incidents) {
    let matched = false;

    for (const def of CLUSTER_DEFS) {
      if (def.matcher(incident)) {
        buckets.get(def.id).incidents.push(incident);
        matched = true;
        break;
      }
    }

    if (!matched) {
      buckets.get("unclustered").incidents.push(incident);
    }
  }

  return [...buckets.values()]
    .filter((cluster) => cluster.incidents.length > 0)
    .map((cluster) => {
      const scored = cluster.incidents.filter((incident) => typeof incident.score === "number");
      const avgScore = scored.length
        ? Math.round((scored.reduce((sum, incident) => sum + incident.score, 0) / scored.length) * 10) / 10
        : null;
      return {
        ...cluster,
        incidentCount: cluster.incidents.length,
        avgScore,
        highSeverityCount: cluster.incidents.filter((incident) => incident.severity === "high").length,
      };
    })
    .sort((a, b) => {
      const severityDelta = b.highSeverityCount - a.highSeverityCount;
      if (severityDelta !== 0) return severityDelta;
      return b.incidentCount - a.incidentCount;
    });
}

function buildCandidate(cluster, generatedFeedbackEvalMap) {
  const affectedEvalIds = cluster.incidents
    .filter((incident) => incident.source === "rubric_eval")
    .map((incident) => incident.sourceId);
  const feedbackCases = cluster.incidents
    .filter((incident) => incident.source === "bad_chat_feedback")
    .map((incident) => incident.sourceId);
  const affectedGeneratedEvalIds = cluster.incidents
    .filter((incident) => incident.source === "bad_chat_feedback")
    .map((incident) => generatedFeedbackEvalMap.get(incident.sourceId)?.id)
    .filter(Boolean);
  const leverageScore = cluster.incidentCount * 3 + cluster.highSeverityCount * 2;

  const hypothesisByPatchType = {
    routing: "Improve domain detection before retrieval so the right subsystem answers first.",
    retrieval_or_trust: "Recover good evidence earlier and relax abstention only when source quality supports it.",
    trust_and_prompt: "Tighten confidence behavior so Sparky hedges or abstains before asserting risky specifics.",
    response_shape_or_context: "Make the answer pack and prompt force inclusion of the core fact or redirect.",
    fast_path: "Replace brittle canned replies with a targeted rule or richer fallback path.",
    manual_investigation: "Inspect logs and traces before changing behavior.",
  };

  return {
    candidateId: `candidate_${cluster.clusterId}`,
    title: cluster.title,
    clusterId: cluster.clusterId,
    patchType: cluster.patchType,
    leverageScore,
    status: "proposed",
    hypothesis: hypothesisByPatchType[cluster.patchType] ?? "Improve Sparky behavior for this incident cluster.",
    targetFiles: cluster.targetFiles,
    acceptanceGate: cluster.acceptanceGate,
    affectedEvalIds,
    affectedFeedbackIds: feedbackCases,
    affectedGeneratedEvalIds,
    humanReviewChecklist: [
      "Confirm the cluster diagnosis matches real failure examples.",
      "Implement the smallest targeted change first.",
      "Run evals on affected IDs and related regression categories.",
      "Only promote if safety and trust behavior do not regress.",
    ],
    exampleIncidents: cluster.incidents.slice(0, 3).map((incident) => ({
      sourceId: incident.sourceId,
      question: incident.question,
      answer: summarize(incident.answer, 220),
      notes: incident.notes.slice(0, 3),
    })),
  };
}

async function enrichCandidatesWithLlm(candidates, clusters) {
  if (!anthropic) return candidates;

  const enriched = [];

  for (const candidate of candidates) {
    const cluster = clusters.find((item) => item.clusterId === candidate.clusterId);
    const prompt = [
      "You are helping maintain Sparky, a UIC student assistant.",
      "Given this incident cluster, suggest one tightly-scoped improvement plan.",
      "Do not propose retraining model weights.",
      "Prefer prompt, routing, retrieval, trust, or direct-rule fixes.",
      "",
      `Cluster title: ${cluster.title}`,
      `Description: ${cluster.description}`,
      `Patch type: ${cluster.patchType}`,
      `Acceptance gate: ${cluster.acceptanceGate}`,
      "",
      "Example incidents:",
      ...cluster.incidents.slice(0, 4).map((incident, index) =>
        `${index + 1}. Q: ${incident.question}\nA: ${summarize(incident.answer, 240)}\nNotes: ${incident.notes.join(" | ")}`
      ),
      "",
      "Return JSON only:",
      '{',
      '  "suggested_change": "one paragraph",',
      '  "eval_focus": ["id1", "id2"],',
      '  "risk": "low|medium|high"',
      '}',
    ].join("\n");

    try {
      const response = await anthropic.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 350,
        messages: [{ role: "user", content: prompt }],
      });
      const text = response.content[0]?.type === "text" ? response.content[0].text : "";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      enriched.push({
        ...candidate,
        llmSuggestedChange: parsed.suggested_change ?? null,
        llmEvalFocus: parsed.eval_focus ?? [],
        llmRisk: parsed.risk ?? null,
      });
    } catch {
      enriched.push(candidate);
    }
  }

  return enriched;
}

function buildReviewMarkdown(candidates, clusters, incidents, args) {
  const lines = [];

  lines.push("# Sparky Autonomous Improvement Review");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## What This Run Did");
  lines.push("");
  lines.push(`- Parsed ${incidents.length} incidents from eval failures and bad-response feedback.`);
  lines.push(`- Grouped them into ${clusters.length} active clusters.`);
  lines.push(`- Proposed ${candidates.length} gated improvement candidates.`);
  lines.push(`- Pass threshold used for rubric failures: ${args.threshold}.`);
  lines.push("");
  lines.push("## Promotion Policy");
  lines.push("");
  lines.push("- No candidate should be auto-promoted straight to production.");
  lines.push("- Each candidate must be implemented as a small patch, then re-evaluated.");
  lines.push("- Promotion is allowed only if the candidate clears its acceptance gate and causes no relevant safety regressions.");
  lines.push("");
  lines.push("## Ranked Candidates");
  lines.push("");

  for (const candidate of candidates) {
    lines.push(`### ${candidate.title}`);
    lines.push(`- Candidate ID: \`${candidate.candidateId}\``);
    lines.push(`- Patch type: \`${candidate.patchType}\``);
    lines.push(`- Leverage score: ${candidate.leverageScore}`);
    lines.push(`- Target files: ${candidate.targetFiles.length ? candidate.targetFiles.map((file) => `\`${file}\``).join(", ") : "manual triage"}`);
    lines.push(`- Hypothesis: ${candidate.hypothesis}`);
    lines.push(`- Acceptance gate: ${candidate.acceptanceGate}`);
    if (candidate.llmSuggestedChange) {
      lines.push(`- LLM note: ${candidate.llmSuggestedChange}`);
    }
    if (candidate.affectedEvalIds.length) {
      lines.push(`- Eval focus: ${candidate.affectedEvalIds.join(", ")}`);
    }
    if (candidate.affectedGeneratedEvalIds?.length) {
      lines.push(`- Generated feedback evals: ${candidate.affectedGeneratedEvalIds.join(", ")}`);
    }
    if (candidate.affectedFeedbackIds.length) {
      lines.push(`- Feedback cases: ${candidate.affectedFeedbackIds.join(", ")}`);
    }
    lines.push("- Example incidents:");
    for (const incident of candidate.exampleIncidents) {
      lines.push(`  - ${incident.sourceId}: ${incident.question}`);
      lines.push(`    Answer: ${incident.answer}`);
      if (incident.notes.length) {
        lines.push(`    Notes: ${incident.notes.join(" | ")}`);
      }
    }
    lines.push("");
  }

  lines.push("## Active Clusters");
  lines.push("");
  for (const cluster of clusters) {
    lines.push(`### ${cluster.title}`);
    lines.push(`- Cluster ID: \`${cluster.clusterId}\``);
    lines.push(`- Incident count: ${cluster.incidentCount}`);
    lines.push(`- High severity count: ${cluster.highSeverityCount}`);
    lines.push(`- Avg eval score: ${cluster.avgScore ?? "n/a"}`);
    lines.push(`- Patch type: \`${cluster.patchType}\``);
    lines.push("");
  }

  return lines.join("\n") + "\n";
}

async function main() {
  const args = parseArgs();
  ensureDir(args.outDir);

  const rubricJson = readJson(args.rubric, { results: [] });
  const heuristicJson = readJson(args.heuristic, { results: [] });
  const feedbackRows = readJsonl(args.feedback);

  const heuristicMap = toHeuristicMap(heuristicJson);
  const evalIncidents = buildEvalIncidents(rubricJson, heuristicMap, args.threshold);
  const feedbackIncidents = buildFeedbackIncidents(feedbackRows);
  const generatedFeedbackEvals = buildGeneratedFeedbackEvals(feedbackIncidents);
  const generatedFeedbackEvalMap = new Map(
    generatedFeedbackEvals.map((item) => [item.sourceIncidentId, item])
  );
  const incidents = [...evalIncidents, ...feedbackIncidents].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );

  const clusters = clusterIncidents(incidents);
  let candidates = clusters
    .map((cluster) => buildCandidate(cluster, generatedFeedbackEvalMap))
    .sort((a, b) => b.leverageScore - a.leverageScore);

  if (args.withLlm && anthropic) {
    candidates = await enrichCandidatesWithLlm(candidates, clusters);
  }

  const review = buildReviewMarkdown(candidates, clusters, incidents, args);

  writeJson(path.join(args.outDir, "incidents.json"), {
    generatedAt: new Date().toISOString(),
    threshold: args.threshold,
    count: incidents.length,
    incidents,
  });
  writeJson(path.join(args.outDir, "clusters.json"), {
    generatedAt: new Date().toISOString(),
    count: clusters.length,
    clusters,
  });
  writeJson(path.join(args.outDir, "candidates.json"), {
    generatedAt: new Date().toISOString(),
    count: candidates.length,
    candidates,
  });
  writeJson(path.join(args.outDir, "generated-feedback-evals.json"), {
    generatedAt: new Date().toISOString(),
    count: generatedFeedbackEvals.length,
    evals: generatedFeedbackEvals,
  });
  fs.writeFileSync(path.join(args.outDir, "review.md"), review, "utf-8");

  console.log("Sparky autonomous improvement review generated.");
  console.log(`  Incidents  -> ${path.relative(ROOT, path.join(args.outDir, "incidents.json"))}`);
  console.log(`  Clusters   -> ${path.relative(ROOT, path.join(args.outDir, "clusters.json"))}`);
  console.log(`  Candidates -> ${path.relative(ROOT, path.join(args.outDir, "candidates.json"))}`);
  console.log(`  Feedback evals -> ${path.relative(ROOT, path.join(args.outDir, "generated-feedback-evals.json"))}`);
  console.log(`  Review     -> ${path.relative(ROOT, path.join(args.outDir, "review.md"))}`);
  console.log(`  LLM enrich -> ${args.withLlm && anthropic ? "enabled" : "disabled"}`);
}

main().catch((error) => {
  console.error("run-self-improvement-loop failed:", error);
  process.exit(1);
});
