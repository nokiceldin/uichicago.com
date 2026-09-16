import assert from "node:assert/strict";
import test from "node:test";
import { buildLearnQuestionBank, fuzzyMatch, getRecommendedPracticeMode } from "./engine.ts";
import type { StudySet } from "./types.ts";

test("fuzzyMatch rejects blank and substring answers", () => {
  assert.equal(fuzzyMatch("", "photosynthesis"), false);
  assert.equal(fuzzyMatch("cat", "catalyst"), false);
  assert.equal(fuzzyMatch("not correct", "correct"), false);
});

test("fuzzyMatch requires numeric answers to agree", () => {
  assert.equal(fuzzyMatch("12", "120"), false);
  assert.equal(fuzzyMatch("The answer is 12", "The answer is 12"), true);
  assert.equal(fuzzyMatch("The answer is 12", "The answer is 13"), false);
});

test("fuzzyMatch allows small, plausible typos", () => {
  assert.equal(fuzzyMatch("photosythesis", "photosynthesis"), true);
  assert.equal(fuzzyMatch("mitocondria", "mitochondria"), true);
  assert.equal(fuzzyMatch("cell", ["cell", "cellular structure"]), true);
});

function makeSet(answers: string[]): StudySet {
  const now = "2026-09-16T00:00:00.000Z";
  return {
    id: "test-set",
    title: "Test set",
    description: "",
    course: "",
    subject: "General",
    tags: [],
    difficulty: "medium",
    visibility: "private",
    createdAt: now,
    updatedAt: now,
    cards: answers.map((back, index) => ({
      id: `card-${index}`,
      front: `Term ${index + 1}`,
      back,
      difficulty: "medium",
      tags: [],
      orderIndex: index,
    })),
  };
}

test("small decks without valid multiple-choice distractors open in flashcards", () => {
  for (const count of [1, 2, 3]) {
    const set = makeSet(Array.from({ length: count }, (_, index) => `Answer ${index + 1}`));
    assert.equal(buildLearnQuestionBank(set).length, 0);
    assert.equal(getRecommendedPracticeMode(set), "flashcards");
  }
});

test("practice opens Learn when the saved content can build fair choices", () => {
  const set = makeSet([
    "Mercury is the closest planet to the Sun",
    "Venus is the second planet from the Sun",
    "Earth is the third planet from the Sun",
    "Mars is the fourth planet from the Sun",
  ]);
  assert.ok(buildLearnQuestionBank(set).length > 0);
  assert.equal(getRecommendedPracticeMode(set), "learn");
});
