import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  answerCatalogCourseFactRequest,
  detectCatalogCourseFactRequest,
  extractCatalogCourseInformation,
  isAccessRestrictionLikeSentence,
  isNegativeCreditLikeSentence,
  isPositiveTransferCreditPolicySentence,
  parseCatalogCourseFacts,
  type CatalogCourseRecord,
} from "./catalog-course-facts.ts";
import { buildPlainTextLogInput } from "../chat/plain-text-log.ts";

const catalog = JSON.parse(
  readFileSync(new URL("../../scripts/catalog-scraped.json", import.meta.url), "utf8"),
) as CatalogCourseRecord[];

function answer(query: string) {
  const request = detectCatalogCourseFactRequest(query);
  assert.ok(request, query);
  return answerCatalogCourseFactRequest(request, catalog);
}

test("answers representative CS prerequisite questions from exact catalog clauses", () => {
  const cases = [
    ["CS 211", "3", "Grade of C or better in CS 141", "only for Computer Engineering majors"],
    ["CS 251", "4", "Grade of C or better in CS 151", "concurrent registration in ECE 266"],
    ["CS 261", "4", "Grade of C or better in CS 141", "concurrent registration in CS 211"],
    ["CS 301", "3", "Grade of C or better in CS 151", "concurrent registration in CS 251"],
  ];
  for (const [code, hours, requiredText, qualifier] of cases) {
    const result = answer(`How many credit hours is ${code}, and what are its exact prerequisites?`);
    assert.equal(result.kind, "answer", code);
    assert.match(result.response, new RegExp(`Credit hours:\\*\\* ${hours}\\b`), code);
    assert.ok(result.response.includes(requiredText), code);
    assert.ok(result.response.includes(qualifier), code);
    assert.match(result.response, /local catalog snapshot/i, code);
    assert.match(result.response, /official UIC/i, code);
  }
});

test("top-level CS 211 hours win over embedded Course Information prose", () => {
  const result = answer("How many hours is CS211?");
  assert.match(result.response, /Credit hours:\*\* 3\b/);
  assert.doesNotMatch(result.response, /Credit hours:\*\* 2\b/);
});

test("FIN 300 labels recommended background separately from prerequisites", () => {
  const result = answer("What is FIN 300, how many credits is it, and what background is recommended?");
  assert.equal(result.kind, "answer");
  assert.match(result.response, /Introduction to Finance/);
  assert.match(result.response, /Credit hours:\*\* 3\b/);
  assert.match(result.response, /Recommended background \(not a prerequisite\):\*\* ACTG 210 and ECON 120/);
  assert.doesNotMatch(result.response, /Prerequisites:\*\* ACTG 210/);
});

test("ACTG 210 reports only the absence of a snapshot prerequisite clause", () => {
  const result = answer("What is ACTG 210, how many credits is it, and does it have prerequisites?");
  assert.equal(result.kind, "answer");
  assert.match(result.response, /Introduction to Financial Accounting/);
  assert.match(result.response, /No prerequisite clause is listed in this catalog snapshot/);
  assert.match(result.response, /Other registration restrictions may still apply/);
});

test("ASP 021 reports its corequisite instead of claiming no concurrent requirement", () => {
  const result = answer("What prerequisites or corequisites does ASP 021 have?");
  assert.equal(result.kind, "answer");
  assert.match(result.response, /No prerequisite clause is listed/);
  assert.match(result.response, /Corequisites \(concurrent enrollment\):\*\* Requires concurrent registration in MATH 121/);
});

test("singular, plural, parenthesized, and hyphenated corequisite labels are preserved", () => {
  const request = detectCatalogCourseFactRequest("What are the corequisites for TST 100?")!;
  for (const label of [
    "Corequisite",
    "Corequisites",
    "Corequisite(s)",
    "Co-requisite",
    "Co-requisites",
    "Co-requisite(s)",
  ]) {
    const result = answerCatalogCourseFactRequest(request, [{
      subject: "TST",
      number: "100",
      title: "Synthetic Course",
      hours: "3",
      description: `Synthetic description. ${label}: Keep this exact concurrent condition.`,
    }]);
    assert.equal(result.kind, "answer", label);
    assert.match(result.response, /Keep this exact concurrent condition/);
  }
});

