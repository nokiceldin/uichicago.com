import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPlanningMajorLookupText,
  buildPlanningStudentContext,
  buildVerifiedStudentContext,
  canonicalizeMajorName,
  formatVerifiedStudentContext,
} from "./verified-student-context.ts";

test("does not infer a year, major, or pre-med track from an incomplete gen-ed statement", () => {
  const context = buildVerifiedStudentContext({
    messages: [{ role: "user", content: "I'm done with all gen eds except Understanding the Natural World" }],
  });

  assert.equal(context.major, undefined);
  assert.equal(context.year, undefined);
  assert.deepEqual(context.preferences, []);
});

test("records explicitly stated facts with message provenance", () => {
  const context = buildVerifiedStudentContext({
    messages: [
      { role: "user", content: "I'm a sophomore CS major and I'm taking CS 211." },
      { role: "assistant", content: "Got it." },
      { role: "user", content: "I prefer a lighter workload." },
    ],
  });

  assert.deepEqual(context.major, { value: "CS", source: "conversation_history" });
  assert.deepEqual(context.year, { value: "sophomore", source: "conversation_history" });
  assert.deepEqual(context.currentCourses, [{ value: "CS 211", source: "conversation_history" }]);
  assert.deepEqual(context.preferences, [
    { value: "I prefer a lighter workload", source: "current_message" },
  ]);
});

test("ignores personal claims made only by the assistant", () => {
  const context = buildVerifiedStudentContext({
    messages: [
      { role: "user", content: "What should I take next?" },
      { role: "assistant", content: "Since you're a senior pre-med student..." },
      { role: "user", content: "Give me two options." },
    ],
  });

  assert.equal(context.major, undefined);
  assert.equal(context.year, undefined);
  assert.deepEqual(context.preferences, []);
});

test("saved profile facts are labeled as saved profile facts", () => {
  const context = buildVerifiedStudentContext({
    messages: [{ role: "user", content: "What should I take next?" }],
    savedProfile: {
      major: "Computer Science",
      year: "junior",
      currentCourses: ["CS 251"],
      completedCourses: ["CS 211"],
      interests: ["AI"],
      honorsStudent: true,
    },
  });

  assert.deepEqual(context.major, { value: "Computer Science", source: "saved_profile" });
  assert.deepEqual(context.year, { value: "junior", source: "saved_profile" });
  assert.match(formatVerifiedStudentContext(context), /CS 211 \[source=saved_profile\]/);
  assert.match(formatVerifiedStudentContext(context), /Honors College student \[source=saved_profile\]/);
});

test("treats pre-med as an explicit track, not an inferred major", () => {
  const context = buildVerifiedStudentContext({
    messages: [{ role: "user", content: "I'm pre-med and I want to become a doctor." }],
  });

  assert.equal(context.major, undefined);
  assert.deepEqual(context.preferences, [
    { value: "pre-med track", source: "current_message" },
  ]);
  assert.deepEqual(context.goals, [
    { value: "I want to become a doctor", source: "current_message" },
  ]);
});

test("scopes mixed course statements and ignores a proposed course", () => {
  const context = buildVerifiedStudentContext({
    messages: [{
      role: "user",
      content: "I've completed CS 111 and I'm taking CS 141. Should I take CS 211 next?",
    }],
  });

  assert.deepEqual(context.completedCourses, [
    { value: "CS 111", source: "current_message" },
  ]);
  assert.deepEqual(context.currentCourses, [
    { value: "CS 141", source: "current_message" },
  ]);
});

test("applies course corrections chronologically", () => {
  const context = buildVerifiedStudentContext({
    messages: [
      { role: "user", content: "I'm taking CS 141 and I've completed CS 111." },
      { role: "assistant", content: "Got it." },
      { role: "user", content: "I dropped CS 141 and I haven't completed CS 111." },
    ],
  });

  assert.deepEqual(context.currentCourses, []);
  assert.deepEqual(context.completedCourses, []);
});

test("removes a previously completed course when the student reports failing it", () => {
  const context = buildVerifiedStudentContext({
    messages: [
      { role: "user", content: "I completed CS 141 and CS 151." },
      { role: "assistant", content: "Got it." },
      { role: "user", content: "Correction: I failed CS 141." },
    ],
  });

  assert.deepEqual(context.completedCourses, [
    { value: "CS 151", source: "conversation_history" },
  ]);
  assert.deepEqual(context.currentCourses, []);
});

test("terminal failure clears current status from profile and conversation history", () => {
  const saved = buildVerifiedStudentContext({
    savedProfile: {
      currentCourses: ["CS 141"],
      completedCourses: ["CS 141"],
    },
    messages: [{ role: "user", content: "I failed CS 141." }],
  });
  assert.deepEqual(saved.currentCourses, []);
  assert.deepEqual(saved.completedCourses, []);

  const conversation = buildVerifiedStudentContext({
    messages: [
      { role: "user", content: "I am taking CS 141." },
      { role: "assistant", content: "Got it." },
      { role: "user", content: "I failed CS 141." },
    ],
  });
  assert.deepEqual(conversation.currentCourses, []);
  assert.deepEqual(conversation.completedCourses, []);
});

