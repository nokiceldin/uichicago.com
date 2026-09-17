import assert from "node:assert/strict";
import test from "node:test";
import { parseStoredPreferences, serializeStoredPreferences } from "./profile.ts";

test("account workspace state round-trips with planner course status kept separate", () => {
  const serialized = serializeStoredPreferences(
    "Prefers visual study aids",
    {
      majorSlug: "computer-science-bs",
      currentCourses: ["CS 251"],
      completedCourses: ["CS 141", "CS 151"],
    },
    { themeMode: "dark" },
    {
      syncInitialized: true,
      progress: {
        "set-1": {
          "card-1": {
            cardId: "card-1",
            masteryScore: 80,
            confidenceScore: 75,
            timesSeen: 4,
            timesCorrect: 3,
            timesWrong: 1,
            starred: true,
            markedDifficult: false,
          },
        },
      },
      quizResults: [],
      customFolders: ["Fall 2026/CS 251"],
      noteFolders: { "note-1": "Fall 2026/CS 251" },
      matchBests: { "set-1": 12345 },
      savedSetIds: ["set-1"],
    },
  );

  const parsed = parseStoredPreferences(serialized);
  assert.deepEqual(parsed.plannerProfile.currentCourses, ["CS 251"]);
  assert.deepEqual(parsed.plannerProfile.completedCourses, ["CS 141", "CS 151"]);
  assert.equal(parsed.workspaceState.syncInitialized, true);
  assert.equal(parsed.workspaceState.progress?.["set-1"]?.["card-1"]?.starred, true);
  assert.deepEqual(parsed.workspaceState.customFolders, ["Fall 2026/CS 251"]);
  assert.equal(parsed.workspaceState.noteFolders?.["note-1"], "Fall 2026/CS 251");
  assert.equal(parsed.workspaceState.matchBests?.["set-1"], 12345);
  assert.deepEqual(parsed.workspaceState.savedSetIds, ["set-1"]);
});

test("older account profiles migrate with an empty workspace state", () => {
  const parsed = parseStoredPreferences(JSON.stringify({
    __type: "study_profile_v3",
    notes: "Existing account",
    plannerProfile: { currentCourses: ["MATH 180"] },
    settings: {},
  }));

  assert.equal(parsed.notes, "Existing account");
  assert.deepEqual(parsed.plannerProfile.currentCourses, ["MATH 180"]);
  assert.deepEqual(parsed.workspaceState, {});
});