test("all snapshot corequisite sections are separated from prerequisites", () => {
  const recordsWithCorequisites = catalog.filter((record) =>
    typeof record.description === "string" && /Co-?requisite(?:s|\s*\(s\))?:/i.test(record.description),
  );
  assert.equal(recordsWithCorequisites.length, 50);
  for (const record of recordsWithCorequisites) {
    const parsed = parseCatalogCourseFacts(record);
    assert.ok(parsed, `${String(record.subject)} ${String(record.number)}`);
    assert.ok(parsed.corequisites, `${parsed.code} corequisite missing`);
    assert.doesNotMatch(parsed.prerequisites ?? "", /Co-?requisite/i, `${parsed.code} prerequisite absorbed corequisite`);
    assert.doesNotMatch(
      extractCatalogCourseInformation(String(record.description)) ?? "",
      /Co-?requisite/i,
      `${parsed.code} Course Information absorbed corequisite`,
    );
  }
});

test("hyphenated snapshot corequisites render as registration requirements", () => {
  for (const code of ["CC 250", "CC 251", "CHEM 240", "PMPR 327", "PHYS 499"]) {
    const result = answer(`What restrictions and corequisites does ${code} have?`);
    assert.equal(result.kind, "answer", code);
    assert.match(result.response, /Corequisites \(concurrent enrollment\):\*\* (?!No corequisite)/, code);
    assert.doesNotMatch(result.response, /No corequisite clause is listed/, code);
  }
});

test("short Class Schedule labels remain separate registration sections", () => {
  const records = catalog.filter((record) =>
    typeof record.description === "string" && /\bClass Schedule:/i.test(record.description),
  );
  assert.equal(records.length, 6);
  assert.deepEqual(records.map((record) => `${String(record.subject)} ${String(record.number)}`).sort(), [
    "ANTH 208",
    "ART 151",
    "CHEM 475",
    "PHYS 475",
    "PSCH 333",
    "PSCH 367",
  ]);
  for (const record of records) {
    const parsed = parseCatalogCourseFacts(record);
    assert.ok(parsed, `${String(record.subject)} ${String(record.number)}`);
    assert.ok(parsed.registrationRestrictions.some((note) => /properly registered/i.test(note)), parsed.code);
    assert.doesNotMatch(parsed.prerequisites ?? "", /Class Schedule|properly registered/i, parsed.code);
    assert.doesNotMatch(parsed.recommendedBackground ?? "", /Class Schedule|properly registered/i, parsed.code);
    assert.doesNotMatch(
      extractCatalogCourseInformation(String(record.description)) ?? "",
      /Class Schedule|properly registered/i,
      parsed.code,
    );

    const result = answer(`What restrictions does ${parsed.code} have?`);
    assert.match(result.response, /Registration note:\*\*[^\n]*To be properly registered/i, parsed.code);
  }
});

test("trailing prerequisite access clauses render separately without duplication", () => {
  const cases: Array<[string, string]> = [
    ["PSCH 333", "For Psychology majors only."],
    ["PSCH 367", "For psychology majors or students in the neuroscience degree program only."],
    ["AHS 405", "Open only to juniors and seniors; and consent of the instructor."],
    ["ARCH 395", "Restricted to students withthird or fourth year standing in the B.A. in Architectural Studies program."],
  ];
  for (const [code, clause] of cases) {
    const record = catalog.find((item) => `${String(item.subject)} ${String(item.number)}` === code);
    assert.ok(record, code);
    const parsed = parseCatalogCourseFacts(record);
    assert.ok(parsed, code);
    assert.ok(parsed.registrationRestrictions.includes(clause), code);
    assert.ok(!parsed.prerequisites?.includes(clause), code);

    for (const query of [`What are the prerequisites for ${code}?`, `What restrictions does ${code} have?`]) {
      const result = answer(query);
      assert.match(result.response, new RegExp(clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), query);
      assert.equal(result.response.split(clause).length - 1, 1, query);
      assert.match(result.response, /Registration note:/, query);
    }
  }
});

