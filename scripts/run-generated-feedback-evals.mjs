/**
 * run-generated-feedback-evals.mjs
 *
 * Runs generated eval cases that were synthesized from bad user feedback.
 * These cases are intentionally lighter-weight than the main rubric suite:
 * they focus on whether Sparky's current answer is clearly better than the
 * prior bad answer for the same prompt.
 *
 * Inputs:
 *   artifacts/autonomous-improvement/generated-feedback-evals.json
 *
 * Outputs:
 *   artifacts/autonomous-improvement/generated-feedback-eval-results.json
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const INPUT_FILE = path.join(ROOT, "artifacts/autonomous-improvement/generated-feedback-evals.json");
const OUTPUT_FILE = path.join(ROOT, "artifacts/autonomous-improvement/generated-feedback-eval-results.json");
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function parseArgs() {
  const args = process.argv.slice(2);
  const idsArg = args.find((arg) => arg.startsWith("--ids="))?.split("=")[1] ?? null;
  const urlArg = args.find((arg) => arg.startsWith("--url="))?.split("=")[1] ?? null;
  return {
    ids: idsArg ? idsArg.split(",") : null,
    url: urlArg ?? process.env.SPARKY_EVAL_URL ?? "http://localhost:3000",
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

async function callSparky(question, baseUrl) {
  const sparkyUrl = `${baseUrl.replace(/\/$/, "")}/api/chat`;
  const res = await fetch(sparkyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: question }] }),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  return text.trim();
}

async function judgeEval(evalCase, answer) {
  const prompt = `You are judging whether Sparky improved after a previously bad response.

Question: ${evalCase.question}
Prior bad answer: ${evalCase.priorBadAnswer}
Current answer: ${answer}

Success criteria:
${evalCase.successSignals.map((item) => `- ${item}`).join("\n")}

Judge instruction:
${evalCase.judgePrompt}

Return only valid JSON:
{
  "score": 0-10,
  "passed": true or false,
  "reason": "short explanation"
}`;

  const response = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    messages: [{ role: "user", content: prompt }],
  });
  const text = response.content[0]?.type === "text" ? response.content[0].text : "";
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

async function main() {
  const args = parseArgs();

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is required for generated feedback evals.");
  }

  const input = readJson(INPUT_FILE);
  let evals = input?.evals ?? [];
  if (args.ids) {
    evals = evals.filter((item) => args.ids.includes(item.id));
  }

  const results = [];

  for (const evalCase of evals) {
    try {
      const answer = await callSparky(evalCase.question, args.url);
      const judged = await judgeEval(evalCase, answer);
      results.push({
        id: evalCase.id,
        sourceIncidentId: evalCase.sourceIncidentId,
        question: evalCase.question,
        priorBadAnswer: evalCase.priorBadAnswer,
        currentAnswer: answer,
        score: Number(judged.score ?? 0),
        passed: Boolean(judged.passed),
        reason: judged.reason ?? "",
      });
    } catch (error) {
      results.push({
        id: evalCase.id,
        sourceIncidentId: evalCase.sourceIncidentId,
        question: evalCase.question,
        priorBadAnswer: evalCase.priorBadAnswer,
        currentAnswer: null,
        score: 0,
        passed: false,
        reason: `Eval failed: ${error.message}`,
      });
    }
  }

  writeJson(OUTPUT_FILE, {
    generatedAt: new Date().toISOString(),
    url: args.url,
    count: results.length,
    results,
  });

  console.log(`Generated feedback evals complete -> ${path.relative(ROOT, OUTPUT_FILE)}`);
}

main().catch((error) => {
  console.error("run-generated-feedback-evals failed:", error);
  process.exit(1);
});
