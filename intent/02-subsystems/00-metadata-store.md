# Subsystem: Metadata Store

> **Layer:** intent · subsystem (seam). The constraints any design must honor; names no tool.
> **Design:** `../../design/02-subsystems/00-metadata-store.md`. **Status:** placeholder skeleton.

## Responsibility

Persist and serve the recorded state of the workspace — the hierarchy of scopes, tasks and their
lifecycle, sessions and their logs, artifacts and their provenance, identities, reflection cursors,
the version stamp. The source of truth that survives reboots (`01-principles.md` §16).

## Constraints any design must honor

- Deterministic reads: "the state of X" returns the same answer for the same state.
- Durable, promptly-updated writes through the lifecycle operations.
- Resolution from an identity to the thing it names (including scope-relative identity).
- Enumeration of scopes and sessions for recovery and reflection.
- Append-only session logs per scope; durable artifacts per scope, with provenance.
- Aggregate status is **derived** from leaf records, not stored
  (`01-concepts/00-work-hierarchy.md`).
- Concurrent writes **do not lose updates** (`01-principles.md` §17) — via, in order of preference:
  derive-don't-store, append-over-rewrite, one-owner-per-record, serialize the rest.
- Legible to both audiences (`01-principles.md` §8) and git-versionable (`01-principles.md` §15).

## What this is NOT

- Not a mandate that the store be any particular technology — only that the **contract** above
  holds. If it is ever swapped, the contract is preserved, not the conventions.

## Canonical home for

The metadata-store contract and the no-lost-updates _strategy at the constraint level_. The
realization (filesystem, markdown, schemas, atomic writes) is design.

## Open questions

- **Document-type catalog + schemas** and **workspace layout + version stamp** are 🔴 spine
  decisions (design); the intent constraint is only that types exist and are validated.
