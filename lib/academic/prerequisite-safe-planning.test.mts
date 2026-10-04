import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPrerequisiteSafeNextTermPlan,
  decidePrerequisiteSafeNextTermRoute,
  hasPriorPersonalizedPlanningContext,
  renderPrerequisiteSafeNextTermPlan,
  shouldScheduleMajorPlanRetrieval,
} from "./prerequisite-safe-planning.ts";
import { buildVerifiedStudentContext } from "../chat/verified-student-context.ts";

const descriptions = new Map<string, string | null>([
  ["CS 141", "Prerequisite(s): Grade of C or better in CS 111; and Credit or concurrent registration in MATH 180."],
  ["CS 151", "Prerequisite(s): Grade of C or better in CS 111; and Credit or concurrent registration in MATH 180."],
  ["CS 211", "Prerequisite(s): Grade of C or better in CS 141."],
  ["CS 251", "Prerequisite (s): Grade of C or better in CS 141; and Grade of C or better in CS 151; and Credit or concurrent registration in CS 211."],
  ["CS 261", "Prerequisite(s): Grade of C or better in CS 141; and Credit or concurrent registration in CS 211."],
  ["CS 301", "Prerequisite(s): Grade of C or better in CS 151; and Credit or concurrent registration in CS 251."],
]);

const semesters = [
  { label: "Freshman First Semester", courses: [
    { code: "CS 111", title: "Program Design I" },
    { code: "MATH 180", title: "Calculus I" },
  ] },
  { label: "Freshman Second Semester", courses: [
    { code: "CS 141", title: "Program Design II" },
    { code: "CS 151", title: "Mathematical Foundations" },
  ] },
  { label: "Sophomore First Semester", courses: [
    { code: "CS 211", title: "Programming Practicum" },
    { code: "CS 251", title: "Data Structures" },
  ] },
  { label: "Sophomore Second Semester", courses: [
    { code: "CS 261", title: "Machine Organization" },
    { code: "CS 301", title: "Languages and Automata" },
  ] },
];

test("does not jump from introductory courses to CS 261 or CS 301", () => {
  const plan = buildPrerequisiteSafeNextTermPlan({
    semesters,
    catalogDescriptions: descriptions,
    record: { completed: [{ code: "CS 111" }, { code: "MATH 180" }] },
  });
  assert.ok(plan);
  assert.equal(plan.semesterLabel, "Freshman Second Semester");
  assert.deepEqual([...plan.eligible, ...plan.review, ...plan.blocked].map((course) => course.code), ["CS 141", "CS 151"]);
  assert.deepEqual(plan.review.map((course) => course.code), ["CS 141", "CS 151"]);
  assert.match(renderPrerequisiteSafeNextTermPlan(plan, "Computer Science"), /conditional, not confirmed eligibility/i);
});

test("unknown minimum grades require verification while reviewed grades can satisfy them", () => {
  const unknown = buildPrerequisiteSafeNextTermPlan({
    semesters,
    catalogDescriptions: descriptions,
    record: { completed: [{ code: "CS 111" }, { code: "MATH 180" }] },
  });
  assert.deepEqual(unknown?.review.map((course) => course.code), ["CS 141", "CS 151"]);

  const reviewed = buildPrerequisiteSafeNextTermPlan({
    semesters,
    catalogDescriptions: descriptions,
    record: { completed: [{ code: "CS 111", grade: "B" }, { code: "MATH 180", grade: "A" }] },
  });
  assert.deepEqual(reviewed?.eligible.map((course) => course.code), ["CS 141", "CS 151"]);
});

