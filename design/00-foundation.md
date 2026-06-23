# Design: Foundation — stack, module layout, the spine

> **Serves intent:** the whole [`intent/`](../intent/) tree, but concretely the
> [metadata-store seam](../intent/02-subsystems/00-metadata-store.md) (the store core),
> [domain-model](../intent/01-concepts/00-domain-model.md) (the nouns), and
> [human-shell](../intent/02-subsystems/07-human-shell.md) (the CLI shape). This is the "spine
> first" plan [`README.md`](README.md) calls for; per-seam plans live in sibling files.

This file fixes the **build choices** for the spine. The _why_ behind each tool is in
[`../build/decisions/`](../build/decisions/) (ADRs 0001–0006); this plan records the **shape** they
produce and the module layout [`src/`](../src/) mirrors.

## Stack (see ADRs for rationale)

- **Language/runtime:** TypeScript on Node ≥24 (dev: 26), run via native type-stripping — no build
  step ([0001](../build/decisions/0001-language-and-runtime.md)).
- **Execution/tests:** `node <file>.ts` and `node --test`; `node:test` + `node:assert/strict`;
  `tsc --noEmit` as a separate type gate
  ([0002](../build/decisions/0002-execution-and-test-runner.md)).
- **Schemas:** Zod, discriminated union on the `type` field = the document catalog
  ([0003](../build/decisions/0003-zod-schemas.md)).
- **Front matter:** `yaml`, wrapped for canonical (deterministic) serialization
  ([0004](../build/decisions/0004-frontmatter-determinism.md)).
- **CLI:** Commander, noun→verb tree ([0005](../build/decisions/0005-cli-framework-commander.md)).
- **Git:** shell out to the `git` binary behind a thin wrapper
  ([0006](../build/decisions/0006-git-integration-shell-out.md)).

Erasable-only TS (no `enum`/parameter-properties/`namespace`); explicit `.ts` import extensions;
`verbatimModuleSyntax` + `erasableSyntaxOnly` enforce it.

## Module layout (`src/` mirrors this)

```
src/
  store/            # the metadata-store seam realization (ADR 0003/0004)
    frontmatter.ts  # canonical YAML front-matter parse/serialize (the only writer of front matter)
    schemas.ts      # Zod schema per document type; the discriminated-union catalog
    paths.ts        # workspace path layout; dir nesting = scope containment; scope <-> path
    doc.ts          # typed read/write: parse+validate on read, validate+canonical-write on write
    log.ts          # append-only event logs (one file per entry) + folding events -> state
    ids.ts          # identity allocation: floor numbers, room codes, slugs, session ids
    workspace.ts    # locate the workspace root; load/save the workspace record
  domain/           # operations on the nouns, built on store/ (no CLI, no framework here)
    project.ts  task.ts  worktree.ts  room.ts  session.ts  status.ts  recovery.ts
  seams/            # swappable machinery behind thin adapters
    git.ts          # git binary wrapper (ADR 0006)
    harness.ts      # agent-harness adapter: start/handle/resume/locate over a stub runtime
    theming.ts      # deterministic accent + per-type glyph
    messaging.ts    # dispatch/report/wake, recorded-first
    remote.ts       # remote provider stub + the privacy translation gate
    reflection.ts   # scope-boundary reflection map-reduce + cursor
  cli/              # the human shell (ADR 0005)
    index.ts        # #!/usr/bin/env node — Commander program, noun subcommands
    output.ts       # two-audience rendering (human text vs --json); caller-identity detection
    context.ts      # ambient agent-signal (env) parsing
```

**Why this layout.** It mirrors the seams so the triangle (design↔src↔test) is legible: `store/` is
the metadata-store seam, each `seams/*` file is one subsystem contract, `domain/` is the concept
layer that depends only on the store and seams, and `cli/` is the thin human-shell plumbing that
depends on `domain/` — never the reverse. The dependency arrows point inward (cli → domain → store +
seams), so the core is testable without the CLI, exactly as the human-shell seam requires.

## On-disk workspace layout

The store is a filesystem; **directory nesting expresses scope containment**
([metadata-store](../intent/02-subsystems/00-metadata-store.md)). Detailed in
[`metadata-store.md`](metadata-store.md); the shape:

```
<workspace-root>/
  .ward/                          # the metadata store (git-tracked)
    workspace.md                  # type: workspace — version stamp, repos, model defaults
    personas/<name>.md            # the default cast (type: persona)
    projects/<floor>-<slug>/      # a project (floor); dir nesting = containment
      project.md                  # type: project (NO status field — derived)
      log/                        # append-only event log (one file per event)
      tasks/<slug>/
        task.md                   # type: task (records its own state)
        log/
        artifacts/                # task-scope artifacts (briefs, notes, …)
        worktrees/<repo>__<branch>.md   # type: worktree (natural key)
        rooms/<roomcode>/
          room.md                 # type: room (records open/closed)
          log/
          artifacts/
    wakes/<id>.md                 # type: wake (armed/satisfied via its log)
    messages/<id>.md              # type: message (dispatch/report records)
    reflections/<scope>/<goal>.md # reflection output + cursor
  repos/<name>/                   # canonical main checkout (git-ignored; regenerable)
  worktrees/<repo>/<branch>/      # real git worktrees (git-ignored; regenerable)
  .gitignore                      # tracks .ward/, ignores repos/ + worktrees/
```

**Why `.ward/` under the root, repos/worktrees ignored:** the durable, small, versionable state
(§15) lives in `.ward/` and is committed; the large, regenerable git checkouts are ignored (they
restore from origin + recorded branches), so the workspace git stays light and the record is the
source of truth (§16).

## The spine, concretely

1. `store/frontmatter` + `store/schemas` + `store/doc` — typed, validated, canonical document I/O.
2. `store/paths` + `store/ids` — containment addressing and identity allocation.
3. `store/log` — append-only events and `fold(events) -> state` (the basis for derived status,
   session lifecycle, wake state — one mechanism, reused).
4. `domain/*` — the nouns as thin operations over the above.
5. `cli/*` — Commander wiring + two-audience output.

Everything records into the store; nothing essential lives only in a live process (§16).

## Open / deferred (carried from intent)

- The **concurrency primitive** for the few unavoidable shared writes: v1 sidesteps locks by making
  logs one-file-per-entry (structural no-lost-updates) and giving each mutable record a single
  owner; revisit if a genuinely shared mutable record appears
  ([metadata-store open question](../intent/02-subsystems/00-metadata-store.md)).
- The **append-vs-rewrite line** for evolving context vs. the cacheable prefix
  ([open-questions](../intent/00-foundation/open-questions.md)) — v1 biases hard to append (logs are
  append-only; records are written once and state is derived) and notes where rewrite is
  unavoidable.
