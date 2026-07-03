# Design — Foundation: stack, module layout, the spine

> **Serves intent:** the whole [`intent/`](../intent/) tree, concretely the
> [metadata-store seam](../intent/02-subsystems/00-metadata-store.md) (the store core),
> [domain-model](../intent/01-concepts/00-domain-model.md) (the nouns), and
> [human-shell](../intent/02-subsystems/07-human-shell.md) (the CLI shape). This is the "spine
> first" foundation; per-seam design plans are sibling files added as the build reaches each seam.

This plan fixes the **build shape** for v2. The _why_ behind each tool is in the stack ADRs
([`plan/decisions/0001`–`0007`](../plan/decisions/)); this file records the **layout** they produce
and what [`src/`](../src/) mirrors. It is the design record for the exercise journaled in
[`plan/v2/`](../plan/v2/).

## Stack (see ADRs for rationale)

- **Language/runtime:** TypeScript on Node ≥24, native type-stripping, no build step
  ([0001](../plan/decisions/0001-language-and-runtime.md)). Erasable syntax only, enforced by
  `verbatimModuleSyntax` + `erasableSyntaxOnly`.
- **Tests/types:** `node --test` + `node:assert/strict`; `tsc --noEmit` as a separate type gate
  ([0002](../plan/decisions/0002-execution-and-test-runner.md)).
- **Schemas:** Zod, a `discriminatedUnion` on `type` = the document catalog
  ([0003](../plan/decisions/0003-zod-schemas.md)).
- **Front matter:** YAML through one canonical (deterministic) serializer
  ([0004](../plan/decisions/0004-frontmatter-determinism.md)).
- **CLI:** Commander, a noun→verb tree ([0005](../plan/decisions/0005-cli-framework-commander.md)).
- **Git:** shell out to the `git` binary behind one thin wrapper
  ([0006](../plan/decisions/0006-git-integration-shell-out.md)).
- **Format + lint:** **Biome** (single binary, both) wired into `make check` + CI, closing v1's gap
  ([0007](../plan/decisions/0007-biome-format-and-lint.md)); dprint/lychee keep Markdown/links.

## Module layout (`src/` mirrors this)

```
src/
  store/            # the metadata-store seam (ADRs 0003/0004)
    frontmatter.ts  # canonical YAML front-matter parse/serialize — the ONLY writer of front matter
    schemas.ts      # one Zod schema per document type; the discriminated-union catalog
    paths.ts        # workspace path layout; directory nesting == scope containment; scope <-> path
    doc.ts          # typed read/write: parse+validate on read, validate+canonical-write on write
    log.ts          # append-only event logs (one file per entry) + fold(events) -> state
    ids.ts          # identity allocation: floor numbers, room codes, slugs, workspace-unique session ids
    workspace.ts    # locate the workspace root from any cwd; load/save the workspace record
  domain/           # operations on the nouns, over store/ + seams/ (no CLI, no framework here)
    project.ts  task.ts  worktree.ts  room.ts  session.ts  status.ts  hooks.ts  recovery.ts  reflection.ts
  seams/            # swappable machinery behind thin adapters (one file per subsystem contract)
    git.ts          # git binary wrapper (ADR 0006)
    harness.ts      # agent-harness adapter: start/handle/resume/locate over a stub runtime
    theming.ts      # deterministic accent + per-type glyph, recorded & nameable
    messaging.ts    # dispatch/report/wake, recorded-first, idempotent, re-armable
    remote.ts       # remote-provider stub + the single privacy-translation gate (fail-closed)
    model.ts        # model-selection override hierarchy (narrower overrides broader)
  cli/              # the human shell (ADR 0005) — thin plumbing to domain/
    index.ts        # #!/usr/bin/env node — Commander program, noun subcommands
    output.ts       # two-audience rendering (human text vs --json)
    context.ts      # workspace/scope discovery from cwd + ambient agent-signal parsing
```

**Why this layout.** It mirrors the seams so the design↔src↔test triangle is legible: `store/` is
the metadata-store seam, each `seams/*` file is one subsystem contract, `domain/` is the concept
layer depending only on `store/` + `seams/`, and `cli/` is thin plumbing depending on `domain/` —
never the reverse. Dependency arrows point inward (`cli → domain → store + seams`), so the core is
testable without the CLI, exactly as the human-shell seam requires and as the intent tests need.

## On-disk workspace layout

The store is a filesystem; **directory nesting expresses scope containment**
([metadata-store](../intent/02-subsystems/00-metadata-store.md)). The durable, small, versionable
state lives in `.ward/` and is git-tracked (§15); the large, regenerable git checkouts are ignored
and restored from origin + the recorded branches (§16).

```
<workspace-root>/
  .ward/                              # the metadata store (git-tracked)
    workspace.md                      # type: workspace — version stamp, repos, model defaults, config
    personas/<name>.md                # the default cast (type: persona)
    reflections/<scope>--<goal>.md    # reflection output + cursor
    projects/<floor>-<slug>/          # a project (floor); dir nesting = containment
      project.md                      # type: project (NO status field — derived)
      log/<seq>-<event>.md            # append-only event log (one file per event)
      tasks/<slug>/
        task.md                       # type: task (records its own state: active|paused|closed)
        log/
        artifacts/<name>.md           # task-scope artifacts (briefs, notes, …) with provenance
        worktrees/<repo>__<branch>.md # type: worktree (natural key)
        rooms/<roomcode>/
          room.md                     # type: room (records occupied|free)
          log/
          artifacts/
    sessions/<id>.md                  # type: session — workspace-unique id, harness handle, state
    wakes/<id>.md                     # type: wake (armed|satisfied via its log)
    messages/<seq>-<id>.md            # type: message (dispatch/report records)
  repos/<name>/                       # canonical main checkout (git-ignored; regenerable)
  worktrees/<repo>/<branch>/          # real git worktrees (git-ignored; regenerable)
```

Session records live in a **flat `.ward/sessions/`** keyed by their workspace-unique id (a bare id
addresses them, [domain-model](../intent/01-concepts/00-domain-model.md), Identity), while their
**containment** is a field on the record and mirrored by the owning scope's `log/`. Addressing and
containment are different lookups on purpose (identity need not mirror containment).

## The spine, concretely (build order)

1. `store/frontmatter` + `store/schemas` + `store/doc` — typed, validated, canonical document I/O.
2. `store/paths` + `store/ids` — containment addressing and identity allocation.
3. `store/log` — append-only events and `fold(events) -> state`: **one** mechanism reused for
   derived status, session lifecycle, and wake state.
4. `domain/*` — the nouns as thin operations over the above and the seams.
5. `cli/*` — Commander wiring + two-audience output + cwd discovery.

Everything records into the store; nothing essential lives only in a live process (§16). Per-seam
design plans (`metadata-store.md`, `messaging.md`, `theming.md`, `remote-provider.md`, …) are added
here as the build reaches each seam, each opening with its own _Serves intent_ pointer.

## Deferred / carried from intent (no design commitment yet)

- The **concurrency primitive** for unavoidable shared writes
  ([metadata-store open question](../intent/02-subsystems/00-metadata-store.md)): v2 sidesteps locks
  structurally — logs are one-file-per-entry, each mutable record has a single owner, roll-ups are
  derived — and revisits only if a genuinely shared mutable record appears.
- The **append-vs-rewrite line** for evolving context vs. the cacheable prefix
  ([open-questions](../intent/00-foundation/open-questions.md)): v2 biases hard to append (logs
  append-only; records written once, state derived) and notes any unavoidable rewrite.
