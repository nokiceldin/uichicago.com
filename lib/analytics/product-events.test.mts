import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCourseSearchEvent,
  buildProfessorSearchEvent,
  classifyProductView,
  decideReturningVisit,
  productEventKey,
  searchEventKeyAfterInput,
} from "./product-events.ts";

test("classifies only the requested product view paths", () => {
  assert.deepEqual(classifyProductView("/"), {
    name: "homepage_view",
    properties: { path: "/" },
  });
  assert.deepEqual(classifyProductView("/professors/Jane%20Doe/"), {
    name: "professor_view",
    properties: { professor_slug: "Jane Doe" },
  });
  assert.deepEqual(classifyProductView("/courses/cs/211"), {
    name: "course_view",
    properties: { subject: "CS", course_number: "211", course_code: "CS 211" },
  });
  assert.equal(classifyProductView("/professors"), null);
  assert.equal(classifyProductView("/professors/a/extra"), null);
  assert.equal(classifyProductView("/courses"), null);
  assert.equal(classifyProductView("/courses/cs/211/extra"), null);
});

test("builds normalized, result-aware search events only for non-empty queries", () => {
  assert.equal(buildProfessorSearchEvent({ query: "   ", department: "All", minRating: 0, minReviews: 0, sort: "best", savedOnly: false, resultCount: 10 }), null);
  assert.deepEqual(buildProfessorSearchEvent({ query: "  Jane   DOE ", department: "CS", minRating: 4, minReviews: 20, sort: "most", savedOnly: true, resultCount: 7 }), {
    name: "professor_search",
    properties: { normalized_query: "jane doe", department: "CS", min_rating: 4, min_reviews: 20, sort: "most", saved_only: true, result_count: 7 },
  });
  assert.deepEqual(buildCourseSearchEvent({ query: "  Data   Structures ", department: "CS", genEd: false, genEdCategory: "", major: "computer-science", majorCategory: "core", savedOnly: false, sort: "difficultyDesc", resultCount: -1 }), {
    name: "course_search",
    properties: { normalized_query: "data structures", department: "CS", gen_ed: false, gen_ed_category: null, major: "computer-science", major_category: "core", saved_only: false, sort: "difficultyDesc", result_count: 0 },
  });
});

test("clearing a search immediately permits the same successful query to be captured again", () => {
  const event = buildProfessorSearchEvent({ query: "Jane Doe", department: "All", minRating: 0, minReviews: 0, sort: "best", savedOnly: false, resultCount: 4 });
  assert.ok(event);
  const capturedKey = productEventKey(event);

  assert.equal(searchEventKeyAfterInput(capturedKey, "Jane Doe"), capturedKey);
  const keyAfterClear = searchEventKeyAfterInput(capturedKey, "   ");
  assert.equal(keyAfterClear, null);
  assert.notEqual(keyAfterClear, productEventKey(event));
});

test("marks the first visit without calling it returning and captures once in later sessions", () => {
  assert.deepEqual(decideReturningVisit({ hasVisited: false, sessionMarked: false }), {
    captureReturningUser: false,
    markVisited: true,
    markSession: true,
  });
  assert.deepEqual(decideReturningVisit({ hasVisited: true, sessionMarked: false }), {
    captureReturningUser: true,
    markVisited: false,
    markSession: true,
  });
  assert.deepEqual(decideReturningVisit({ hasVisited: true, sessionMarked: true }), {
    captureReturningUser: false,
    markVisited: false,
    markSession: false,
  });
});
