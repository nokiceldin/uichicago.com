import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  detectDataProvenanceRequest,
  renderDataProvenanceResponse,
} from "./data-provenance.ts";

const instructorStatsSource = readFileSync(
  new URL("../courses/instructor-stats.ts", import.meta.url),
  "utf8",
);
const configuredTermBlock = instructorStatsSource.match(/COURSE_INSTRUCTOR_TERM_CODES\s*=\s*\[([\s\S]*?)\]\s*as const/);
assert.ok(configuredTermBlock, "canonical instructor term window was not found");
const configuredInstructorTermCodes = [...configuredTermBlock[1].matchAll(/"([0-9]{4}(?:SP|SU|FA))"/g)]
  .map((match) => match[1]);
assert.ok(configuredInstructorTermCodes.length > 0);

const focusedPrompts: Array<{
  prompt: string;
  kind: Parameters<typeof renderDataProvenanceResponse>[0]["kind"];
  material: RegExp;
}> = [
  { prompt: "Which kinds of answers do you get from live data, and which come from stored or historical data?", kind: "overview", material: /Historical:[\s\S]*Stored catalog snapshot:[\s\S]*Unavailable live data:/ },
  { prompt: "What data sources power Sparky's answers? List the source and freshness limits for each major category.", kind: "overview", material: /Stored campus facts:[\s\S]*global last-verified date or update cadence is unknown/ },
  { prompt: "Are your professor grade statistics live, or are they calculated from historical records?", kind: "historical_grades", material: /Data status: Historical/ },
  { prompt: "What is the newest semester included in your professor and course grade data?", kind: "historical_grades", material: /not a verified end date for all grade data/ },
  { prompt: "Can you see the live UIC Schedule of Classes, including current instructors and open seats?", kind: "live_schedule", material: /Data status: Unavailable/ },
  { prompt: "Where do your course prerequisite answers come from, and how current is that information?", kind: "catalog", material: /Stored catalog snapshot/ },
  { prompt: "Where do your tuition and fee figures come from, and what academic year do they cover?", kind: "stored_facts", material: /Data status: Stored/ },
  { prompt: "When you call a UIC fact current, what date was it last verified?", kind: "freshness", material: /global last-verified date[\s\S]*unknown/i },
  { prompt: "Can you cite the source and data period for the historical average GPA you show for CS 211?", kind: "historical_grades", material: /full grade dataset does not expose one verified global start or end date/i },
  { prompt: "What are the main limits of the data behind your answers?", kind: "limits", material: /cannot see live schedules/ },
  { prompt: "Can you access my UIC student account, grades, registration record, or degree audit?", kind: "account_access", material: /no direct access/i },
  { prompt: "Did you browse the web live to answer me, or are you using a saved dataset?", kind: "browsing", material: /did not browse UIC websites live/i },
  { prompt: "What data is used to rank professors on UIChicago, and what should students avoid assuming from it?", kind: "professor_ranking", material: /neither proves teaching quality/ },
  { prompt: "How often is Sparky's course and professor data updated?", kind: "update_cadence", material: /update cadence is \*\*unknown\*\*/ },
  { prompt: "What do you do when a stored UIChicago fact conflicts with the current official UIC website?", kind: "conflict", material: /current official UIC source controls/ },
  { prompt: "Before answering, tell me whether the answer is live, historical, cached, or unavailable: Who teaches CS 211 next semester?", kind: "live_schedule", material: /Data status: Unavailable/ },
  { prompt: "Before answering, tell me whether the answer is live, historical, cached, or unavailable: What is the average GPA in CS 211?", kind: "historical_grades", material: /Data status: Historical/ },
  { prompt: "Before answering, tell me whether the answer is live, historical, cached, or unavailable: How many seats are open in CS 251 right now?", kind: "live_schedule", material: /Data status: Unavailable/ },
];

