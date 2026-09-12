import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.STUDY_TEST_URL || "http://localhost:3100";
const browser = await chromium.launch();
const now = new Date().toISOString();

let identity = "owner-a";
let studySet = {
  id: "visibility-set",
  ownerId: "owner-a",
  title: "Visibility biology flashcards",
  description: "A complete biology review set.",
  folder: "",
  course: "BIOS 120",
  subject: "Biology",
  tags: ["visibility"],
  difficulty: "medium",
  visibility: "private",
  createdAt: now,
  updatedAt: now,
  canEdit: true,
  cards: [
    { id: "card-a", front: "Chlorophyll", back: "A pigment that absorbs light.", difficulty: "medium", tags: [], orderIndex: 0 },
    { id: "card-b", front: "Chloroplast", back: "The organelle where photosynthesis occurs.", difficulty: "medium", tags: [], orderIndex: 1 },
  ],
};
let studyNote = {
  id: "visibility-note",
  title: "Visibility photosynthesis notes",
  folder: "",
  course: "BIOS 120",
  noteDate: "2026-09-11",
  subject: "Biology",
  tags: ["visibility"],
  rawContent: "Photosynthesis converts light energy into chemical energy inside plant cells.",
  structuredContent: null,
  transcriptContent: "",
  sourceType: "manual",
  visibility: "private",
  status: "ready",
  createdAt: now,
  updatedAt: now,
  lastOpenedAt: now,
  pinned: false,
  favorite: false,
};

try {
  const page = await browser.newPage();
  await page.route("**/api/auth/session", route => route.fulfill({
    json: identity === "guest" ? {} : { user: { id: identity, name: identity }, expires: "2099-01-01" },
  }));
  await page.route("**/api/study/me", route => route.fulfill({
    json: { library: { sets: [studySet], notes: [studyNote], groups: [], sessions: [] } },
  }));
  await page.route("**/api/study/sets", async route => {
    if (route.request().method() !== "POST") return route.continue();
    studySet = { ...(await route.request().postDataJSON()).set, ownerId: "owner-a", canEdit: true };
    await route.fulfill({ json: { ok: true, set: studySet } });
  });
  await page.route("**/api/study/notes", async route => {
    if (route.request().method() !== "POST") return route.continue();
    studyNote = (await route.request().postDataJSON()).note;
    await route.fulfill({ json: { ok: true, note: studyNote } });
  });
  await page.route("**/api/study/public-sets**", route => route.fulfill({
    json: { items: studySet.visibility === "public" ? [studySet] : [] },
  }));
  await page.route("**/api/study/public-notes**", route => route.fulfill({
    json: { items: studyNote.visibility === "public" ? [studyNote] : [] },
  }));

  await page.goto(`${base}/study?set=${studySet.id}&mode=flashcards&screen=overview`);
  await page.getByRole("heading", { name: studySet.title }).waitFor();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Make public" }).click();
  await page.getByText("Set is now public", { exact: false }).waitFor();
  assert.equal(studySet.visibility, "public");

  await page.reload();
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Make private" }).waitFor();

  await page.goto(`${base}/study?mode=notes&note=${studyNote.id}`);
  await page.getByPlaceholder("Untitled note", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Private", exact: true }).click();
  await page.getByRole("button", { name: "Public", exact: true }).waitFor();
  assert.equal(studyNote.visibility, "public");

  await page.goto(`${base}/study?view=library&section=notes`);
  await page.getByText(studyNote.title, { exact: true }).waitFor();
  assert.ok(await page.getByText("Public", { exact: true }).count());

  await page.goto(`${base}/study?mode=notes&note=${studyNote.id}`);
  await page.getByRole("button", { name: "Public", exact: true }).click();
  await page.getByRole("button", { name: "Private", exact: true }).waitFor();
  assert.equal(studyNote.visibility, "private");

  studyNote = {
    ...studyNote,
    id: "visibility-guide",
    title: "Visibility biology study guide",
    sourceType: "imported",
    visibility: "private",
    structuredContent: {
      title: "Visibility biology study guide",
      summary: "A complete guide to how photosynthesis captures and stores light energy.",
      sections: [{ heading: "Core process", items: ["Light reactions capture energy.", "The Calvin cycle builds sugar."] }],
      keyTerms: ["chlorophyll"],
      questionsToReview: ["Where do light reactions occur?"],
      confidenceNotes: [],
    },
  };
  await page.goto(`${base}/study?mode=notes&note=${studyNote.id}`);
  await page.getByRole("button", { name: "Private", exact: true }).click();
  await page.getByRole("button", { name: "Public", exact: true }).waitFor();
  assert.equal(studyNote.visibility, "public");

  await page.goto(`${base}/study?view=library&section=guides`);
  await page.getByText(studyNote.title, { exact: true }).waitFor();
  assert.ok(await page.getByText("Public", { exact: true }).count());

  identity = "guest";
  await page.goto(`${base}/study?query=Visibility`);
  await page.getByRole("link", { name: studySet.title }).waitFor();
  await page.getByRole("link", { name: studyNote.title }).waitFor();

  identity = "owner-a";
  await page.goto(`${base}/study?set=${studySet.id}&mode=flashcards&screen=overview`);
  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("button", { name: "Make private" }).click();
  await page.getByText("Set is now private", { exact: false }).waitFor();
  assert.equal(studySet.visibility, "private");

  console.log("PASS: flashcard, note, and study-guide controls persist visibility; labels survive reload; guests discover public materials");
} finally {
  await browser.close();
}
