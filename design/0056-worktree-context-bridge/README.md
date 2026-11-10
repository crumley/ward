# 0056 — The typed brief: a schema, one verb, and `task show`'s `brief`

> A task's brief becomes the first artifact Ward validates: `briefSchema` types it,
> `ward task brief` is its one write path, a lenient read keeps every hand-written brief working,
> and `ward task show` reports where it is and how it reads.
>
> **Status:** built — awaiting review · **Started:** 2026-11-08

The domain model makes a task's brief a first-class artifact with provenance, and the store says
every artifact type carries a runtime-validated schema, but Ward ships no schema and no write path
for it. A brief is a hand-written `brief.md` with no front matter, committed into the record tree
beside Ward, the very write [0045](../0045-agent-record-reads/README.md) told agents never to make.
And nothing tells the agent working a task where its brief is.

This entry gives the brief its schema and one verb, and makes `ward task show` the place an agent
finds it. It was first built as a worktree context bridge: a Ward-written pointer file in every task
worktree that named the floor's manifest and the brief, hidden from the repository by a git exclude.
[0057](https://github.com/crumley/ward/pull/127) replaced that with context read downward from the
workspace root, so the pointer, the exclude, and the root manifest's _Load your task_ bullet are
gone, and are recorded under _Decisions_ as the rejected alternative.

## Serves intent

- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Briefs_: the brief records
  who it is for and, when one exists, the session that wrote it.
- [`00-metadata-store.md`](../../intent/02-subsystems/00-metadata-store.md) — _Artifact types … each
  registered with a runtime-validated schema_: the seeded `brief` type gets its schema.
- [`05-context-loading.md`](../../intent/01-concepts/05-context-loading.md) — as revised by
  [#126](https://github.com/crumley/ward/pull/126): a session takes its scope from its record, and a
  task's brief is named by the task's own read surface rather than by a file inside the anchor,
  where Ward writes nothing.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _Long free-text arguments
  accept a file_: the brief's body comes from a file or stdin, never an inline string.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — §17 (the brief is written
  under the store lock and journaled).

## Scope

- **In:**
  - **The brief's schema.** `briefSchema` in `src/store/types.ts` defines `type: brief`, `for` (the
    task's address when recorded), and `createdAt`. It carries `session` only when `WARD_AGENT`
    names a recorded session. The brief stays at `<task dir>/brief.md`, beside `task.md`.
  - **`ward task brief [ADDRESS] FILE [--json]`.** `FILE` may be `-` for stdin. It replaces the
    brief with the file's text under fresh front matter and commits only `brief.md`, as
    `Record brief for task ADDRESS`. A file that already carries brief front matter contributes its
    body, so re-recording a typed brief converges. It refuses an empty body and front matter of
    another type. `ward schema task brief` documents the shape.
  - **The lenient read.** `brief.md` without front matter still counts as the task's brief.
  - **`task show`'s `brief`.** `ward task show --json` gains `brief: {path, standing}`, where
    `standing` is `typed`, `untyped`, `invalid`, or `absent`, from the lenient read. The path is
    named even when absent, since it is where `ward task brief` writes. The human view gains a
    `brief` line: the path, with what to do for an untyped or invalid one, or the verb to record
    one. `ward schema task show` carries the field.
  - **Doctor.** An `info` finding names each open task whose brief is untyped, with
    `ward task brief ADDRESS <its path>`. A `warn` names each open task whose brief claims the type
    and fails its schema.
  - **The root manifest.** Brief discovery joins 0055's _Establish your scope_ bullet: a task's
    brief is named by `ward task show ADDRESS --json` (`brief.path`), to be read before starting,
    and briefs are written with `ward task brief`. The 0055 default joins the root lineage.
  - **The floor manifest** names a task's brief as `brief.md` beside its `task.md`, which
    `ward task show` reports. The 0055 floor default joins the floor lineage.
- **Deferred:**
  - **`ward task open --brief FILE`.** _Safe to defer because_ `task open` then `task brief` is two
    verbs, each under the lock.
  - **A `brief` field in `task list`.** _Safe to defer because_ `task show` is the one-task surface
    an agent reads before it starts. A listing field is an additive schema change, cheap once a
    caller routes on it.
  - **Migrating existing briefs.** _Safe to defer because_ the lenient read keeps every one working
    unchanged, and doctor names each open task's brief with the one command that types it. The body
    is the human's handoff, so it is rewritten only by a verb the human runs.
  - **Briefs on floors and rooms, and verbs for other artifact types.** _Safe to defer because_ the
    brief's schema is the template, and none of those scopes has a write path that would need it.
    Rooms are not built yet, and a floor's knowledge has its notes (0055).
  - **Provenance with no source yet** (persona, `derivedFrom`). _Safe to defer because_ adding an
    optional field later invalidates no brief written now.
- **Acceptance:**
  1. `bun test test/workspace/briefs.test.ts` covers:
     - `task brief` commits only `brief.md`, writes the schema's front matter, replaces on a second
       run, and converges when handed its own output.
     - `session` is recorded for a recorded session id, and is absent for `WARD_AGENT=1`.
     - It refuses an empty body and foreign front matter, writing nothing.
     - An untyped brief is named by doctor and typed in place by the CLI with its body intact. Its
       `--json` parses as `taskBriefShape`.
     - An invalid typed brief is a `warn`.
     - `-` reads stdin, and a missing file is refused.
     - `task show` reports `brief: {path, standing}` for each of `absent`, `typed`, `untyped`, and
       `invalid`, parsing as `taskShowShape`, and its human `brief` line says the same.
  2. `bun test test/workspace/lineage.test.ts test/workspace/floor-manifest.test.ts` pins the 0056
     root and floor manifests and finds each 0055 default in its history.
  3. `bun install --frozen-lockfile && env -u WARD_AGENT mise run check` exits 0.

## Design

- **Decisions:** no new ADRs. The store stack ([ADR 0005](../decisions/0005-store-stack.md)) governs
  the brief document. Entry-local:
  - **The brief is found through `task show`, not through a file in the worktree.** _Alternative:_
    the entry's first build. A Ward-written `CLAUDE.local.md` at the root of every task worktree
    named the floor's manifest and the brief, as prose and as `@` imports. It was excluded through
    one line in the repository's common `info/exclude`, converged by `worktree create`,
    `workspace restore`, and `task brief`, and checked by a doctor finding. _Attractive_ because
    Claude Code loads that file natively wherever the agent stands, with no instruction to follow.
    _Lost_ to [0057](https://github.com/crumley/ward/pull/127), and IF-001 is declined with it. A
    custom, harness-specific context file written into each worktree and hidden by a git exclude
    works against the grain of how harnesses load guidance, and is non-standard and unreliable. It
    wrote into a repository's git directory, which Ward does not own, and every other harness still
    depended on an instruction. Context instead arrives through standard `AGENTS.md` files read
    downward from the root, and a task's brief is named by `task show`, the task's own read surface.
    _Cost:_ one more command before an agent starts, which the root manifest names.
  - **Lenient read, no migration.** _Alternative:_ type every existing `brief.md` on upgrade.
    _Attractive_ because every brief would validate at once. _Lost_ because the upgrade writes into
    task directories it does not otherwise touch, and closed tasks' briefs are settled history. The
    lenient read loses nothing. _Cost:_ two shapes of brief coexist until each is re-recorded.
  - **`task brief` replaces, it does not append.** _Alternative:_ an append, like `project note`.
    _Attractive_ for symmetry and history. _Lost_ because a brief is one handoff, read whole, and
    git already keeps every version. _Cost:_ a replaced brief is read back from history, not the
    file.
  - **`for` is the address at the time of recording.** _Alternative:_ the room code, as session
    records store it. _Attractive_ because a room code never changes meaning inside its task
    directory. _Lost_ because the brief is read on its own, and the address is what a reader acts
    on. The task directory still pins it after the room is reused. _Cost:_ a closed task's brief
    names an address that may later belong to another task, and containment disambiguates.
- **Layout:** `src/workspace/briefs.ts` holds `briefPath`, the lenient read, and the write verb.
  `taskDetail` in `src/workspace/status.ts` reads the brief through it for `task show`, and doctor
  reads it for its findings. The verb imports no status code, so there is no cycle.
- **Mechanisms:**
  - `recordBrief` resolves the declared session before taking the lock. Under the lock it writes and
    commits `brief.md`.
  - `taskDetail` adds `brief: {path, standing}` from `readBrief`. It is a read, so it takes no lock.