test("snapshot trailing prerequisite access inventory is split and surfaced", () => {
  const expectedCodes = [
    "AHS 405", "ARCH 395", "ART 380", "AH 490", "BIOS 102", "BA 395", "COMM 301",
    "DES 450", "ED 151", "ECE 396", "ENGR 193", "ENGR 293", "ENGR 393", "ENGR 404",
    "ENGR 493", "GER 300", "GER 398", "HUM 120", "IE 396", "ISA 100", "LAS 120",
    "ME 328", "ME 396", "PMPR 370", "PHIL 390", "PHYS 101", "PSCH 303", "PSCH 313",
    "PSCH 321", "PSCH 331", "PSCH 333", "PSCH 343", "PSCH 351", "PSCH 353", "PSCH 361",
    "PSCH 363", "PSCH 367", "PSCH 381", "PSCH 382", "PSCH 385", "US 304",
  ].sort();
  const actualCodes: string[] = [];
  for (const record of catalog) {
    const parsed = parseCatalogCourseFacts(record);
    if (!parsed) continue;
    const moved = parsed.registrationRestrictions.filter((clause) =>
      /^(?:Open only to|Restricted to)/i.test(clause) ||
      /^For\b[^.]{0,300}\b(?:majors?|students?)\b[^.]{0,120}\bonly\.$/i.test(clause),
    ).filter((clause) => {
      if (typeof record.description !== "string") return false;
      const normalizedDescription = record.description.replace(/\s+/g, " ").replace(/\s+([.;,:])/g, "$1");
      const prerequisiteStart = normalizedDescription.search(/Prerequisite(?:\s*\(s\))?:/i);
      return prerequisiteStart >= 0 && normalizedDescription.indexOf(clause, prerequisiteStart) >= 0;
    });
    if (!moved.length) continue;
    assert.equal(moved.length, 1, `${parsed.code} split more than one access clause`);
    const [clause] = moved;
    assert.ok(!parsed.prerequisites?.includes(clause), `${parsed.code} retained the access clause in prerequisites`);
    actualCodes.push(parsed.code);
  }
  assert.deepEqual(actualCodes.sort(), expectedCodes);
  assert.equal(actualCodes.length, 41);
});

test("access sentences with consent alternatives remain prerequisite logic", () => {
  for (const code of ["BME 399", "EPSY 383", "PUBH 390", "SPED 423", "SPED 481", "US 390"]) {
    const record = catalog.find((item) => `${String(item.subject)} ${String(item.number)}` === code);
    assert.ok(record, code);
    const parsed = parseCatalogCourseFacts(record);
    assert.ok(parsed?.prerequisites, code);
    assert.match(parsed.prerequisites, /(?:Open only to|Restricted to).*\bor\b.*(?:consent|approval)/i, code);
  }
});

test("ARCH 252 keeps parenthesized corequisites separate", () => {
  const result = answer("What are the prerequisites and corequisites for ARCH 252?");
  assert.match(result.response, /Prerequisites:\*\* BS Arch students: ARCH 205 and ARCH 251/);
  assert.match(result.response, /Corequisites \(concurrent enrollment\):\*\* BS Arch students must concurrently enroll in ARCH 206/);
  const prerequisiteLine = result.response.match(/\*\*Prerequisites:\*\* ([^\n]+)/)?.[1] ?? "";
  assert.doesNotMatch(prerequisiteLine, /ARCH 206/);
});

test("restriction questions include corequisites as registration requirements", () => {
  const result = answer("What restrictions does ASP 021 have?");
  assert.match(result.response, /Corequisites \(concurrent enrollment\):\*\* Requires concurrent registration in MATH 121/);
  assert.match(result.response, /corequisite above is a concurrent registration requirement/i);
  assert.doesNotMatch(result.response, /No separate registration note is listed in this catalog snapshot/);
});