test("current courses satisfy concurrent clauses only", () => {
  const concurrentPlan = buildPrerequisiteSafeNextTermPlan({
    semesters,
    catalogDescriptions: descriptions,
    record: {
      completed: [{ code: "CS 141", grade: "A" }, { code: "CS 151", grade: "B" }],
      inProgress: ["CS 211"],
    },
  });
  assert.ok(concurrentPlan);
  assert.equal(concurrentPlan.semesterLabel, "Sophomore Second Semester");
  assert.deepEqual(concurrentPlan.eligible.map((course) => course.code), ["CS 261"]);
  assert.deepEqual(concurrentPlan.blocked.map((course) => course.code), ["CS 301"]);

  const ordinaryPrerequisitePlan = buildPrerequisiteSafeNextTermPlan({
    semesters,
    catalogDescriptions: descriptions,
    record: {
      completed: [{ code: "CS 111", grade: "A" }, { code: "MATH 180", grade: "A" }],
      inProgress: ["CS 141"],
    },
  });
  assert.deepEqual(ordinaryPrerequisitePlan?.blocked.map((course) => course.code), ["CS 211", "CS 251"]);
});

test("unavailable or unsupported catalog language stays in review", () => {
  const unsupported = new Map(descriptions);
  unsupported.set("CS 141", "Prerequisite(s): Completion of the introductory core as approved by the department.");
  unsupported.delete("CS 151");
  const plan = buildPrerequisiteSafeNextTermPlan({
    semesters,
    catalogDescriptions: unsupported,
    record: { completed: [{ code: "CS 111", grade: "A" }, { code: "MATH 180", grade: "A" }] },
  });
  assert.deepEqual(plan?.review.map((course) => course.code), ["CS 141", "CS 151"]);
  const rendered = renderPrerequisiteSafeNextTermPlan(plan!, "Computer Science");
  assert.match(rendered, /official UIC catalog/i);
  assert.doesNotMatch(rendered, /Eligible from the verified record[\s\S]*CS 141/i);
});

for (const unavailableDescription of [null, "", "   "]) {
  test(`null or blank catalog description requires verification: ${JSON.stringify(unavailableDescription)}`, () => {
    const unavailable = new Map(descriptions);
    unavailable.set("CS 141", unavailableDescription);
    const plan = buildPrerequisiteSafeNextTermPlan({
      semesters,
      catalogDescriptions: unavailable,
      record: { completed: [{ code: "CS 111", grade: "A" }, { code: "MATH 180", grade: "A" }] },
    });
    assert.equal(plan?.review.some((course) => course.code === "CS 141"), true);
    assert.equal(plan?.eligible.some((course) => course.code === "CS 141"), false);
  });
}

test("a real catalog description with no prerequisite section remains eligible", () => {
  const noPrerequisite = new Map(descriptions);
  noPrerequisite.set("CS 141", "Introduces programming concepts. Course Information: 3 hours. There are no course prerequisites.");
  const plan = buildPrerequisiteSafeNextTermPlan({
    semesters,
    catalogDescriptions: noPrerequisite,
    record: { completed: [{ code: "CS 111", grade: "A" }, { code: "MATH 180", grade: "A" }] },
  });
  assert.equal(plan?.eligible.some((course) => course.code === "CS 141"), true);
});

function dependencyPlan(catalogDescriptions: Map<string, string | null>) {
  return buildPrerequisiteSafeNextTermPlan({
    semesters: [
      { label: "Term 1", courses: [{ code: "BASE 100", title: "Foundation" }] },
      { label: "Term 2", courses: [
        { code: "DEPN 300", title: "Dependent" },
        { code: "PROV 200", title: "Provider" },
      ] },
    ],
    catalogDescriptions,
    record: { completed: [{ code: "BASE 100", grade: "A" }] },
  });
}

test("an eligible same-term provider can satisfy an explicit concurrent rule", () => {
  const plan = dependencyPlan(new Map([
    ["DEPN 300", "Prerequisite(s): Credit or concurrent registration in PROV 200."],
    ["PROV 200", "A foundational provider course. There are no course prerequisites."],
  ]));
  assert.deepEqual(plan?.eligible.map((course) => course.code), ["DEPN 300", "PROV 200"]);
});

