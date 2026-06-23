// INTENT TEST — a containing scope's status is DERIVED from its children, never a stored field
// (domain-model: status; §17). Two halves: the derivation is a pure query, and the project record
// schema carries no status field to go stale.

import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveStatus } from "../../src/domain/status.ts";
import { Project, Workspace } from "../../src/store/schemas.ts";

test("status is derived from child states (pure query)", () => {
  assert.equal(deriveStatus([]), "empty");
  assert.equal(deriveStatus(["active", "closed"]), "active");
  assert.equal(deriveStatus(["closed", "closed"]), "closed");
  assert.equal(deriveStatus(["blocked", "active"]), "blocked", "attention surfaces first");
  assert.equal(deriveStatus(["paused", "closed"]), "paused");
});

test("container records carry NO stored status field (it would go stale, §17)", () => {
  assert.ok(!("status" in Project.shape), "project must not store status");
  assert.ok(!("status" in Workspace.shape), "workspace must not store status");
});