test("detects and renders all focused provenance prompt families", () => {
  for (const { prompt, kind, material } of focusedPrompts) {
    const request = detectDataProvenanceRequest(prompt);
    assert.equal(request?.kind, kind, prompt);
    const response = renderDataProvenanceResponse(request, configuredInstructorTermCodes);
    assert.ok(response.length > 80, prompt);
    assert.match(response, material, prompt);
  }
});

test("derives the configured instructor window without claiming a global grade end date", () => {
  const request = detectDataProvenanceRequest("What is the newest semester included in your professor and course grade data?");
  assert.ok(request);
  const response = renderDataProvenanceResponse(request, ["2031FA", "2032SP"]);
  assert.match(response, /Fall 2031 through Spring 2032/);
  assert.match(response, /not a verified end date for all grade data/i);
  assert.doesNotMatch(response, /2024|2025|2026/);
});

test("live schedule, instructor, and seat provenance fails closed without stale details", () => {
  for (const prompt of [focusedPrompts[4].prompt, focusedPrompts[15].prompt, focusedPrompts[17].prompt]) {
    const request = detectDataProvenanceRequest(prompt);
    assert.equal(request?.kind, "live_schedule", prompt);
    const response = renderDataProvenanceResponse(request, configuredInstructorTermCodes);
    assert.match(response, /Data status: Unavailable/i);
    assert.match(response, /Schedule of Classes/);
    assert.doesNotMatch(response, /\b(?:Spring|Summer|Fall)\s+20\d{2}\b/);
    assert.doesNotMatch(response, /\b\d+\s+(?:open\s+)?seats?\b/i);
    assert.doesNotMatch(response, /Professor\s+[A-Z]|Dr\.\s+[A-Z]/);
  }
});

test("historical grade provenance stays historical and points to normal lookup", () => {
  for (const prompt of [focusedPrompts[2].prompt, focusedPrompts[8].prompt, focusedPrompts[16].prompt]) {
    const request = detectDataProvenanceRequest(prompt);
    assert.equal(request?.kind, "historical_grades", prompt);
    const response = renderDataProvenanceResponse(request, configuredInstructorTermCodes);
    assert.match(response, /Data status: Historical/i);
    assert.match(response, /normal course or professor lookup/i);
    assert.doesNotMatch(response, /Data status: Live/i);
  }
});

test("account context is distinct from access to UIC systems", () => {
  const request = detectDataProvenanceRequest(focusedPrompts[10].prompt);
  assert.equal(request?.kind, "account_access");
  const response = renderDataProvenanceResponse(request!, configuredInstructorTermCodes);
  assert.match(response, /no direct access/i);
  assert.match(response, /student-supplied context/i);
});

test("unknown freshness and official-source conflict policy are explicit", () => {
  for (const prompt of [focusedPrompts[5].prompt, focusedPrompts[6].prompt, focusedPrompts[7].prompt, focusedPrompts[13].prompt, focusedPrompts[14].prompt]) {
    const request = detectDataProvenanceRequest(prompt);
    assert.ok(request, prompt);
    const response = renderDataProvenanceResponse(request, configuredInstructorTermCodes);
    if (request.kind !== "conflict") assert.match(response, /unknown|does not provide|not available/i, prompt);
    assert.match(response, /official UIC|official office|official source|UIC catalog/i, prompt);
  }
});

test("typos and direct paraphrases remain bounded to product provenance", () => {
  for (const prompt of [
    "wher does ur data come frm sparky?",
    "is ur data live or saved?",
    "Does UI Chicago update professor data on a schedule?",
    "Can Sparky check my degree audit?",
    "Tell me the freshness limits of your answers.",
  ]) {
    assert.ok(detectDataProvenanceRequest(prompt), prompt);
  }
});