test("blocked and review-status providers cannot unlock a dependent course", () => {
  const blocked = dependencyPlan(new Map([
    ["DEPN 300", "Prerequisite(s): Credit or concurrent registration in PROV 200."],
    ["PROV 200", "Prerequisite(s): MATH 999."],
  ]));
  assert.deepEqual(blocked?.eligible, []);
  assert.deepEqual(blocked?.blocked.map((course) => course.code), ["DEPN 300", "PROV 200"]);

  const review = dependencyPlan(new Map([
    ["DEPN 300", "Prerequisite(s): Credit or concurrent registration in PROV 200."],
    ["PROV 200", "Prerequisite(s): BASE 100 and a minimum 2.50 GPA."],
  ]));
  assert.deepEqual(review?.eligible, []);
  assert.deepEqual(review?.review.map((course) => course.code), ["DEPN 300", "PROV 200"]);
  assert.deepEqual(review?.blocked, []);
});

test("a same-term prerequisite cycle cannot make either course eligible", () => {
  const plan = dependencyPlan(new Map([
    ["DEPN 300", "Prerequisite(s): Credit or concurrent registration in PROV 200."],
    ["PROV 200", "Prerequisite(s): Credit or concurrent registration in DEPN 300."],
  ]));
  assert.deepEqual(plan?.eligible, []);
  assert.deepEqual(plan?.review.map((course) => course.code), ["DEPN 300", "PROV 200"]);
  assert.deepEqual(plan?.blocked, []);
});

test("off-template verified progress returns a fail-closed clarification", () => {
  const plan = buildPrerequisiteSafeNextTermPlan({
    semesters,
    catalogDescriptions: descriptions,
    record: { completed: [{ code: "CHEM 101", grade: "A" }] },
  });
  assert.ok(plan?.clarification);
  assert.deepEqual(plan?.eligible, []);
  const rendered = renderPrerequisiteSafeNextTermPlan(plan!, "Computer Science");
  assert.match(rendered, /could not match the courses/i);
  assert.match(rendered, /will not infer completed prerequisites/i);
  assert.doesNotMatch(rendered, /typical .* plan/i);
});

for (const correction of [
  "Correction: I have not taken CS 141 or CS 151. What should I take next semester?",
  "Correction: I failed CS 141. What should I take next semester?",
]) {
  test(`course correction revises the next-term plan: ${correction}`, () => {
    const context = buildVerifiedStudentContext({
      messages: [
        { role: "user", content: "I'm a CS major. I completed CS 111, MATH 180, CS 141, and CS 151. What should I take next semester?" },
        { role: "assistant", content: "Here is a plan." },
        { role: "user", content: correction },
      ],
    });
    const plan = buildPrerequisiteSafeNextTermPlan({
      semesters,
      catalogDescriptions: descriptions,
      record: {
        completed: context.completedCourses.map((fact) => ({ code: fact.value })),
        inProgress: context.currentCourses.map((fact) => fact.value),
      },
    });
    assert.ok(plan);
    assert.equal(plan.eligible.some((course) => ["CS 261", "CS 301"].includes(course.code)), false);
    assert.notEqual(plan.semesterLabel, "Sophomore Second Semester");
  });
}

test("failed-course correction clears current and completed facts before planning", () => {
  for (const input of [
    {
      savedProfile: { currentCourses: ["CS 141"], completedCourses: ["CS 141"] },
      messages: [{ role: "user", content: "I failed CS 141. What should I take next semester?" }],
    },
    {
      messages: [
        { role: "user", content: "I am taking CS 141 and I completed CS 111." },
        { role: "assistant", content: "Got it." },
        { role: "user", content: "I failed CS 141. What should I take next semester?" },
      ],
    },
  ]) {
    const context = buildVerifiedStudentContext(input);
    assert.equal(context.currentCourses.some((fact) => fact.value === "CS 141"), false);
    assert.equal(context.completedCourses.some((fact) => fact.value === "CS 141"), false);
    const plan = buildPrerequisiteSafeNextTermPlan({
      semesters,
      catalogDescriptions: descriptions,
      record: {
        completed: context.completedCourses.map((fact) => ({ code: fact.value })),
        inProgress: context.currentCourses.map((fact) => fact.value),
      },
    });
    assert.equal(plan?.eligible.some((course) => ["CS 211", "CS 251", "CS 261", "CS 301"].includes(course.code)), false);
  }
});

