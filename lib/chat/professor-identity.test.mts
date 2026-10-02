import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseProfessorNameHint,
  buildProfessorNamePrefixes,
  extractProfessorNameHint,
  formatProfessorClarification,
  normalizeProfessorIdentityName,
  resolveProfessorCourseMapKey,
  resolveProfessorIdentity,
  resolveProfessorIdentityFromLookup,
  shouldClarifyProfessorLookup,
  trimProfessorNamePredicate,
} from "./professor-identity.ts";

const professors = [
  { name: "William O'Brien", department: "Finance", slug: "william-obrien", rmpRatingsCount: 80 },
  { name: "William Rauscher", department: "Economics", slug: "william-rauscher", rmpRatingsCount: 113 },
  { name: "Adam Koehler", department: "Computer Science", slug: "adam-koehler", rmpRatingsCount: 10 },
  { name: "Anne-Marie Smith", department: "English", slug: "anne-marie-smith", rmpRatingsCount: 5 },
  { name: "Jane Smith", department: "Mathematics", slug: "jane-smith", rmpRatingsCount: 99 },
];

test("extracts plausible named phrases while possessives provide a hard boundary", () => {
  const cases: Array<[string, string]> = [
    ["Tell me about Professor William O'Brien's rating and courses", "William O'Brien"],
    ["How is Prof. Anne-Marie Smith's class?", "Anne-Marie Smith"],
    ["How is O'Brien's class?", "O'Brien"],
    ["What is Professor William O'Brien like?", "William O'Brien like"],
    ["Is Professor William O'Brien Worth Taking?", "William O'Brien Worth Taking"],
    ["Would you recommend Professor William O'Brien?", "William O'Brien"],
    ["Does Professor William O'Brien teach FIN 300?", "William O'Brien teach FIN"],
    ["What are Professor William O'Brien's ratings?", "William O'Brien"],
    ["Tell me about professor william o'brien's courses", "william o'brien"],
    ["what is professor william o'brien like?", "william o'brien like"],
    ["is prof. anne-marie smith worth taking?", "anne-marie smith worth taking"],
    ["what is professor will smith like?", "will smith like"],
    ["What about Professor Fair?", "Fair"],
  ];
  for (const [message, expected] of cases) {
    assert.equal(extractProfessorNameHint(message), expected, message);
  }
});

test("does not invent a named professor hint for course ranking questions", () => {
  const messages = [
    "Which professor is best for CS 211?",
    "Which professor should I take for CS 251?",
    "Which professor gives the best grades in CS?",
    "Which professor gives easy As?",
    "What professor teaches CS 141?",
    "Which professor has the highest rating?",
    "which professor grades the easiest?",
    "Which professor will give me an A?",
    "Which professor may teach CS 141?",
    "Which professor to take for CS 251?",
    "Which professor to choose for MATH 180?",
    "Which professor to avoid in CS?",
    "Which professor to pick for FIN 300?",
    "Which professor to prefer for CHEM 101?",
    "Which professor not to take for CS 251?",
    "Which professor ought I take for CS 251?",
    "What instructor ought I choose for MATH 180?",
    "Who teacher should I avoid?",
  ];
  for (const message of messages) assert.equal(extractProfessorNameHint(message), null, message);

  const classifierPhrases = [
    "is best", "should I take", "gives the best grades", "gives easy As",
    "teaches CS 141", "has the highest rating", "grades the easiest",
    "to take for CS 251", "to choose for MATH 180", "to avoid in CS",
    "to pick for FIN 300", "to prefer for CHEM 101",
  ];
  for (const phrase of classifierPhrases) assert.equal(chooseProfessorNameHint(phrase, null), null, phrase);

  assert.equal(
    chooseProfessorNameHint("Ought I Take", null, "Which professor ought I take for CS 251?"),
    null,
  );
  assert.equal(
    chooseProfessorNameHint("Not To Take", "not to take", "Which professor not to take for CS 251?"),
    null,
  );
});

