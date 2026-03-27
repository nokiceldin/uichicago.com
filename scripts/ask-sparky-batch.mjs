import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BASE_URL = process.env.SPARKY_BASE_URL || "http://127.0.0.1:3000";
const RUN_DATE = new Date().toISOString().slice(0, 10);
const OUT_DIR = join(process.cwd(), "artifacts", "sparky-batch-reviews");

const questions = [
  "What is the in-state undergraduate tuition per semester at UIC?",
  "What is the FAFSA school code for UIC?",
  "What is the FAFSA priority deadline at UIC?",
  "What is the Aspire Grant and who qualifies?",
  "When is the fall tuition bill due?",
  "How much does CampusCare cost per year?",
  "What payment plan does UIC offer for tuition?",
  "Does ARC require a meal plan?",
  "What is the cheapest room type at ARC per semester?",
  "What residence halls do not require a meal plan?",
  "How do I apply for UIC housing?",
  "What LLCs are available at JST?",
  "What is the Ignite Unlimited meal plan and how much does it cost?",
  "Where is the financial aid office at UIC?",
  "What is the phone number for the counseling center?",
  "Which CTA train lines serve UIC?",
  "Are UIC basketball games free for students?",
  "What conference does UIC play in?",
  "How many student organizations does UIC have?",
  "What are the easiest CS courses at UIC by GPA or easiness?",
  "What is the average GPA in CS 211?",
  "What are the easiest MATH courses at UIC?",
  "What are the easiest gen ed courses at UIC?",
  "What gen ed categories does UIC have?",
  "Who is the easiest professor for CS 211?",
  "Who is the easiest professor for MATH 180?",
  "Which ECON 121 professor gives the most As?",
  "Who teaches CS 341 and what are their grades like?",
  "What are the required courses for a CS major at UIC?",
  "Can you give me a 4-year plan for a CS major?",
  "Is CS 341 usually waitlist heavy in spring?",
  "What does my professor's syllabus say about late work?",
  "Which dining hall has vegan options today?",
  "What GPA do I need to transfer to UIUC from UIC?",
  "Is the 606 bus running on time right now?",
  "What was my GPA last semester?",
  "Does Professor Smith give makeup exams in CS 211?",
  "Is there a Starbucks inside the engineering building?",
  "Can I appeal my grade from 3 years ago?",
  "What is my F-1 visa cap-out date?",
  "Can I take 21 credits this semester without special approval?",
  "What was the score of last night's UIC basketball game?",
  "Where is OIS located and what is their phone number?",
  "Do international students qualify for in-state tuition at UIC?",
  "What are the recreation center hours?",
  "Is there a halal food option on campus?",
  "Where should I live if I'm an engineering freshman and want something social?",
  "I'm a commuter, what's the cheapest meal plan worth getting?",
  "Can you compare ARC vs JST for a first-year student?",
  "What should a sophomore CS major take next semester?",
];

async function askQuestion(question, index) {
  const sessionId = `batch-${RUN_DATE}-${String(index + 1).padStart(2, "0")}`;
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
      stream: true,
      sessionId,
    }),
  });

  const answer = await res.text();
  return {
    id: index + 1,
    sessionId,
    question,
    status: res.status,
    ok: res.ok,
    answer: answer.trim(),
    headers: {
      abstained: res.headers.get("X-Abstained") || null,
      abstainReason: res.headers.get("X-Abstain-Reason") || null,
      playFlamesSong: res.headers.get("X-Play-Flames-Song") || null,
    },
  };
}

function toMarkdown(results) {
  const lines = [
    `# Sparky Batch Review`,
    ``,
    `Date: ${RUN_DATE}`,
    `Base URL: ${BASE_URL}`,
    `Question count: ${results.length}`,
    ``,
  ];

  for (const result of results) {
    lines.push(`## ${result.id}. ${result.question}`);
    lines.push(``);
    lines.push(`- Status: ${result.status}`);
    lines.push(`- Abstained: ${result.headers.abstained ?? "false"}`);
    if (result.headers.abstainReason) {
      lines.push(`- Abstain reason: ${result.headers.abstainReason}`);
    }
    lines.push(``);
    lines.push(`### Answer`);
    lines.push(``);
    lines.push(result.answer || "_No response body returned._");
    lines.push(``);
  }

  return lines.join("\n");
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const results = [];
  for (let i = 0; i < questions.length; i += 1) {
    const result = await askQuestion(questions[i], i);
    results.push(result);
    console.log(`[${result.id}/${questions.length}] ${result.status} ${result.question}`);
  }

  const jsonPath = join(OUT_DIR, `sparky-batch-review-${RUN_DATE}.json`);
  const mdPath = join(OUT_DIR, `sparky-batch-review-${RUN_DATE}.md`);

  await writeFile(jsonPath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  await writeFile(mdPath, `${toMarkdown(results)}\n`, "utf8");

  console.log(`Saved JSON: ${jsonPath}`);
  console.log(`Saved Markdown: ${mdPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