test("route gating keeps a terminal failure correction on the deterministic safe path", () => {
  for (const input of [
    {
      savedProfile: { currentCourses: ["CS 141"] },
      messages: [{ role: "user", content: "I failed CS 141. What should I take next semester?" }],
    },
    {
      messages: [
        { role: "user", content: "I am taking CS 141." },
        { role: "assistant", content: "Got it." },
        { role: "user", content: "I failed CS 141. What should I take next semester?" },
      ],
    },
  ]) {
    const context = buildVerifiedStudentContext(input);
    const rawQuery = input.messages.at(-1)!.content;
    const routeDecision = decidePrerequisiteSafeNextTermRoute({
      isPersonalScheduleRequest: true,
      hasVerifiedMajor: true,
      hasVerifiedCourseHistory: context.completedCourses.length > 0 || context.currentCourses.length > 0,
      hasPriorPlanningContext: false,
      rawQuery,
    });
    assert.equal(routeDecision, "safe_planner");
    assert.notEqual(routeDecision, "missing_history_clarification");
    const plan = buildPrerequisiteSafeNextTermPlan({
      semesters,
      catalogDescriptions: descriptions,
      record: {
        completed: context.completedCourses.map((fact) => ({ code: fact.value })),
        inProgress: context.currentCourses.map((fact) => fact.value),
      },
    });
    const routeText = `=== DETERMINISTIC NEXT TERM ===\n${renderPrerequisiteSafeNextTermPlan(plan!, "Computer Science")}`;
    assert.match(routeText, /^=== DETERMINISTIC NEXT TERM ===/);
    assert.match(routeText, /could not match the courses|could not find a sample schedule/i);
    assert.doesNotMatch(routeText, /=== DETERMINISTIC PLAN ===|typical computer science plan/i);
  }
});

test("route gating preserves ordinary missing-history handling", () => {
  assert.equal(decidePrerequisiteSafeNextTermRoute({
    isPersonalScheduleRequest: true,
    hasVerifiedMajor: true,
    hasVerifiedCourseHistory: false,
    hasPriorPlanningContext: false,
    rawQuery: "What should I take next semester?",
  }), "missing_history_clarification");
});

test("ordered route decision uses the same planning-window aliases for early and retrieval gates", () => {
  const aliases = [
    "What should I take next semester?",
    "What should I take next term?",
    "What should I take coming semester?",
    "What should I take coming term?",
    "Plan for my next year.",
    "What classes do I have left?",
    "Plan for my remaining courses.",
    "Help me graduate quickly.",
  ];
  for (const rawQuery of aliases) {
    assert.equal(decidePrerequisiteSafeNextTermRoute({
      isPersonalScheduleRequest: true,
      hasVerifiedMajor: true,
      hasVerifiedCourseHistory: false,
      hasPriorPlanningContext: false,
      rawQuery,
    }), "missing_history_clarification", rawQuery);
    assert.equal(decidePrerequisiteSafeNextTermRoute({
      isPersonalScheduleRequest: true,
      hasVerifiedMajor: true,
      hasVerifiedCourseHistory: true,
      hasPriorPlanningContext: false,
      rawQuery,
    }), "safe_planner", rawQuery);
  }
});

test("ordered route decision ignores unrelated uses of planning-window words", () => {
  const controls = [
    { isPersonalScheduleRequest: false, rawQuery: "When does next semester start?" },
    { isPersonalScheduleRequest: false, rawQuery: "What events are coming this term?" },
    { isPersonalScheduleRequest: true, rawQuery: "Make me a plan." },
  ];
  for (const control of controls) {
    assert.equal(decidePrerequisiteSafeNextTermRoute({
      ...control,
      hasVerifiedMajor: true,
      hasVerifiedCourseHistory: false,
      hasPriorPlanningContext: false,
    }), "continue", control.rawQuery);
  }
});