test("generic interrogative suppression preserves named question forms", () => {
  const genericCases = [
    "Can you tell me which professor is best for CS 211?",
    "I want to know which professor I should take for CS 251.",
    "Could you explain which CS professor gives the best grades?",
    "I am deciding what MATH instructor to choose.",
    "Please tell me who computer science professor teaches CS 141.",
    "Which finance teacher should I pick?",
    "Which electrical and computer engineering professor should I take?",
    "Can you tell me which information and decision sciences professor is best?",
    "I want to know which highly rated professor teaches CS 211.",
    "Which professor currently gives the best grades?",
    "Which professor overall is best for CS 211?",
    "Which professor generally teaches CS 251?",
    "Which professor actually has the highest rating?",
    "Which professor usually gives easy As?",
    "Can you tell me which professor often teaches MATH 180?",
    "I want to know which professor now teaches FIN 300.",
  ];
  for (const message of genericCases) {
    assert.equal(extractProfessorNameHint(message), null, message);
    assert.equal(chooseProfessorNameHint("Jane Doe", "Jane Doe", message), null, message);
  }

  const classifierOverrideCases = [
    "Which electrical and computer engineering professor should I take?",
    "Which information and decision sciences professor is best?",
    "Which highly rated professor teaches CS 211?",
  ];
  for (const message of classifierOverrideCases) {
    assert.equal(chooseProfessorNameHint("Electrical And Computer Engineering", null, message), null, message);
  }

  const namedCases: Array<[string, string]> = [
    ["What is Professor William O'Brien like?", "William O'Brien like"],
    ["Who is Professor William O'Brien?", "William O'Brien"],
    ["How is O'Brien's class?", "O'Brien"],
    ["Can you tell me what you know about Professor William O'Brien?", "William O'Brien"],
    ["Please explain who Professor William O'Brien is", "William O'Brien is"],
    ["Tell me what Professor William O'Brien teaches", "William O'Brien teaches"],
    ["Which courses does Professor William O'Brien teach?", "William O'Brien teach"],
    ["Which class is Professor William O'Brien teaching?", "William O'Brien teaching"],
    ["Which department is Professor William O'Brien in?", "William O'Brien in"],
    ["Which class is Professor Will Smith teaching?", "Will Smith teaching"],
    ["Which department is Professor May Lee in?", "May Lee in"],
    ["Which class is Professor Kelly Smith teaching?", "Kelly Smith teaching"],
    ["Which class is Professor Sally Blechschmidt teaching?", "Sally Blechschmidt teaching"],
    ["What is Professor Sally Pissetzky like?", "Sally Pissetzky like"],
    ["Which department is Professor Kimberly Warner in?", "Kimberly Warner in"],
  ];
  for (const [message, expected] of namedCases) {
    assert.equal(extractProfessorNameHint(message), expected, message);
    assert.equal(chooseProfessorNameHint(expected, null, message), expected, message);
  }
});

