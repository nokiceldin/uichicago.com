import assert from "node:assert/strict";
import { chromium } from "playwright";

const base = process.env.STUDY_TEST_URL || "http://localhost:3100";
const browser = await chromium.launch();

function note(id, title) {
  const now = new Date().toISOString();
  return { id, title, course: "BIOS 120", noteDate: now.slice(0, 10), subject: "Biology", tags: [], rawContent: `${title} content`, structuredContent: null, transcriptContent: "", sourceType: "manual", visibility: "private", status: "ready", createdAt: now, updatedAt: now, lastOpenedAt: now, pinned: false, favorite: false };
}

try {
  let identity = "user-a";
  const page = await browser.newPage();
  await page.addInitScript(({ guestNote }) => {
    const empty = { sets: [], groups: [{ id: "leaked-group", name: "Must not appear", inviteCode: "NOPE", memberNames: [], setIds: [] }], notes: [guestNote], noteAudioSessions: [], noteAiLogs: [], progress: {}, sessions: [], quizResults: [] };
    localStorage.setItem("uic-atlas-study-library-v2:guest", JSON.stringify(empty));
  }, { guestNote: note("guest-note", "Guest-only note") });
  await page.route("**/api/auth/session", route => route.fulfill({ json: identity === "guest" ? {} : { user: { id: identity, name: identity }, expires: "2099-01-01" } }));
  await page.route("**/api/study/me", route => route.fulfill({ json: { library: { sets: [], groups: identity === "user-a" ? [{ id: "group-a", name: "A group", inviteCode: "A1", memberNames: ["A"], setIds: [] }] : [], notes: identity === "user-a" ? [note("note-a", "Account A private note")] : [], sessions: [] } } }));

  await page.goto(`${base}/study?mode=notes&note=note-a`);
  await page.waitForFunction(() => document.querySelector('input[placeholder="Untitled note"]')?.value === "Account A private note");

  identity = "user-b";
  await page.reload();
  await page.getByPlaceholder("Untitled note", { exact: true }).waitFor();
  assert.equal(await page.getByPlaceholder("Untitled note", { exact: true }).inputValue(), "");
  assert.equal(await page.getByText("Account A private note").count(), 0);

  identity = "guest";
  await page.goto(`${base}/study?mode=notes&note=guest-note`);
  await page.waitForFunction(() => document.querySelector('input[placeholder="Untitled note"]')?.value === "Guest-only note");
  await page.goto(`${base}/study?screen=groups`);
  assert.equal(await page.getByText("Must not appear").count(), 0);

  identity = "user-a";
  await page.goto(`${base}/study?mode=notes&note=note-a`);
  await page.waitForFunction(() => document.querySelector('input[placeholder="Untitled note"]')?.value === "Account A private note");
  console.log("PASS: account A, account B, and guest libraries stay isolated; guest groups are discarded; stale note URLs do not leak content");
} finally {
  await browser.close();
}