test("lets current corrections supersede saved profile course facts", () => {
  const context = buildVerifiedStudentContext({
    savedProfile: {
      currentCourses: ["CS 141"],
      completedCourses: ["CS 111"],
    },
    messages: [{ role: "user", content: "I am no longer taking CS 141. I did not complete CS 111." }],
  });

  assert.deepEqual(context.currentCourses, []);
  assert.deepEqual(context.completedCourses, []);
});

test("uses the latest explicit major and clears a denied saved major", () => {
  const changed = buildVerifiedStudentContext({
    savedProfile: { major: "Computer Science" },
    messages: [
      { role: "user", content: "I'm a CS major." },
      { role: "user", content: "Actually, I switched my major to mathematics." },
    ],
  });
  assert.deepEqual(changed.major, { value: "mathematics", source: "current_message" });

  const denied = buildVerifiedStudentContext({
    savedProfile: { major: "Computer Science" },
    messages: [{ role: "user", content: "I'm not a CS major." }],
  });
  assert.equal(denied.major, undefined);

  const sameMessageRetraction = buildVerifiedStudentContext({
    messages: [{ role: "user", content: "I'm a mathematics major. Actually, I'm not a mathematics major." }],
  });
  assert.equal(sameMessageRetraction.major, undefined);
});

test("builds planning inputs from the same verified facts", () => {
  const verified = buildVerifiedStudentContext({
    savedProfile: {
      major: "Computer Science",
      currentCourses: ["CS 141"],
      completedCourses: ["CS 111"],
      honorsStudent: true,
    },
    messages: [
      { role: "user", content: "I switched my major to mathematics. I dropped CS 141." },
    ],
  });

  assert.deepEqual(buildPlanningStudentContext(verified), {
    major: "mathematics",
    completed_courses: ["CS 111"],
    in_progress_courses: [],
    constraints: ["Honors College student"],
  });
});

test("uses the verified major as the authoritative planning lookup", () => {
  const savedMajor = buildVerifiedStudentContext({
    savedProfile: { major: "Computer Science" },
    messages: [{ role: "user", content: "Make me a plan." }],
  });
  assert.equal(buildPlanningMajorLookupText("Make me a plan.", savedMajor), "Computer Science");

  const correctedMajor = buildVerifiedStudentContext({
    messages: [{
      role: "user",
      content: "I'm not a CS major; I switched my major to mathematics. Make me a plan.",
    }],
  });
  const correctedLookup = buildPlanningMajorLookupText(
    "I'm not a CS major; I switched my major to mathematics. Make me a plan.",
    correctedMajor,
  );
  assert.equal(correctedLookup, "Mathematics");
  assert.doesNotMatch(correctedLookup, /\bCS\b/i);

  const deniedMajor = buildVerifiedStudentContext({
    messages: [{ role: "user", content: "I'm not a CS major. Make me a plan." }],
  });
  assert.equal(buildPlanningMajorLookupText("I'm not a CS major. Make me a plan.", deniedMajor), "");
});

test("excludes contrastively denied courses for each supported conjunction", () => {
  const variants = [
    {
      label: "but not",
      completed: "I have completed CS 111 but not CS 211.",
      current: "I am taking CS 141 but not CS 151.",
    },
    {
      label: ", not",
      completed: "I have completed CS 111, not CS 211.",
      current: "I am taking CS 141, not CS 151.",
    },
    {
      label: "and not",
      completed: "I have completed CS 111 and not CS 211.",
      current: "I am taking CS 141 and not CS 151.",
    },
  ];
  for (const variant of variants) {
    const completed = buildVerifiedStudentContext({
      savedProfile: { completedCourses: ["CS 211"] },
      messages: [{ role: "user", content: variant.completed }],
    });
    assert.deepEqual(completed.completedCourses, [
      { value: "CS 111", source: "current_message" },
    ], `completed-course denial failed for ${variant.label}`);

    const current = buildVerifiedStudentContext({
      savedProfile: { currentCourses: ["CS 151"] },
      messages: [{ role: "user", content: variant.current }],
    });
    assert.deepEqual(current.currentCourses, [
      { value: "CS 141", source: "current_message" },
    ], `current-course denial failed for ${variant.label}`);
  }
});