test("retrieval clarification yields to clear generic ranking flow", () => {
  const genericCases: Array<[string, string]> = [
    ["Can you tell me which professor currently gives the best grades?", "currently"],
    ["Best professor currently teaching CS 211?", "currently"],
    ["Top professor overall for MATH 180?", "overall"],
    ["Best professor available for CS 211?", "available"],
    ["Best professor recommended for CS 211?", "recommended"],
    ["Best professor recently teaching CS 211?", "recently"],
    ["Best professor regularly teaching CS 211?", "regularly"],
    ["Best professor previously teaching CS 211?", "previously"],
    ["Best Professor Available for CS 211?", "Available"],
    ["TOP PROFESSOR RECOMMENDED FOR CS 211?", "RECOMMENDED"],
    ["Which Professor Recently Taught CS 211?", "Recently"],
    ["which professor REGULARLY teaches CS 211?", "REGULARLY"],
    ["Worst Professor Available for CS 211?", "Available"],
    ["easiest professor recently teaching CS 211?", "recently"],
    ["HARDEST PROFESSOR RECOMMENDED FOR CS 211?", "RECOMMENDED"],
    ["Easy Professor Available for CS 211?", "Available"],
    ["hard professor recently teaching CS 211?", "recently"],
    ["Toughest Professor Offered for CS 211?", "Offered"],
    ["Most difficult professor currently teaching CS 211?", "currently"],
    ["Highest GPA Professor Available for CS 211?", "Available"],
    ["lowest gpa professor regularly teaching CS 211?", "regularly"],
    ["Best Dr. Available for CS 211?", "Available"],
  ];
  for (const [generic, hint] of genericCases) {
    assert.equal(shouldClarifyProfessorLookup("none", true, generic, hint), false, generic);
    assert.equal(shouldClarifyProfessorLookup("none", false, generic), true, generic);
  }

  const namedCases: Array<[string, string | null]> = [
    ["What is Professor William O'Brien like?", "William O'Brien"],
    ["Is Professor Missing Person the best for CS 211?", "Missing Person"],
    ["Rank Professor William O'Brien against the other FIN professors.", "William O'Brien"],
    ["How is O'Brien's class?", null],
    ["is professor smyth the best for cs 211?", "smyth"],
    ["HOW IS PROFESSOR SMYTH?", "SMYTH"],
    ["tell me about professor smyth", "smyth"],
    ["who is professor smyth?", "smyth"],
    ["what is professor smyth like?", "smyth"],
    ["is professor smyth the worst for cs 211?", "smyth"],
    ["IS PROFESSOR SMYTH THE EASIEST FOR CS 211?", "SMYTH"],
    ["is professor smyth the hardest for cs 211?", "smyth"],
    ["compare professor smyth with the CS faculty", "smyth"],
    ["would you recommend professor smyth for CS 211?", "smyth"],
    ["Is Dr. Missing the best for CS 211?", "Missing"],
    ["Rank Dr. Missing among CS professors", "Missing"],
    ["Compare Dr. Missing with the CS faculty", "Missing"],
    ["Would you recommend Dr. Missing for CS 211?", "Missing"],
  ];
  for (const [named, hint] of namedCases) {
    assert.equal(shouldClarifyProfessorLookup("none", true, named, hint), true, named);
    assert.equal(shouldClarifyProfessorLookup("ambiguous", true, named, hint), true, named);
  }

  assert.equal(
    shouldClarifyProfessorLookup("none", true, "What about Professor Missing Person?", "missing person"),
    true,
  );
  assert.equal(
    shouldClarifyProfessorLookup("none", true, "Is Professor Missing the best?", "Missing"),
    true,
  );
  assert.equal(
    shouldClarifyProfessorLookup("none", true, "Is professor missing the best?", "missing"),
    true,
  );
  assert.equal(
    shouldClarifyProfessorLookup("ambiguous", true, "Is professor smith the best?", "smith"),
    true,
  );

  const nameBeforeRoleCases: Array<[string, string, "none" | "ambiguous"]> = [
    ["Is Smith the best professor for CS 211?", "Smith", "ambiguous"],
    ["Rank Smith among CS professors", "Smith", "ambiguous"],
    ["Is William Missing the best professor for CS 211?", "William Missing", "none"],
  ];
  for (const [message, hint, status] of nameBeforeRoleCases) {
    assert.equal(shouldClarifyProfessorLookup(status, true, message, hint), true, message);
  }
  assert.equal(shouldClarifyProfessorLookup("match", true, genericCases[0][0]), false);
  assert.equal(shouldClarifyProfessorLookup("match", true, "Is Smith the best professor?", "Smith"), false);
  assert.equal(shouldClarifyProfessorLookup("match", true, "Is Dr. Missing the best?", "Missing"), false);
  assert.equal(shouldClarifyProfessorLookup("ambiguous", true, "Best Dr. available?", "available"), true);
});

test("exact full name wins regardless of review count", () => {
  const result = resolveProfessorIdentity("William O'Brien", professors);
  assert.equal(result.status, "match");
  if (result.status === "match") assert.equal(result.candidate.slug, "william-obrien");
});

test("an unrelated partial candidate is never substituted", () => {
  assert.deepEqual(resolveProfessorIdentity("William Missing", professors), { status: "none" });
});

test("unique surname and known first-name alias resolve", () => {
  const surname = resolveProfessorIdentity("O'Brien", professors);
  assert.equal(surname.status, "match");
  if (surname.status === "match") assert.equal(surname.candidate.slug, "william-obrien");

  const alias = resolveProfessorIdentity("Bill O'Brien", professors);
  assert.equal(alias.status, "match");
  if (alias.status === "match") assert.equal(alias.candidate.slug, "william-obrien");
});

test("first names and shared surnames require clarification", () => {
  const firstName = resolveProfessorIdentity("William", professors);
  assert.equal(firstName.status, "ambiguous");
  if (firstName.status === "ambiguous") assert.deepEqual(firstName.candidates.map((item) => item.slug), ["william-obrien", "william-rauscher"]);

  const surname = resolveProfessorIdentity("Smith", professors);
  assert.equal(surname.status, "ambiguous");
  if (surname.status === "ambiguous") {
    assert.match(formatProfessorClarification("Smith", surname.candidates), /Anne-Marie Smith \(English\)/);
    assert.match(formatProfessorClarification("Smith", surname.candidates), /Jane Smith \(Mathematics\)/);
  }
});

test("middle-name course-map names associate only when unambiguous", () => {
  assert.equal(
    resolveProfessorCourseMapKey("Adam Koehler", ["Koehler, Adam Thomas", "O'Brien, William"]),
    "Koehler, Adam Thomas",
  );
  assert.equal(
    resolveProfessorCourseMapKey("Adam Koehler", ["Koehler, Adam Thomas", "Koehler, Adam James"]),
    null,
  );
  assert.equal(
    resolveProfessorCourseMapKey("William O'Brien", ["O'Brien, William John"]),
    "O'Brien, William John",
  );
});

