import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";

const BASE_URL = process.env.SPARKY_BASE_URL || "http://127.0.0.1:3000";
const questionsPath = process.argv[2];

if (!questionsPath) {
  console.error("Usage: node scripts/ask-sparky-batch-from-file.mjs <questions.json>");
  process.exit(1);
}

const raw = await readFile(questionsPath, "utf8");
const questions = JSON.parse(raw);
if (!Array.isArray(questions) || questions.some((q) => typeof q !== "string")) {
  console.error("Questions file must be a JSON array of strings.");
  process.exit(1);
}

const runDate = new Date().toISOString().slice(0, 10);
const runSlug = basename(questionsPath, ".json");
const outDir = join(process.cwd(), "artifacts", "sparky-batch-reviews");
await mkdir(outDir, { recursive: true });

const results = [];
for (let i = 0; i < questions.length; i += 1) {
  const question = questions[i];
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
      stream: true,
      sessionId: `${runSlug}-${String(i + 1).padStart(2, "0")}`,
    }),
  });
  const answer = (await res.text()).trim();
  results.push({
    id: i + 1,
    question,
    status: res.status,
    abstained: res.headers.get("X-Abstained") || "false",
    abstainReason: res.headers.get("X-Abstain-Reason") || "",
    answer,
  });
  console.log(`[${i + 1}/${questions.length}] ${res.status} ${question}`);
}

const jsonPath = join(outDir, `${runSlug}-answers-${runDate}.json`);
const mdPath = join(outDir, `${runSlug}-answers-${runDate}.md`);

const md = [
  `# Sparky Batch Review`,
  ``,
  `Date: ${runDate}`,
  `Base URL: ${BASE_URL}`,
  `Question file: ${questionsPath}`,
  `Question count: ${questions.length}`,
  ``,
  ...results.flatMap((result) => [
    `## ${result.id}. ${result.question}`,
    ``,
    `- Status: ${result.status}`,
    `- Abstained: ${result.abstained}`,
    ...(result.abstainReason ? [`- Abstain reason: ${result.abstainReason}`] : []),
    ``,
    `### Answer`,
    ``,
    result.answer || "_No response body returned._",
    ``,
  ]),
].join("\n");

await writeFile(jsonPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
await writeFile(mdPath, `${md}\n`, "utf8");

console.log(`Saved JSON: ${jsonPath}`);
console.log(`Saved Markdown: ${mdPath}`);
