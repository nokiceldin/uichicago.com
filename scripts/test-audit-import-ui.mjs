// Local UI integration check with synthetic data and mocked account endpoints.
// No account or database writes. Run with the local Next dev server running:
// node --experimental-strip-types scripts/test-audit-import-ui.mjs
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createHash } from "node:crypto";
import { prepareAuditImport } from "../lib/academic/audit-import-review.ts";

const base = "http://127.0.0.1:3000";
const sample = `Program:\t0112 BS: Computer Science
Catalog Year:\t202408
Prepared On:\t09/20/2026
Requirement: Total Degree Hours\tRequirement Unfulfilled\tTotal Degree Hours
128 hours required
EARNED:\t3.00 HOURS
In-Prog:\t4.00 HOURS
Requirement: ALL COURSES\tRequirement\tALL COURSES
EARNED:\t3.00 HOURS
In-Prog:\t4.00 HOURS
FA24 CS 141 3.00 A
FA26 CS 251 4.00 IP >I
WS25 MATH 210 3.00 W`;

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, reducedMotion: "reduce" });
  await context.route("**/*", route => new URL(route.request().url()).origin === base ? route.fallback() : route.abort());
  await context.addCookies([{ name: "uic_private_planner_access", value: createHash("sha256").update("uichicago-private-v1:planner:planner2026").digest("hex"), url: base }]);
  let profile = { school: "UIC", major: "Computer Science - BS", currentCourses: ["CS 211"], interests: [], studyPreferences: "Keep notes", settings: {}, plannerProfile: { majorSlug: "computer-science-bs", currentSemesterNumber: 3, honorsStudent: false, currentCourses: ["CS 211"], completedCourses: ["CS 112"] } };
  let importCalls = 0;
  let failNextImport = true;
  let signedIn = true;
  const errors = [];
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    let payload = {};
    if (path === "/api/auth/session") payload = signedIn ? { user: { id: "audit-test", name: "Test Student", email: "test@example.invalid" }, expires: "2099-01-01T00:00:00.000Z" } : {};
    else if (path === "/api/study/me") {
      if (req.method() === "PATCH") {
        const body = req.postDataJSON();
        if (body.auditImport) {
          importCalls++;
          assert.equal(body.auditImport.confirmed, true);
          if (failNextImport) {
            failNextImport = false;
            await route.fulfill({ status: 500, json: { error: "Synthetic save failure" } });
            return;
          }
          const imported = prepareAuditImport(body.auditImport.text, body.auditImport.choices);
          profile = { ...profile, currentCourses: imported.currentCourses, plannerProfile: { ...profile.plannerProfile, ...imported } };
        } else {
          profile = { ...profile, ...body, plannerProfile: { ...profile.plannerProfile, ...body.plannerProfile } };
        }
      }
      payload = { ok: true, profile, library: { sets: [], notes: [], groups: [], progress: {}, quizResults: [] }, saved: { courses: [], professors: [] } };
    } else if (path === "/api/study/majors") payload = { items: [{ name: "Computer Science - BS", slug: "computer-science-bs", college: "Engineering", hasSchedule: true }] };
    else payload = { items: [], courses: [], professors: [], groups: [], sets: [], notes: [] };
    await route.fulfill({ json: payload });
  });
  await page.goto(`${base}/study/planner`);
  const panel = page.getByRole("region", { name: "Import your degree audit" });
  await panel.waitFor();
  // The server deliberately renders an anonymous session. Simulate the normal
  // cross-tab session refresh so the browser picks up the mocked test session.
  const refreshSession = async () => {
    await panel.getByLabel("Expanded audit text").fill("hydration check");
    await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", {
      key: "nextauth.message", newValue: JSON.stringify({ event: "session", data: { trigger: "test" } }),
    })));
  };
  await refreshSession();
  await page.getByText("Test Student", { exact: true }).first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  console.log("Test session loaded");
  await panel.getByLabel("Expanded audit text").fill(sample);
  await panel.getByRole("button", { name: "Preview audit" }).click();
  await panel.getByText("Review before saving", { exact: true }).waitFor();
  const save = panel.getByRole("button", { name: "Confirm and save courses" });
  assert.equal(await save.isDisabled(), true);
  assert.equal(importCalls, 0);
  assert.equal(await panel.getByLabel("Import MATH 210 WS25 row 3").locator("option").count(), 1);
  if (process.env.AUDIT_UI_SCREENSHOT) await page.screenshot({ path: process.env.AUDIT_UI_SCREENSHOT, fullPage: true });
  console.log("Preview ready");
  await panel.getByRole("checkbox").check();
  await save.click();
  await panel.getByText("Synthetic save failure", { exact: true }).waitFor();
  console.log("Save failure handled");
  assert.equal(await panel.getByLabel("Expanded audit text").inputValue(), sample);
  assert.deepEqual(profile.plannerProfile.completedCourses, ["CS 112"]);
  await save.click();
  await panel.getByRole("status").waitFor();
  console.log("Retry saved");
  assert.equal(importCalls, 2);
  assert.deepEqual(profile.plannerProfile.completedCourses, ["CS 141"]);
  assert.deepEqual(profile.currentCourses, ["CS 251"]);
  assert.equal(profile.plannerProfile.auditImport.metadata.catalogCode, "202408");
  assert.equal(await panel.getByLabel("Expanded audit text").inputValue(), "");
  await page.reload();
  await refreshSession();
  await panel.getByText(/Saved audit: catalog 202408/).waitFor();
  console.log("Reload retained import");
  assert.deepEqual(profile.plannerProfile.completedCourses, ["CS 141"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.getByLabel("Expanded audit text").fill(sample);
  await panel.getByRole("button", { name: "Preview audit" }).click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "mobile page should not overflow horizontally");
  if (process.env.AUDIT_UI_SCREENSHOT) await page.screenshot({ path: process.env.AUDIT_UI_SCREENSHOT, fullPage: true });
  signedIn = false;
  await page.reload();
  await panel.getByLabel("Expanded audit text").fill(sample);
  await panel.getByRole("button", { name: "Preview audit" }).click();
  await panel.getByRole("checkbox").check();
  assert.equal(await panel.getByRole("button", { name: "Confirm and save courses" }).isDisabled(), true);
  assert.deepEqual(errors, []);
  console.log("PASS: preview, confirmation, invalid grades, save failure/retry, persistence/reload, mobile layout, and signed-out save protection (mocked API).");
} finally {
  await browser.close();
}