test("CS 292 meeting and delivery prose is not labeled as a prerequisite", () => {
  const result = answer("What are the prerequisites for CS 292?");
  assert.equal(result.kind, "answer");
  const prerequisiteLine = result.response.match(/\*\*Prerequisites:\*\* ([^\n]+)/)?.[1] ?? "";
  assert.match(prerequisiteLine, /Hired first-time TA's in the Department/);
  assert.match(prerequisiteLine, /There are no course prerequisites/);
  assert.doesNotMatch(prerequisiteLine, /Meets eight weeks|Zoom|asynchronous/);
  assert.match(result.response, /Other catalog note \(separate from prerequisites\).*Meets eight weeks/);
  assert.match(result.response, /Zoom meetings and asynchronous work/);
});

test("unheaded operational prose is conservatively separated from synthetic prerequisite clauses", () => {
  const parsed = parseCatalogCourseFacts({
    subject: "TST",
    number: "200",
    title: "Synthetic Boundary",
    hours: "1",
    description: "Description. Prerequisite: Consent of the instructor. Offered online with weekly meetings.",
  });
  assert.equal(parsed?.prerequisites, "Consent of the instructor.");
  assert.deepEqual(parsed?.otherCatalogNotes, ["Offered online with weekly meetings."]);
});

test("credit exclusions and registration notes remain separate", () => {
  const fin = answer("What restrictions does FIN 300 have?");
  assert.match(fin.response, /Credit is not given for FIN 300 if the student has credit in FIN 301 or FIN 302/);

  const cs = answer("Tell me about CS 261 and its restrictions");
  assert.match(cs.response, /Credit is not given for CS 261 if the student has credit for ECE 267 or ECE 366/);
  assert.match(cs.response, /students must enroll in one Lecture-Discussion and one Laboratory/);
});

test("unknown, duplicate, and malformed records fail closed with course-specific redirects", () => {
  const unknown = answerCatalogCourseFactRequest(detectCatalogCourseFactRequest("What is ZZZ 999?")!, catalog);
  assert.equal(unknown.kind, "redirect");
  assert.match(unknown.response, /ZZZ 999/);
  assert.match(unknown.response, /catalog\.uic\.edu\/ucat\/course-descriptions\/zzz/);
  assert.doesNotMatch(unknown.response, /athletics|housing/i);

  const request = detectCatalogCourseFactRequest("What is CS 211?")!;
  const malformed = answerCatalogCourseFactRequest(request, [{ subject: "CS", number: "211", title: "Programming Practicum", hours: "3" }]);
  assert.equal(malformed.kind, "redirect");
  assert.equal(parseCatalogCourseFacts({ subject: "CS", number: "211", title: "Programming Practicum", hours: "3" }), null);

  const valid = catalog.find((record) => record.subject === "CS" && record.number === "211")!;
  assert.equal(answerCatalogCourseFactRequest(request, [valid, valid]).kind, "redirect");
});

test("specialized and unrelated flows are not intercepted", () => {
  const controls = [
    "Which professor is best for CS 211?",
    "What is the average GPA for CS 211?",
    "Are there open seats in CS 211?",
    "Who teaches CS 211 this semester?",
    "Can I take CS 211 next semester?",
    "Compare CS 211 vs CS 251",
    "Show me all CS courses",
    "Tell me about UIC housing",
    "I am taking CS 211",
    "What is UIC housing like near CS 211?",
    "What dining options are near CS 211?",
    "What CTA transportation should I use for CS 211?",
    "What UIC athletics are near CS 211?",
    "What campus services can help me with CS 211?",
    "Is the library useful near my CS 211 class?",
  ];
  for (const query of controls) assert.equal(detectCatalogCourseFactRequest(query), null, query);
  assert.ok(detectCatalogCourseFactRequest("What is CS 211?"));
});

test("course titles containing campus-domain words remain exact course facts", () => {
  const positives = [
    "What is CME 302: Transportation Engineering?",
    "What is ANTH 314 Anthropology of Food?",
    "What is KN 331 Sport and Exercise Injury Management?",
    "What is CS 211 and does it teach standard libraries?",
    "How many credit hours is CME 302?",
    "What are the prerequisites for ANTH 314?",
  ];
  for (const query of positives) assert.ok(detectCatalogCourseFactRequest(query), query);

  const incidental = [
    "What is UIC housing like near CS 211?",
    "What dining options are near ANTH 314?",
    "Which CTA stop is near CME 302?",
    "What sport can I play after KN 331?",
    "What campus services can help with CS 211?",
  ];
  for (const query of incidental) assert.equal(detectCatalogCourseFactRequest(query), null, query);
});

test("course focus grammar supports code-before and code-after fact cues", () => {
  const positives = [
    "What does CS 211 cover?",
    "What is covered in CS 211?",
    "What do you learn in CS 211?",
    "Explain CS 211.",
    "CS 211 details",
    "CS 211: information",
    "What is ED 316 Teacher Development I?",
    "Tell me about ED 316 Teacher Development I",
    "How many credit hours is CS 211?",
    "CS 211 is how many hours?",
    "Credits for CS 211?",
    "Prerequisites for CS 211?",
    "CS 211 prerequisites?",
    "What restrictions does ASP 021 have?",
  ];
  for (const query of positives) assert.ok(detectCatalogCourseFactRequest(query), query);
});

test("near, from, and at bind incidental facts to another subject", () => {
  const incidental = [
    "How many hours is the library open near CS 211?",
    "What food is available near ANTH 314?",
    "How far is the train from CME 302?",
    "What services are available at CS 211?",
    "How many hours is tutoring available near CS 211?",
  ];
  for (const query of incidental) assert.equal(detectCatalogCourseFactRequest(query), null, query);
});

test("professor, instructor, and teacher syntax stays on specialized routes", () => {
  const specialized = [
    "Who is the teacher for CS 211?",
    "CS 211 professor",
    "CS 211 instructor",
    "Which instructor teaches CS 211?",
    "Tell me about the professor for CS 211",
  ];
  for (const query of specialized) assert.equal(detectCatalogCourseFactRequest(query), null, query);
});

test("direct course-hour grammar supports has, carries, worth, and from variants", () => {
  const positives = [
    "CS 211 has how many credit hours?",
    "How many credit hours do you get from CS 211?",
    "CS 211 carries how many credits?",
    "CS 211 is worth how many credits?",
    "CS 211 how many credits?",
    "How many credits from CS 211?",
    "Credits from CS 211?",
    "How many credits does CS 211 carry?",
  ];
  for (const query of positives) assert.ok(detectCatalogCourseFactRequest(query), query);

  const incidental = [
    "How many hours is the library open near CS 211?",
    "How many hours does tutoring run near CS 211?",
    "How many service hours can I get from volunteering near CS 211?",
  ];
  for (const query of incidental) assert.equal(detectCatalogCourseFactRequest(query), null, query);
});

test("overview shorthand accepts typographic dashes and parentheses", () => {
  const positives = [
    "CS 211 — details",
    "CS 211 – information",
    "CS 211 (details)",
    "CS 211 (information)",
  ];
  for (const query of positives) assert.ok(detectCatalogCourseFactRequest(query), query);
});

test("compound specialized requests stay out of the deterministic catalog path", () => {
  const compounds = [
    "What is CS 211 and who teaches it?",
    "How many credits is CS 211 and are there open seats?",
    "Tell me about CS 211 and can I take it next semester?",
    "What are the prerequisites for CS 211 and what is its average GPA?",
    "What is CS 211 and which instructor should I take?",
    "Explain CS 211 and is there a waitlist?",
    "CS 211 details and show me the grade distribution",
    "What is CS 211 and compare its professors",
    "What is CS 211 and rank the instructors",
    "What is CS 211 and what is the current schedule?",
  ];
  for (const query of compounds) assert.equal(detectCatalogCourseFactRequest(query), null, query);
});

test("bare office, tutoring, service, library, lab, and contact hours never become course credits", () => {
  const negatives = [
    "Office hours for CS 211?",
    "Tutoring hours for CS 211?",
    "Service hours from CS 211?",
    "Library hours near CS 211?",
    "Lab hours for CS 211?",
    "Contact hours for CS 211?",
    "CS 211 office hours",
    "CS 211 tutoring hours",
    "CS 211 service hours",
    "CS 211 library hours",
    "CS 211 lab hours",
    "CS 211 contact hours",
  ];
  for (const query of negatives) assert.equal(detectCatalogCourseFactRequest(query), null, query);

  const positives = [
    "How many hours is CS 211?",
    "CS 211 is how many hours?",
    "CS 211 has how many hours?",
    "How many credit hours do you get from CS 211?",
    "Credits for CS 211?",
    "Credits from CS 211?",
    "Credits of CS 211?",
  ];
  for (const query of positives) assert.ok(detectCatalogCourseFactRequest(query), query);
});

test("specialized compound actions yield across punctuation and connectors", () => {
  const compounds = [
    "What is CS 211; does it have open seats?",
    "Explain CS 211; are any seats open?",
    "What is CS 211; what's its average GPA?",
    "CS 211 details; give me professor ratings",
    "What is CS 211; also, who teaches it?",
    "What is CS 211, plus who teaches it?",
    "Explain CS 211; is there a waitlist?",
    "What is CS 211; what's its current schedule?",
    "Explain CS 211; can I take it next semester?",
    "What is CS 211; should I take it next semester?",
    "CS 211 details; compare it with another course",
    "CS 211 details; rank its professors",
  ];
  for (const query of compounds) assert.equal(detectCatalogCourseFactRequest(query), null, query);
});

test("natural bare course hours route unless service-hour context is explicit", () => {
  const positives = [
    "CS 211 hours?",
    "How many hours for CS 211?",
    "Hours for CS 211?",
    "What are CS 211 hours?",
    "How many hours is CS 211?",
    "CS 211 is how many hours?",
    "CS 211 has how many hours?",
    "How many credit hours do you get from CS 211?",
    "Credits for CS 211?",
    "Credits from CS 211?",
    "Credits of CS 211?",
  ];
  for (const query of positives) assert.ok(detectCatalogCourseFactRequest(query), query);

  const negatives = [
    "CS 211 office hours?",
    "How many tutoring hours for CS 211?",
    "Library hours for CS 211?",
    "How many service hours from CS 211?",
    "Volunteer hours for CS 211?",
    "CS 211 lab hours?",
    "Contact hours for CS 211?",
    "How many credit hours is CS 211, and what are the office hours?",
    "CS 211 hours, plus when does the lab meet?",
  ];
  for (const query of negatives) assert.equal(detectCatalogCourseFactRequest(query), null, query);
});

test("global bounded specialized phrases yield without suppressing title words", () => {
  const specialized = [
    "What is CS 211; does it have open seats?",
    "CS 211 details; are seats open?",
    "Explain CS 211; seat availability?",
    "What is CS 211; waitlist?",
    "Explain CS 211; current schedule?",
    "What is CS 211; GPA?",
    "Explain CS 211; grade distribution?",
    "CS 211 details; professor ratings?",
    "What is CS 211; who teaches it?",
    "Explain CS 211; which instructor should I take?",
    "What is CS 211; can I take it next semester?",
    "Explain CS 211; am I eligible for it?",
    "What is CS 211; next semester?",
    "Explain CS 211; compare it",
    "CS 211 details; rank its professors",
  ];
  for (const query of specialized) assert.equal(detectCatalogCourseFactRequest(query), null, query);

  for (const query of [
    "What is ED 316 Teacher Development I?",
    "Tell me about CME 302 Transportation Engineering",
    "What is KN 331 Sport and Exercise Injury Management?",
  ]) assert.ok(detectCatalogCourseFactRequest(query), query);
});

test("negative-credit and enrollment restriction variants are preserved", () => {
  const cases: Array<[string, RegExp]> = [
    ["ASP 021", /No graduation credit/],
    ["BIOS 250", /Credit for BIOS 250 is not given/],
    ["BIOS 352", /No credit given for BIOS 352.*No credit toward the degree in biochemistry/],
    ["COMM 100", /No Credit given toward major in Communication/],
    ["ELSI 012", /No graduation credit given/],
  ];
  for (const [code, expected] of cases) {
    const result = answer(`What restrictions does ${code} have?`);
    assert.equal(result.kind, "answer", code);
    assert.match(result.response, expected, code);
    assert.doesNotMatch(result.response, /Credit\/exclusion restrictions:\*\* None are listed/, code);
  }
  const elsi = answer("What restrictions does ELSI 012 have?");
  assert.match(elsi.response, /Open only to non-native speakers of English/);
});

test("unclassified restriction-like Course Information is surfaced for verification", () => {
  const request = detectCatalogCourseFactRequest("What restrictions does TST 300 have?")!;
  const result = answerCatalogCourseFactRequest(request, [{
    subject: "TST",
    number: "300",
    title: "Synthetic Restriction",
    hours: "3",
    description: "Description. Course Information: Intended for a special cohort and should not be taken by other students.",
  }]);
  assert.match(result.response, /Other catalog restriction notes \(verify\)/);
  assert.match(result.response, /Intended for a special cohort/);
  assert.doesNotMatch(result.response, /restrictions:\*\* None are listed/);
});

test("positive transfer-credit policies do not become catalog restrictions", () => {
  const actg = answer("What restrictions does ACTG 315 have?");
  assert.equal(actg.kind, "answer");
  assert.doesNotMatch(actg.response, /Transfer credit may be accepted/);
  assert.match(actg.response, /students must receive a C or better in ACTG 315 and may be repeated only once/);

  const request = detectCatalogCourseFactRequest("What restrictions does TST 315 have?")!;
  for (const policy of [
    "Transfer credit may be accepted by the department.",
    "Transfer credits may be accepted by the department.",
    "Transfer credit is allowed after evaluation.",
    "Transfer credits are allowed after evaluation.",
    "Transfer credit will be evaluated on a case-by-case basis.",
    "Transfer credits will be evaluated on a case-by-case basis.",
  ]) {
    const result = answerCatalogCourseFactRequest(request, [{
      subject: "TST",
      number: "315",
      title: "Synthetic Transfer Policy",
      hours: "3",
      description: `Description. Course Information: ${policy}`,
    }]);
    assert.doesNotMatch(result.response, /Other catalog restriction notes/, policy);
    assert.match(result.response, /Credit\/exclusion restrictions:\*\* None are listed/, policy);
  }
});

test("negative and limiting transfer-credit clauses remain visible", () => {
  const request = detectCatalogCourseFactRequest("What restrictions does TST 316 have?")!;
  for (const policy of [
    "Transfer credit may not be accepted for this course.",
    "Transfer credits may not be accepted for this course.",
    "No transfer credit is accepted.",
    "No transfer credits are accepted.",
    "A maximum of 3 hours of transfer credit may be accepted.",
    "A maximum of 3 transfer credits may be accepted.",
    "Transfer credit may be accepted only from an accredited program.",
    "Transfer credits may be accepted only from an accredited program.",
    "No transfer credit is allowed.",
    "No transfer credits are allowed.",
    "Transfer credit is excluded from this requirement.",
    "Transfer credits are excluded from this requirement.",
  ]) {
    assert.equal(isPositiveTransferCreditPolicySentence(policy), false, policy);
    const result = answerCatalogCourseFactRequest(request, [{
      subject: "TST",
      number: "316",
      title: "Synthetic Transfer Limit",
      hours: "3",
      description: `Description. Course Information: ${policy}`,
    }]);
    assert.match(result.response, new RegExp(policy.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), policy);
    assert.doesNotMatch(result.response, /restrictions:\*\* None are listed/, policy);
  }
});

test("snapshot positive transfer-credit inventory is excluded conservatively", () => {
  const inventory: string[] = [];
  for (const record of catalog) {
    if (typeof record.description !== "string") continue;
    const section = extractCatalogCourseInformation(record.description) ?? "";
    const transferSentences = section.split(/(?<=\.)\s+/).map((sentence) =>
      sentence.replace(/\s+/g, " ").replace(/\s+([.;,:])/g, "$1").trim(),
    ).filter((sentence) => /\btransfer(?:red)? credits?\b/i.test(sentence));
    for (const sentence of transferSentences) {
      inventory.push(`${String(record.subject)} ${String(record.number)}: ${sentence}`);
      const parsed = parseCatalogCourseFacts(record);
      assert.ok(parsed);
      if (isPositiveTransferCreditPolicySentence(sentence)) {
        assert.ok(!parsed.otherRestrictionNotes.includes(sentence));
      } else {
        assert.ok(
          [...parsed.creditRestrictions, ...parsed.otherRestrictionNotes].includes(sentence),
          `limiting transfer-credit sentence was dropped: ${sentence}`,
        );
      }
    }
  }
  assert.deepEqual(inventory, [
    "ACTG 315: Transfer credit may be accepted from an AACSB accredited institution on a case-by-case basis.",
  ]);
});

test("snapshot negative-credit-like Course Information is never silently dropped", () => {
  let matched = 0;
  for (const record of catalog) {
    if (typeof record.description !== "string") continue;
    const section = extractCatalogCourseInformation(record.description) ?? "";
    const negativeSentences = section.split(/(?<=\.)\s+/).map((sentence) =>
      sentence.replace(/\s+/g, " ").replace(/\s+([.;,:])/g, "$1").trim(),
    ).filter(isNegativeCreditLikeSentence);
    if (!negativeSentences.length) continue;
    matched += negativeSentences.length;
    const parsed = parseCatalogCourseFacts(record);
    assert.ok(parsed, `${String(record.subject)} ${String(record.number)}`);
    const surfaced = [...parsed.creditRestrictions, ...parsed.otherRestrictionNotes];
    for (const sentence of negativeSentences) {
      const comparable = sentence.replace(/\.$/, "");
      assert.ok(
        surfaced.some((item) => item.replace(/\.$/, "") === comparable),
        `${parsed.code} silently dropped: ${sentence}`,
      );
    }
  }
  assert.ok(matched > 100, `expected broad snapshot coverage, found ${matched}`);
});

test("catalog redirect log input preserves abstention state and reason", () => {
  const redirect = answerCatalogCourseFactRequest(
    detectCatalogCourseFactRequest("What is ZZZ 999?")!,
    catalog,
  );
  assert.equal(redirect.kind, "redirect");
  const logInput = buildPlainTextLogInput(redirect.response, "discovery", {
    responseKind: "catalog_course_redirect",
    responseStatus: "abstained",
    abstained: true,
    abstainReason: "catalog_record_unavailable",
    extraMetadata: { catalogCourseCode: redirect.code },
  });
  assert.equal(logInput.responseStatus, "abstained");
  assert.equal(logInput.abstained, true);
  assert.equal(logInput.abstainReason, "catalog_record_unavailable");
  assert.equal(logInput.responseKind, "catalog_course_redirect");
});

test("access, audition, and priority restrictions are never omitted", () => {
  const cases: Array<[string, RegExp]> = [
    ["SPAN 200", /Not open to fluent Spanish speakers/],
    ["AHS 375", /Priority to senior level students.*open to all UIC students/],
    ["CHEM 190", /Open to all students in a chemistry and biochemistry track.*priority is given to students in the S-STEM program/],
    ["MUS 498", /Open to all students who have been accepted by audition/],
  ];
  for (const [code, expected] of cases) {
    const result = answer(`What restrictions does ${code} have?`);
    assert.equal(result.kind, "answer", code);
    assert.match(result.response, expected, code);
    assert.doesNotMatch(result.response, /No separate registration note is listed|No reliable enrollment clause was classified/, code);
  }
});

test("snapshot access audit surfaces material access language without broad descriptive matches", () => {
  let matched = 0;
  const matchedCodes = new Set<string>();
  for (const record of catalog) {
    if (typeof record.description !== "string") continue;
    const section = extractCatalogCourseInformation(record.description) ?? "";
    const candidates = section.split(/(?<=\.)\s+/).map((sentence) =>
      sentence.replace(/\s+/g, " ").replace(/\s+([.;,:])/g, "$1").trim(),
    ).filter(isAccessRestrictionLikeSentence);
    if (!candidates.length) continue;
    matched += candidates.length;
    matchedCodes.add(`${String(record.subject)} ${String(record.number)}`);
    const parsed = parseCatalogCourseFacts(record);
    assert.ok(parsed, `${String(record.subject)} ${String(record.number)}`);
    const surfaced = [...parsed.registrationRestrictions, ...parsed.otherRestrictionNotes];
    for (const candidate of candidates) {
      const comparable = candidate.replace(/\.$/, "");
      assert.ok(
        surfaced.some((item) => item.replace(/\.$/, "") === comparable),
        `${parsed.code} silently dropped access language: ${candidate}`,
      );
    }
  }
  assert.equal(matched, 7, `expected the reviewed material access inventory, found ${matched}`);
  assert.deepEqual([...matchedCodes].sort(), [
    "AHS 101",
    "AHS 375",
    "AHS 402",
    "CHEM 190",
    "MUS 498",
    "PT 350",
    "SPAN 200",
  ]);
  assert.ok(matched < 25, `access matcher is too broad: ${matched} snapshot sentences`);
  assert.equal(isAccessRestrictionLikeSentence("Open to all students and enrollment does not require an Army commitment."), false);
  assert.equal(isAccessRestrictionLikeSentence("Transfer credit may be accepted on a case-by-case basis."), false);
  assert.equal(isAccessRestrictionLikeSentence("Preference for students in the major."), true);
  assert.equal(isAccessRestrictionLikeSentence("Priority enrollment given to graduating seniors."), true);
});
