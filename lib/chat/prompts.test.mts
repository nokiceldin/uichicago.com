import assert from "node:assert/strict";
import test from "node:test";
import { getDeterministicItems, getSeededRandomItems } from "./prompts.ts";

test("suggested prompts are stable for server and client rendering", () => {
  const prompts = ["one", "two", "three", "four", "five"];
  assert.deepEqual(getDeterministicItems(prompts, 4), ["one", "two", "three", "four"]);
  assert.deepEqual(getDeterministicItems(prompts, 4), ["one", "two", "three", "four"]);
});

test("suggested prompts rotate predictably without duplicates", () => {
  const prompts = ["one", "two", "three", "four", "five"];
  assert.deepEqual(getDeterministicItems(prompts, 3, 3), ["four", "five", "one"]);
  assert.deepEqual(getDeterministicItems(prompts, 10, 1), ["two", "three", "four", "five", "one"]);
});

test("seeded suggestions are stable for a visit and vary between visits", () => {
  const prompts = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
  const firstVisit = getSeededRandomItems(prompts, 4, 12345);
  const sameVisit = getSeededRandomItems(prompts, 4, 12345);
  const nextVisit = getSeededRandomItems(prompts, 4, 98765);

  assert.deepEqual(firstVisit, sameVisit);
  assert.notDeepEqual(firstVisit, nextVisit);
  assert.equal(new Set(firstVisit).size, 4);
});
