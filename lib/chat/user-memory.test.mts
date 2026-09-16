import assert from "node:assert/strict";
import test from "node:test";
import { getAccountMemoryKey, mergeUserMemory } from "./user-memory.ts";

test("account memory uses a stable per-user key", () => {
  assert.equal(getAccountMemoryKey("user-123"), "sparky_account_user-123");
});

test("new conversations inherit account facts and keep conversation details", () => {
  const merged = mergeUserMemory(
    { major: "Computer Science", interests: ["AI"], knownPrefs: ["commuter"] },
    { interests: ["cybersecurity"], goals: ["internship"], lastTopics: ["CS 211"] },
  );

  assert.equal(merged.major, "Computer Science");
  assert.deepEqual(merged.interests, ["AI", "cybersecurity"]);
  assert.deepEqual(merged.knownPrefs, ["commuter"]);
  assert.deepEqual(merged.goals, ["internship"]);
  assert.deepEqual(merged.lastTopics, ["CS 211"]);
});