test("exact live turn-two corrections continue the prior personalized planning flow", () => {
  const scenarios = [
    [
      "I'm a sophomore Computer Science major. I completed CS 111 and MATH 180. Build me a realistic schedule for next semester.",
      "Correction: I have not taken CS 141 or CS 151. Please revise the schedule and check every prerequisite.",
    ],
    [
      "I completed CS 111, CS 141, and CS 151, and I am taking CS 211 now. Which CS courses can I take next semester?",
      "I need to correct that: I failed CS 141, so it is not completed. Revise your recommendations.",
    ],
  ];

  for (const [firstTurn, correction] of scenarios) {
    const messages = [
      { role: "user", content: firstTurn },
      { role: "assistant", content: "Here is a plan." },
      { role: "user", content: correction },
    ];
    const context = buildVerifiedStudentContext({ messages });
    const hasPriorPlanningContext = hasPriorPersonalizedPlanningContext(messages.slice(0, -1));
    assert.equal(hasPriorPlanningContext, true);
    const routeDecision = decidePrerequisiteSafeNextTermRoute({
      isPersonalScheduleRequest:
        /\b(?:schedule|what should i take|what classes (?:do )?i have left|what should i register for|make me a plan|plan for (?:my )?(?:next|remaining)|graduate quickly)\b/i.test(correction),
      hasVerifiedMajor: Boolean(context.major),
      hasVerifiedCourseHistory: context.completedCourses.length > 0 || context.currentCourses.length > 0,
      hasPriorPlanningContext,
      rawQuery: correction,
    });
    assert.equal(routeDecision, "safe_planner");
    assert.equal(shouldScheduleMajorPlanRetrieval({
      majorPlanConfidence: 0,
      answerMode: "discovery",
      prerequisiteSafeRouteDecision: routeDecision,
    }), true);

    const plan = buildPrerequisiteSafeNextTermPlan({
      semesters,
      catalogDescriptions: descriptions,
      record: {
        completed: context.completedCourses.map((fact) => ({ code: fact.value })),
        inProgress: context.currentCourses.map((fact) => fact.value),
      },
    });
    const routeText = `=== DETERMINISTIC NEXT TERM ===\n${renderPrerequisiteSafeNextTermPlan(plan!, "Computer Science")}`;
    assert.match(routeText, /^=== DETERMINISTIC NEXT TERM ===/);
    assert.doesNotMatch(routeText, /=== DETERMINISTIC PLAN ===|typical computer science plan/i);
  }
});

test("unrelated revision language does not continue a planning flow", () => {
  const routeDecision = decidePrerequisiteSafeNextTermRoute({
    isPersonalScheduleRequest: false,
    hasVerifiedMajor: true,
    hasVerifiedCourseHistory: true,
    hasPriorPlanningContext: true,
    rawQuery: "Revise this answer to be shorter.",
  });
  assert.equal(routeDecision, "continue");
  assert.equal(shouldScheduleMajorPlanRetrieval({
    majorPlanConfidence: 0,
    answerMode: "discovery",
    prerequisiteSafeRouteDecision: routeDecision,
  }), false);
});

test("major plan retrieval is scheduled once for each independent reason", () => {
  const cases = [
    {
      majorPlanConfidence: 0,
      answerMode: "discovery",
      prerequisiteSafeRouteDecision: "safe_planner" as const,
    },
    {
      majorPlanConfidence: 0.9,
      answerMode: "discovery",
      prerequisiteSafeRouteDecision: "continue" as const,
    },
    {
      majorPlanConfidence: 0,
      answerMode: "planning",
      prerequisiteSafeRouteDecision: "continue" as const,
    },
  ];

  for (const input of cases) {
    const scheduledRetrievals = Number(shouldScheduleMajorPlanRetrieval(input));
    assert.equal(scheduledRetrievals, 1);
  }
});