test("canonicalizes supported major aliases for denials and planning lookup", () => {
  assert.equal(canonicalizeMajorName("CS"), "Computer Science");
  assert.equal(canonicalizeMajorName("computer science"), "Computer Science");
  assert.equal(canonicalizeMajorName("Math"), "Mathematics");
  assert.equal(canonicalizeMajorName("mathematics"), "Mathematics");

  const longSavedShortDenied = buildVerifiedStudentContext({
    savedProfile: { major: "Mathematics" },
    messages: [{ role: "user", content: "I am not a math major." }],
  });
  assert.equal(longSavedShortDenied.major, undefined);
  assert.equal(
    buildPlanningMajorLookupText("I am not a math major.", longSavedShortDenied),
    "",
  );

  const shortSavedLongDenied = buildVerifiedStudentContext({
    savedProfile: { major: "Math" },
    messages: [{ role: "user", content: "I am not a mathematics major." }],
  });
  assert.equal(shortSavedLongDenied.major, undefined);
  assert.equal(
    buildPlanningMajorLookupText("I am not a mathematics major.", shortSavedLongDenied),
    "",
  );
});

test("starts a current-course clause for elided and am taking phrasing", () => {
  const context = buildVerifiedStudentContext({
    messages: [{
      role: "user",
      content: "I have completed CS 111 and am taking CS 141.",
    }],
  });

  assert.deepEqual(context.completedCourses, [
    { value: "CS 111", source: "current_message" },
  ]);
  assert.deepEqual(context.currentCourses, [
    { value: "CS 141", source: "current_message" },
  ]);
});

test("applies elided negative completion verbs as chronological status cues", () => {
  const variants = [
    "I completed CS 111 but did not complete CS 211.",
    "I finished CS 111 and didn't finish CS 211.",
    "I passed CS 111, but did not pass CS 211.",
    "I took CS 111 but didn't take CS 211.",
    "I completed CS 111 but haven't completed CS 211.",
  ];

  for (const content of variants) {
    const context = buildVerifiedStudentContext({
      savedProfile: { completedCourses: ["CS 211"] },
      messages: [{ role: "user", content }],
    });
    assert.deepEqual(context.completedCourses, [
      { value: "CS 111", source: "current_message" },
    ], content);
  }
});

test("applies elided negative current-course verbs as chronological status cues", () => {
  const variants = [
    "I am taking CS 141 but no longer taking CS 151.",
    "I am enrolled in CS 141 and no longer enrolled in CS 151.",
    "I am taking CS 141, but am not taking CS 151.",
  ];

  for (const content of variants) {
    const context = buildVerifiedStudentContext({
      savedProfile: { currentCourses: ["CS 151"] },
      messages: [{ role: "user", content }],
    });
    assert.deepEqual(context.currentCourses, [
      { value: "CS 141", source: "current_message" },
    ], content);
  }
});

test("supports past-tense never completion denials without removing unrelated facts", () => {
  const contrastive = buildVerifiedStudentContext({
    savedProfile: { completedCourses: ["CS 211", "CS 251"] },
    messages: [{
      role: "user",
      content: "I passed CS 111 but never passed CS 211.",
    }],
  });
  assert.deepEqual(contrastive.completedCourses, [
    { value: "CS 251", source: "saved_profile" },
    { value: "CS 111", source: "current_message" },
  ]);

  const standalone = buildVerifiedStudentContext({
    savedProfile: { completedCourses: ["CS 211", "CS 251"] },
    messages: [{ role: "user", content: "I never passed CS 211." }],
  });
  assert.deepEqual(standalone.completedCourses, [
    { value: "CS 251", source: "saved_profile" },
  ]);
});

test("supports representative never completed, finished, and taken forms", () => {
  const variants = [
    "I completed CS 111 but never completed CS 211.",
    "I finished CS 111 and never finished CS 211.",
    "I took CS 111, but never taken CS 211.",
  ];

  for (const content of variants) {
    const context = buildVerifiedStudentContext({
      savedProfile: { completedCourses: ["CS 211", "CS 251"] },
      messages: [{ role: "user", content }],
    });
    assert.deepEqual(context.completedCourses, [
      { value: "CS 251", source: "saved_profile" },
      { value: "CS 111", source: "current_message" },
    ], content);
  }
});

test("supports full and contracted have-never completion denials", () => {
  const participles = ["completed", "finished", "passed", "taken"];
  const auxiliaries = ["I have never", "I've never"];

  for (const auxiliary of auxiliaries) {
    for (const participle of participles) {
      const content = `${auxiliary} ${participle} CS 211.`;
      const context = buildVerifiedStudentContext({
        savedProfile: { completedCourses: ["CS 211", "CS 251"] },
        messages: [
          { role: "user", content: "I completed CS 111." },
          { role: "user", content },
        ],
      });
      assert.deepEqual(context.completedCourses, [
        { value: "CS 251", source: "saved_profile" },
        { value: "CS 111", source: "conversation_history" },
      ], content);
    }
  }
});

test("keeps haven't completion denials in the same cue grammar", () => {
  const context = buildVerifiedStudentContext({
    savedProfile: { completedCourses: ["CS 211", "CS 251"] },
    messages: [
      { role: "user", content: "I completed CS 111." },
      { role: "user", content: "I haven't completed CS 211." },
    ],
  });

  assert.deepEqual(context.completedCourses, [
    { value: "CS 251", source: "saved_profile" },
    { value: "CS 111", source: "conversation_history" },
  ]);
});
