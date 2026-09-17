import assert from "node:assert/strict";
import test from "node:test";
import { mergeAccountRecords } from "./account-sync.ts";

test("an initialized account treats the server as authoritative after deletion", () => {
  const remote = [{ id: "kept", title: "Still on account" }];
  const staleLocal = [
    { id: "kept", title: "Old local version" },
    { id: "deleted-elsewhere", title: "Must stay deleted" },
  ];

  assert.deepEqual(mergeAccountRecords(remote, staleLocal, true), remote);
});

test("an older account gets one migration pass for local-only work", () => {
  const remote = [{ id: "server", title: "Server copy" }];
  const local = [
    { id: "server", title: "Old duplicate" },
    { id: "local-draft", title: "Local draft" },
  ];

  assert.deepEqual(mergeAccountRecords(remote, local, false), [remote[0], local[1]]);
});
