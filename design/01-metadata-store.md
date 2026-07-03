# Design — Metadata store

> **Serves intent:** [metadata-store seam](../intent/02-subsystems/00-metadata-store.md),
> [domain-model](../intent/01-concepts/00-domain-model.md) (status derived), principles §16/§17.
> **Supersedes:** nothing (first plan for this area).

## Decisions

- **A filesystem of typed Markdown documents.** Directory nesting expresses scope containment; the
  durable record is `.ward/` (git-tracked), the regenerable checkouts are `repos/` + `worktrees/`
  (ignored). Layout in [`00-foundation`](00-foundation.md).
- **One canonical front-matter writer** ([`src/store/frontmatter.ts`](../src/store/frontmatter.ts)):
  sorted keys, fixed style, terminal newline — so re-writing an unchanged document is a no-op diff.
- **The document catalog is a Zod `discriminatedUnion` on `type`**
  ([`src/store/schemas.ts`](../src/store/schemas.ts)); every read validates at the boundary
  ([`doc.ts`](../src/store/doc.ts)). Types: workspace, persona, project, task, worktree, room,
  session, wake, message, reflection, artifact, pr, event.
- **No-lost-updates is structural, not locked** (§17), in order of preference:
  1. **Derive, don't store** shared roll-ups — container status is a query over children
     ([`status.ts`](../src/domain/status.ts)); room occupancy derives from sessions (SF-001).
  2. **Append over rewrite** — per-scope logs are one file per entry with an exclusive-create seq
     ([`log.ts`](../src/store/log.ts)); `fold(events)` derives state.
  3. **One owner per mutable record** — a task/session/pr owns its own state field.

## What `src/` realizes it

`store/frontmatter` · `store/schemas` · `store/doc` · `store/paths` · `store/ids` · `store/log` ·
`store/workspace` (discovery + scope→dir resolution).

## Invariants under test

`test/intent/no-lost-updates` (concurrent appends lose none; state derived by folding);
`test/intent/derived-status` (roll-up never stored).

## Deferred (carried from the seam's Left-to-implementation)

The concurrency primitive for genuinely-shared mutable records (v2 has none — structure removes the
contention); provenance depth; the exact `.gitignore` policy beyond repos/ + worktrees/.