test("ordinary source, current, live, history, and housing questions are not intercepted", () => {
  for (const prompt of [
    "What source should I cite for my history paper?",
    "Tell me the history of UIC.",
    "Is the library open right now?",
    "Who is the current UIC president?",
    "Where can I live near campus?",
    "What is UIC housing like?",
    "Are there open seats in CS 251?",
    "Who teaches CS 211 next semester?",
    "What does CS 211 cover?",
    "Does this course have live laboratory sessions?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("conversational have, know, and tell requests remain on existing domain paths", () => {
  for (const prompt of [
    "Do you have open seats in CS 251?",
    "What do you know about open seats in CS 251?",
    "Do you know who teaches CS 211 next semester?",
    "Do you have historical GPA data for CS 211?",
    "Do you have current course catalog information for CS 211?",
    "Do you know current UIC housing rates?",
    "Can you tell me the average GPA in CS 211?",
    "Can you tell me who teaches CS 211 next semester?",
    "Can you tell me about current UIC housing rates?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("bounded capability, data-use, and answer-status frames detect provenance", () => {
  const cases = [
    ["Can't you access my degree audit?", "account_access"],
    ["Cannot you access my registration record?", "account_access"],
    ["Do you use historical grade data for CS 211 answers?", "historical_grades"],
    ["Do you use live data for open-seat answers?", "live_schedule"],
    ["Is your answer about CS 211's GPA historical or live?", "historical_grades"],
    ["Is this answer about CS 211 GPA cached or historical?", "historical_grades"],
    ["Isn't your average-GPA answer based on historical data?", "historical_grades"],
    ["What information do you have on your data sources and freshness?", "overview"],
  ] as const;
  for (const [prompt, kind] of cases) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }
});

test("bounded capability frames do not capture ordinary use and answer questions", () => {
  for (const prompt of [
    "Can't you help me choose classes?",
    "Cannot you access the library source code?",
    "Do you use the library for studying?",
    "Do you use source code for CS 211 answers?",
    "Do you use historical novels for class?",
    "Is your answer about CS 211 helpful?",
    "Isn't your average GPA high?",
    "Can you tell me whether CS 211 uses live laboratory sessions?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("active, passive, confirmation, and status-first provenance permutations", () => {
  const positives = [
    ["Don't you use historical grade data for CS 211 answers?", "historical_grades"],
    ["dont you use historical grade data for CS 211 answers?", "historical_grades"],
    ["Do u use historical grade data for CS 211 answers?", "historical_grades"],
    ["Don't you use live data for open-seat answers?", "live_schedule"],
    ["Aren't your GPA answers based on historical data?", "historical_grades"],
    ["Is historical data used for the GPA answers Sparky gives?", "historical_grades"],
    ["Are open-seat answers based on live data?", "live_schedule"],
    ["What source does Sparky use for GPA answers?", "historical_grades"],
    ["What source does Sparky use for instructor answers?", "live_schedule"],
    ["Are schedule answers based on cached data?", "live_schedule"],
    ["Are catalog answers based on stored data?", "catalog"],
    ["What source does Sparky use for tuition answers?", "stored_facts"],
    ["Historical or live: is your answer about CS 211 GPA?", "historical_grades"],
    ["You don't have access to my degree audit, right?", "account_access"],
  ] as const;
  for (const [prompt, kind] of positives) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }

  const negatives = [
    "Don't you use the library after class?",
    "Do u use source code in CS 211?",
    "Is historical data used in this history course?",
    "Are open seats available in CS 251?",
    "Historical or live: which concert recording is better?",
    "What source explains the GPA formula?",
    "Aren't your grades improving?",
    "You don't have access to the library, right?",
    "Is this catalog current for CS 211?",
    "What data source should I cite in my paper?",
  ];
  for (const prompt of negatives) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("sourcing, account reversal, and category freshness frames stay bounded", () => {
  const positives = [
    ["Where are Sparky GPA answers sourced from?", "historical_grades"],
    ["What are Sparky open-seat answers sourced from?", "live_schedule"],
    ["Are you connected to my degree audit?", "account_access"],
    ["Is my degree audit connected to you?", "account_access"],
    ["You cannot see my grades, right?", "account_access"],
    ["My degree audit isn't accessible to you, right?", "account_access"],
    ["Are the GPA answers historical and how fresh are they?", "historical_grades"],
    ["Are open-seat answers live, and when were they verified?", "live_schedule"],
    ["Are tuition answers stored, and how fresh are they?", "stored_facts"],
  ] as const;
  for (const [prompt, kind] of positives) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }

  for (const prompt of [
    "Where are the materials for my source-based assignment?",
    "What source should I use for this assignment?",
    "Are you connected to your classmates?",
    "Is CS 211 connected to CS 251?",
    "Can you see why my grades improved?",
    "View grades as a topic in this report.",
    "How fresh is the produce in the dining hall?",
    "When was this webpage verified?",
    "Are tuition rates higher this year?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("source and status relations classify consistently without treating analysis as account access", () => {
  const categoryCases = [
    ["Where are GPA answers sourced from?", "historical_grades"],
    ["Where are open-seat answers sourced from?", "live_schedule"],
    ["Where are catalog answers sourced from?", "catalog"],
    ["What are prerequisite answers sourced from?", "catalog"],
    ["Where are tuition answers sourced from?", "stored_facts"],
    ["What are housing answers sourced from?", "stored_facts"],
    ["Are GPA answers historical, and when were they verified?", "historical_grades"],
    ["Are open-seat answers live, and when were they verified?", "live_schedule"],
    ["Are catalog answers stored, and when were they verified?", "catalog"],
    ["Are prerequisite answers cached, and when were they verified?", "catalog"],
    ["Are tuition answers stored, and when were they verified?", "stored_facts"],
    ["Are housing answers cached, and when were they verified?", "stored_facts"],
    ["Could you access my registration record?", "account_access"],
    ["Can Sparky view my grades?", "account_access"],
    ["Can you connect to myUIC?", "account_access"],
    ["Is my student account visible to Sparky?", "account_access"],
  ] as const;
  for (const [prompt, kind] of categoryCases) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }

  for (const prompt of [
    "Can you explain the connection between my grades and attendance?",
    "Can you connect my grades to my study habits?",
    "Could you connect my grades with the courses I took?",
    "How are grades connected to attendance?",
    "What is the connection between a degree audit and graduation?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("shared provenance cues work across every recognized answer category", () => {
  const cases = [
    ["Are GPA answers historical?", "historical_grades"],
    ["What source powers grade answers?", "historical_grades"],
    ["Where do grade answers come from?", "historical_grades"],
    ["Are grade answers based on historical records?", "historical_grades"],
    ["How fresh are GPA answers?", "historical_grades"],
    ["When were grade answers last verified?", "historical_grades"],
    ["Are open-seat answers live?", "live_schedule"],
    ["What source powers schedule answers?", "live_schedule"],
    ["Where do instructor answers come from?", "live_schedule"],
    ["Are seat answers based on live data?", "live_schedule"],
    ["How fresh are open-seat answers?", "live_schedule"],
    ["When were schedule answers last verified?", "live_schedule"],
    ["Are catalog answers cached?", "catalog"],
    ["What source powers prerequisite answers?", "catalog"],
    ["Where do catalog answers come from?", "catalog"],
    ["Are prerequisite answers based on stored data?", "catalog"],
    ["How fresh are catalog answers?", "catalog"],
    ["When were prerequisite answers last verified?", "catalog"],
    ["Are tuition answers stored?", "stored_facts"],
    ["What source powers housing answers?", "stored_facts"],
    ["Where do campus service answers come from?", "stored_facts"],
    ["Are housing answers based on cached data?", "stored_facts"],
    ["How fresh are tuition answers?", "stored_facts"],
    ["When were housing answers last verified?", "stored_facts"],
  ] as const;
  for (const [prompt, kind] of cases) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }
});

test("overview and account structures win without widening ordinary questions", () => {
  const positives = [
    ["What sources power Sparky answers, and what is the freshness limit for each category?", "overview"],
    ["List the data sources powering UIChicago answers and freshness limits for each major category.", "overview"],
    ["Which sources power your answers in each category?", "overview"],
    ["Does Sparky have access to my degree audit?", "account_access"],
    ["Can you read my registration record?", "account_access"],
    ["Could UIChicago view my grades?", "account_access"],
    ["Is myUIC integrated with Sparky?", "account_access"],
    ["Are you integrated with my student account?", "account_access"],
    ["Can you connect to myUIC?", "account_access"],
    ["Is my degree audit visible to you?", "account_access"],
  ] as const;
  for (const [prompt, kind] of positives) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }

  for (const prompt of [
    "When was the assignment source last verified?",
    "How fresh is this research source?",
    "What sources power this history assignment?",
    "When was this course assignment updated?",
    "Can you connect my grades to attendance?",
    "Could you connect my grades with my study habits?",
    "Can you explain how my grades relate to the courses I took?",
    "Can you see why my grades changed?",
    "Is this housing option available?",
    "Are prerequisite courses difficult?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("topic, research, conflict, and compound boundaries remain explicit", () => {
  const positives = [
    ["Are tuition answers stored?", "stored_facts"],
    ["Is your tuition information cached?", "stored_facts"],
    ["What source does Sparky use for GPA answers?", "historical_grades"],
    ["Do you use historical grade data for answers?", "historical_grades"],
    ["How fresh is Sparky's housing information?", "stored_facts"],
    ["How current is UIChicago tuition data?", "stored_facts"],
    ["What source did Sparky use for the housing answer in my research paper?", "stored_facts"],
    ["Does my degree audit connect to Sparky?", "account_access"],
    ["My stored tuition answer conflicts with the current official UIC website.", "conflict"],
    ["Sparky's GPA answer disagrees with the official UIC source.", "conflict"],
    ["Your open-seat answer conflicts with the current official UIC source.", "conflict"],
    ["Are GPA answers historical and open-seat answers live?", "overview"],
    ["What sources do Sparky's GPA answers and tuition answers use?", "overview"],
    ["How fresh are catalog answers and housing answers?", "overview"],
    ["Are schedule answers live and catalog answers cached?", "overview"],
  ] as const;
  for (const [prompt, kind] of positives) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }

  for (const prompt of [
    "How fresh is campus housing?",
    "How current is tuition?",
    "What source should I cite for my housing research paper?",
    "Which source should I cite for GPA research?",
    "What source explains my grades?",
    "Are historical grades higher than current grades?",
    "Is stored housing information useful for my essay?",
    "When was tuition last verified?",
    "What bibliography should I use for a paper about prerequisites?",
    "Can you connect my grades to my attendance record?",
    "Does my degree audit connect to graduation requirements?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("shared objects, answer citations, conflicts, and account morphology stay bounded", () => {
  const positives = [
    ["What sources power GPA and catalog answers?", "overview"],
    ["What sources power GPA, catalog, and tuition answers?", "overview"],
    ["Are GPA and catalog answers historical or stored?", "overview"],
    ["How fresh are GPA and tuition data?", "overview"],
    ["What source should I cite for Sparky's GPA answer?", "historical_grades"],
    ["What source can I cite for the GPA answer you gave me?", "historical_grades"],
    ["Are you able to access my degree audit?", "account_access"],
    ["Is Sparky able to access my registration record?", "account_access"],
    ["Does Sparky have visibility into my grades?", "account_access"],
    ["Are you connected with my student account?", "account_access"],
    ["Is my degree audit connected with Sparky?", "account_access"],
    ["GPA data is important, but how fresh are catalog answers?", "catalog"],
    ["Tell me about GPA and, after housing, how fresh are catalog answers?", "catalog"],
  ] as const;
  for (const [prompt, kind] of positives) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }

  for (const prompt of [
    "What source does Sparky recommend for GPA research?",
    "What source should I use for a research paper about GPA?",
    "My GPA data conflicts with the current official UIC source.",
    "Catalog answers conflict with the official UIC source.",
    "Tuition information differs from the official UIC website.",
    "Can you connect my grades with attendance data?",
    "Do my grades connect with my study habits?",
    "Do you have visibility into course grade trends?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("question clauses bound coordination, citations, conflicts, and account relations", () => {
  const positives = [
    ["What sources power GPA, catalog answers?", "overview"],
    ["What sources power GPA and catalog answers?", "overview"],
    ["What sources power GPA or catalog answers?", "overview"],
    ["What sources power GPA / catalog answers?", "overview"],
    ["What sources power GPA & catalog answers?", "overview"],
    ["What sources power GPA vs. catalog answers?", "overview"],
    ["What sources power GPA versus catalog answers?", "overview"],
    ["GPA data is historical. How fresh are catalog answers?", "catalog"],
    ["GPA data is historical; How fresh are catalog answers?", "catalog"],
    ["Using GPA data, how fresh are catalog answers?", "catalog"],
    ["GPA data is historical while how fresh are catalog answers?", "catalog"],
    ["Catalog answers are stored. Are open-seat answers live?", "live_schedule"],
    ["What citation supports Sparky's GPA answer?", "historical_grades"],
    ["Which bibliography supports the GPA answer you provided?", "historical_grades"],
    ["The GPA answer you gave conflicts with the current official UIC source.", "conflict"],
    ["The tuition answer Sparky provided disagrees with the current official UIC website.", "conflict"],
    ["Are you able to view my degree audit?", "account_access"],
    ["Is Sparky able to see my grades?", "account_access"],
    ["Are you able to read my registration record?", "account_access"],
    ["Do you have a connection to myUIC?", "account_access"],
    ["Is my degree audit available to you?", "account_access"],
  ] as const;
  for (const [prompt, kind] of positives) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }

  for (const prompt of [
    "What source does Sparky recommend for my GPA assignment?",
    "My GPA data conflicts with the current official UIC source.",
    "GPA data is historical. Are catalog answers useful?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }
});

test("closed clause and reference grammar covers the cycle-nine acceptance matrix", () => {
  const exactCases = [
    ["Using GPA data how fresh are catalog answers?", "catalog"],
    ["GPA data is historical and how fresh are catalog answers?", "catalog"],
    ["Are GPA answers historical; catalog answers stored?", "overview"],
    ["What reference supports Sparky's GPA answer?", "historical_grades"],
    ["That answer conflicts with current official UIC source.", "conflict"],
    ["Your catalog information conflicts with current official UIC source.", "conflict"],
    ["The GPA data you gave me conflicts with official UIC source.", "conflict"],
    ["Can you get access to my grades?", "account_access"],
    ["Can Sparky look at my degree audit?", "account_access"],
    ["Are my grades available for Sparky to see?", "account_access"],
  ] as const;
  for (const [prompt, kind] of exactCases) {
    assert.equal(detectDataProvenanceRequest(prompt)?.kind, kind, prompt);
  }

  for (const prompt of [
    "Using GPA data what courses are in the catalog?",
    "What reference should I use for my GPA research assignment?",
    "My GPA data conflicts with current official UIC source.",
    "Can Sparky look at grade trends?",
    "Are grades generally available?",
  ]) {
    assert.equal(detectDataProvenanceRequest(prompt), null, prompt);
  }

  assert.equal(
    detectDataProvenanceRequest("Are GPA answers historical; catalog courses useful?")?.kind,
    "historical_grades",
    "an arbitrary semicolon fragment must not add a second category",
  );
});

test("route integration logs a distinct successful fast path before product routing", () => {
  const routeSource = readFileSync(new URL("../../app/api/chat/route.ts", import.meta.url), "utf8");
  const provenancePath = routeSource.indexOf('"data_provenance_fast_path"');
  const productPath = routeSource.indexOf("if (isProductQuestion");
  assert.ok(provenancePath >= 0);
  assert.ok(productPath > provenancePath);
  assert.match(
    routeSource.slice(provenancePath - 300, provenancePath + 100),
    /data_provenance_capability[\s\S]*data_provenance_fast_path[\s\S]*success/,
  );
});