test("a richer parsed name wins over a lossy classifier hint", () => {
  assert.equal(chooseProfessorNameHint("William", "William O'Brien"), "William O'Brien");
  assert.equal(chooseProfessorNameHint("William O'Brien Worth Taking", "William O'Brien"), "William O'Brien Worth Taking");
  assert.equal(chooseProfessorNameHint("william o'brien like", "william o'brien"), "william o'brien like");
});

test("builds longest-to-shortest prefixes and a grammar fallback", () => {
  assert.deepEqual(buildProfessorNamePrefixes("William O'Brien Worth Taking"), [
    "William O'Brien Worth Taking",
    "William O'Brien Worth",
    "William O'Brien",
    "William",
  ]);
  assert.equal(trimProfessorNamePredicate("Bill O'Brien worth taking"), "Bill O'Brien");
  assert.equal(trimProfessorNamePredicate("renata a tarasievich like"), "renata a tarasievich");
  assert.equal(trimProfessorNamePredicate("gives the best grades"), null);
});

test("data-aware prefix resolution keeps names that overlap predicate words", async () => {
  const directory = [
    ...professors,
    { name: "Freda Fair", department: "Design", slug: "freda-fair" },
    { name: "Renata A Tarasievich", department: "Management", slug: "renata-tarasievich" },
    { name: "Will Smith", department: "English", slug: "will-smith" },
    { name: "May Lee", department: "Biology", slug: "may-lee" },
  ];
  const lookup = {
    findExact: async (prefixes: Array<{ normalized: string }>) => directory.filter((candidate) =>
      prefixes.some((prefix) => prefix.normalized === normalizeProfessorIdentityName(candidate.name))
    ),
    findCandidates: async (parts: string[]) => directory.filter((candidate) =>
      parts.some((part) => candidate.name.toLowerCase().includes(part.toLowerCase()))
    ),
  };
  const cases: Array<[string, string]> = [
    ["William O'Brien Worth Taking", "william-obrien"],
    ["Anne-Marie Smith Teach CS 141", "anne-marie-smith"],
    ["freda fair like", "freda-fair"],
    ["Fair", "freda-fair"],
    ["renata a tarasievich like", "renata-tarasievich"],
    ["will smith like", "will-smith"],
    ["may lee worth taking", "may-lee"],
    ["Bill O'Brien worth taking", "william-obrien"],
  ];
  for (const [hint, slug] of cases) {
    const result = await resolveProfessorIdentityFromLookup(hint, lookup);
    assert.equal(result.status, "match", hint);
    if (result.status === "match") assert.equal(result.candidate.slug, slug, hint);
  }
});

test("shorter exact prefixes require a recognized predicate suffix", async () => {
  const lookup = {
    findExact: async () => [professors[0]],
    findCandidates: async () => professors,
  };
  const valid = [
    "William O'Brien Worth Taking",
    "William O'Brien teach FIN 300",
    "William O'Brien like",
  ];
  for (const hint of valid) {
    const result = await resolveProfessorIdentityFromLookup(hint, lookup);
    assert.equal(result.status, "match", hint);
    if (result.status === "match") assert.equal(result.candidate.slug, "william-obrien", hint);
  }

  const invalid = [
    "William O'Brien Smith",
    "William O'Brien Unknown Surname",
    "William O'Brien Extra",
  ];
  for (const hint of invalid) {
    assert.deepEqual(await resolveProfessorIdentityFromLookup(hint, lookup), { status: "none" }, hint);
  }
});

test("staged lookup resolves exact identities without a truncated candidate window", async () => {
  const decoys = Array.from({ length: 75 }, (_, index) => ({
    name: `William Decoy ${String(index).padStart(2, "0")}`,
    slug: `decoy-${index}`,
  }));
  let fallbackCalled = false;
  const result = await resolveProfessorIdentityFromLookup("William O'Brien", {
    findExact: async () => [professors[0]],
    findCandidates: async () => {
      fallbackCalled = true;
      return [...decoys, professors[0]];
    },
  });

  assert.equal(result.status, "match");
  if (result.status === "match") assert.equal(result.candidate.slug, "william-obrien");
  assert.equal(fallbackCalled, false);
});

test("fallback ambiguity considers every matching row beyond the former boundary", async () => {
  const smiths = Array.from({ length: 60 }, (_, index) => ({
    name: `Person ${index} Smith`,
    slug: `smith-${index}`,
  }));
  const result = await resolveProfessorIdentityFromLookup("Smith", {
    findExact: async () => [],
    findCandidates: async () => smiths,
  });

  assert.equal(result.status, "ambiguous");
  if (result.status === "ambiguous") assert.equal(result.candidates.length, 60);
});
