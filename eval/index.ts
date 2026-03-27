// Sparky — LLM Answer Grader
//
// Grades an answer against the golden dataset's must_get_right and
// failure_mode criteria using Claude Haiku.
//
// A single API call produces a pass / partial / fail verdict with a one-sentence
// reason for one eval entry at a time.
//
// Usage:
//   import { gradeAnswer } from "../eval/index";
//   const grade = await gradeAnswer({ query, answer, mustGetRight, failureMode });

import Anthropic from "@anthropic-ai/sdk";

const anthropicClient = new Anthropic();

// ── Types ─────────────────────────────────────────────────────────────────────

export type GradeScore = "pass" | "partial" | "fail";

export interface GradeResult {
  score: GradeScore;
  /** One-sentence explanation of the verdict. */
  reason: string;
}

// ── Grader ────────────────────────────────────────────────────────────────────

const GRADE_SCORES = new Set(["pass", "partial", "fail"]);

/**
 * Uses Claude Haiku to grade a Sparky answer against golden criteria.
 *
 * @param query        Student's question (final user turn for multi-turn entries).
 * @param answer       Answer produced by the assistant pipeline.
 * @param mustGetRight Correctness criteria from the golden dataset.
 * @param failureMode  The specific failure pattern to watch for.
 *
 * Fails safely to `{ score: "fail", reason: "Grader error" }` on any exception
 * so a transient API failure never crashes the eval run.
 */
export async function gradeAnswer(params: {
  query: string;
  answer: string;
  mustGetRight: string;
  failureMode: string;
}): Promise<GradeResult> {
  const { query, answer, mustGetRight, failureMode } = params;

  const userPrompt = `Student question:
${query}

Assistant answer:
${answer}

MUST GET RIGHT: ${mustGetRight}

FAILURE MODE (a "fail" if the answer does this): ${failureMode}

Return ONLY a JSON object — no markdown, no extra text:
{"score":"pass","reason":"one sentence"} or {"score":"partial","reason":"one sentence"} or {"score":"fail","reason":"one sentence"}

Scoring:
  pass    — clearly satisfies MUST GET RIGHT and avoids FAILURE MODE
  partial — partially correct but misses a key part of MUST GET RIGHT
  fail    — exhibits FAILURE MODE or critically misses MUST GET RIGHT`;

  try {
    const response = await anthropicClient.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 120,
      system:
        "You are a strict evaluator for a university student assistant named Sparky. " +
        "Grade answers as pass, partial, or fail based solely on the criteria given. " +
        "Be concise and consistent.",
      messages: [{ role: "user", content: userPrompt }],
    });

    const raw =
      response.content[0]?.type === "text" ? response.content[0].text.trim() : "";

    // Strip accidental markdown fences before parsing JSON
    const clean = raw
      .replace(/^```[a-z]*\n?/, "")
      .replace(/\n?```$/, "")
      .trim();

    const parsed = JSON.parse(clean) as { score?: string; reason?: string };

    const score = GRADE_SCORES.has(parsed.score ?? "")
      ? (parsed.score as GradeScore)
      : "fail";

    return {
      score,
      reason: typeof parsed.reason === "string" && parsed.reason
        ? parsed.reason
        : "No reason provided.",
    };
  } catch {
    return { score: "fail", reason: "Grader error — could not evaluate this answer." };
  }
}
