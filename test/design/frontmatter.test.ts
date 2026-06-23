// DESIGN TEST — the canonical front-matter writer is deterministic (same record → byte-identical
// output, regardless of input key order) and round-trips. Backs principles §6/§12 and ADR 0004.

import { test } from "node:test";
import assert from "node:assert/strict";
import { serializeFrontmatter, parseFrontmatter } from "../../src/store/frontmatter.ts";

test("serialization is deterministic and order-independent", () => {
  const a = { type: "task", title: "z", schemaVersion: 1, repos: ["r1", "r2"], state: "active" };
  const b = { state: "active", repos: ["r1", "r2"], schemaVersion: 1, title: "z", type: "task" };
  const sa = serializeFrontmatter(a, "body");
  const sb = serializeFrontmatter(b, "body");
  assert.equal(sa, sb, "same logical record must serialize byte-identically");
  // priority fields lead:
  assert.match(sa, /^---\ntype: task\nschemaVersion: 1\n/);
  // arrays keep order (sequence is meaningful):
  assert.match(sa, /repos:\n {2}- r1\n {2}- r2/);
});

test("round-trips data and body, and re-serialization is idempotent", () => {
  const data = { type: "room", identity: { slug: "x", code: "1A1" }, state: "open" };
  const text = serializeFrontmatter(data, "# Room\n\nhands-on work");
  const parsed = parseFrontmatter(text);
  assert.deepEqual(parsed.data, data);
  assert.equal(parsed.body.trimEnd(), "# Room\n\nhands-on work");
  // canonical form is a fixed point: parse → re-serialize yields the same bytes
  assert.equal(serializeFrontmatter(parsed.data, parsed.body), text);
});
