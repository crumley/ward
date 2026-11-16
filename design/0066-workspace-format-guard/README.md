# 0066 — The workspace format guard

> A workspace records the format level its record needs of the Ward that reads it, a Ward that reads
> less refuses every verb that touches the record before parsing any of it, and
> `ward workspace upgrade` raises the level in the same commit as the shapes it guards.
>
> **Status:** built — awaiting review · **Started:** 2026-11-16

A workspace travels in git between machines, and each machine runs whatever `ward` it has. Nothing
in the record says which Ward it needs: `workspace.md` carries the version that created it, the
package version has been `0.1.0` since the first commit, and a journal commit says `(ward 0.1.0)`
whichever build wrote it. Two changes in two days showed what that costs.
[0064](../0064-floor-identity-palette/README.md) added `silver` to the closed set of floor colors
and has convergence write it on the ground floor; a Ward from before it then refuses floor 0's
record on every verb that reads the floors, with a schema error about a color and no word that the
binary is what is wrong. [0065](../0065-external-checkouts-and-repo-commands/README.md) added
`checkout: external` to the repository record; a Ward from before it drops the field, takes the
repository for a contained one whose checkout is missing, and its `workspace restore` clones it into
`repos/` — wrong, and silent. Both entries could only say so in prose.

The intent already draws the line: what blocks is a schema mismatch and never a version difference,
an older CLI on a newer workspace is refused, and a newer CLI on an older one reads freely
([`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md), _Version skew_).
No build has realized it, because until a second machine shared a workspace there was no older
binary to meet.

This entry builds it: a **format level** in the workspace record, a **guard** every Ward from here
on runs before it reads a record, the **raise** as a convergence step that reports what it costs
older Wards, and a **pin** that fails the gate when a record schema widens without the level moving.
It cannot reach back: a Ward built before this entry carries no guard, and what that means for the
two changes above is stated under _The limit_.

## Serves intent

- [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — _Version skew: what a mismatched CLI may do_: blocking follows the schema, so the marker is a
  level that moves only with the record's shape; the older-CLI case is refused, and refused wider
  than the slice says ([IF-001](intent-feedback.md)); the newer-CLI case reads and writes freely
  except for the one shape the workspace's level does not describe ([IF-003](intent-feedback.md));
  skew is surfaced as a doctor finding and as structure in `doctor --json`.
- [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — _How a workspace evolves_ and the update row of _Putting a workspace right_: the level is part
  of the record's own shape, so it is converged on the main line as journal, by the verb that owns
  convergence. The slice also says migration travels the stewardship path; where the two meet is
  [IF-002](intent-feedback.md).
- [`intent/02-subsystems/00-metadata-store.md`](../../intent/02-subsystems/00-metadata-store.md) —
  records are Ward-owned, closed, and versioned with the CLI: the level is that versioning made a
  fact in the record, and the guard sits in the document layer every record is read through.
- [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) — **§16**
  and **§17**: a Ward that cannot read the record says so rather than rendering a status from
  records it misread. **§20**: doctor, the completion callback and the candidate feed each have a
  named lesser answer in a workspace this Ward cannot read. **§6**: the raise is check-then-do, and
  a second run commits nothing.

## Scope

- **In:**
  - **The marker.** `format: N` in `workspace.md`'s front matter, a non-negative integer, last in
    the record. Absent means 0. A fresh workspace is created at the level of the Ward that made it.
  - **The levels.** `FORMAT_LEVELS` in `src/store/format.ts`: one entry per level, with the design
    entry that introduced it, what the record may carry from then on, what an older Ward loses, and
    optionally a `needs` predicate that recognizes a document only that level can read.
    `FORMAT_LEVEL` is the highest. There is one level today: **1**, the record as it stood at 0065
    plus the marker.
  - **The guard.** A Ward refuses a workspace whose marker is above its level, or is a marker it
    cannot interpret, with one message:

    ```text
    error: this ward is too old for the workspace at ROOT — the workspace needs a ward that reads
    workspace format N, and this ward (VERSION) reads up to format M. No record was read or written.
    Update ward on this machine, then run the command again; until then only ward doctor,
    ward --version and ward --help answer here.
    ```

    Exit 1, stdout empty, under `--json` too. It is raised in two places: where the CLI resolves the
    workspace a verb operates on, and in the document layer on every read and write.
  - **What still runs** in a workspace this Ward is too old for: `--version`, `--help`, bare `ward`,
    `doctor`, `schema`, `completion`, the four `shell` verbs, `workspace create` and the registry
    verbs `workspace list | path | default | unregister`. `doctor` reports the machine checks and
    one workspace finding, `workspace format`, carrying the refusal; it is unhealthy and exits 1.
    The completion callback and `shell candidates` exit 0 with nothing on stderr and offer nothing
    read from that workspace.
  - **`doctor --json` gains `format`**: `{ reads, workspace, readable }` — the level this Ward
    reads, the level the workspace records (null outside one, or when the marker cannot be
    interpreted), and whether this Ward may read it. Additive.
  - **The raise.** Convergence gains a step, `workspace format`, second in the list. Below this
    Ward's level it writes the marker and reports `format M → N —` followed by each crossed level's
    account of what older Wards lose; the write rides the run's one journal commit.
    `workspace upgrade` prints that line marked and undimmed, and `--json` carries it as the step's
    `detail`. A workspace below the level is a `warn` finding in doctor naming the upgrade.
  - **A shape waits for its level.** The document layer refuses to write a document that a level's
    `needs` recognizes into a workspace below that level, naming `ward workspace upgrade`.
    Everything else a newer Ward writes into an older workspace proceeds.
  - **The pin.** `test/fixtures/record-shapes.json` holds every record schema as JSON Schema beside
    the level it was pinned at. `test/store/format.test.ts` fails when a schema widens — accepts, in
    a field an older Ward knows, a value that Ward rejects — while the level is unmoved, and fails
    on any other shape change until the pin is rewritten.
  - **Tests**: `test/store/format.test.ts` (the marker's readings, the guard at the document layer,
    the write gate against a table of levels that do not exist yet, the widening rules, the pin) and
    `test/cli/format-guard.test.ts` (every verb in a too-new workspace, the set that still runs, a
    check that every verb the CLI has is in one of those two tables, doctor, the completion
    surfaces, the registry fallback, and the other direction: an unmarked workspace working as
    before, the raise, its rendering, its convergence).
- **Deferred:**
  - **Saying the guard exists in the workspace's `AGENTS.md`.** Safe to defer because the refusal is
    complete where it is met — it names the cause and the remedy — and the guidance file would only
    repeat it; changing the template also moves an installed artifact's default, which opens a
    reconciliation in every workspace for one sentence.
  - **Naming the Ward release that reads level N.** The refusal says "update ward" and cannot say to
    what, because the package version does not move with releases. Safe to defer because the remedy
    is the same whichever release it is — the newest — and the alternative, a version written beside
    the level, would be a second marker that could disagree with the first.
  - **A `needs` predicate for level 1.** Safe to defer because nothing needs it: every Ward that
    carries the guard reads `silver` and `checkout: external`, so no guarded Ward can be protected
    from them, and gating their writes in an unmarked workspace would only make a newer Ward refuse
    what it does today.
  - **Skew as a "what needs me?" item in `ward status`.** Safe to defer because doctor names it with
    its remedy, and a workspace below the level loses nothing while it waits — the cost of waiting
    falls on older Wards elsewhere, which the finding says.
- **Acceptance:**
  1. `env -u WARD_AGENT mise run check` is green.
  2. In a workspace whose marker is one above `FORMAT_LEVEL`, every verb in the `REFUSED` table of
     `test/cli/format-guard.test.ts` exits 1 with empty stdout and exactly the refusal on stderr,
     and the workspace's `HEAD`, working tree and worktree list are unchanged afterwards.
  3. Every `constant('…')` action in `src/cli/index.ts` appears in `REFUSED` or `STILL_RUNS`.
  4. In that workspace `ward doctor --json` parses under `doctorShape` with `format.readable: false`
     and one workspace finding.
  5. In a workspace with the marker removed, `ward status` and `ward task open` work,
     `ward workspace upgrade` adds one commit containing `workspace.md` with `format: N` as the last
     front-matter line, and a second run adds none.
  6. Adding a value to an enum in `src/store/types.ts` fails `test/store/format.test.ts` with the
     field named and the instruction to append a level.
  7. Two binaries, by hand: a Ward one level ahead raises a workspace; on a clone of it this build
     refuses every verb tried, and the pre-guard build does not (_The limit_).

## Design

### Decisions

- **A level, not the package version.** The version was the obvious marker — it is already in the
  record, and "needs ward ≥ X" is what a human expects to read. It lost because it does not carry
  the information: it has never moved, so two builds a schema apart share it, and a version that did
  move would move on every release, most of which change no record shape — the intent's rule is that
  only a schema mismatch blocks. The cost: the refusal cannot name the release to install.
- **In `workspace.md`, not a file of its own.** A separate `.ward/format` had one real advantage: no
  Ward rewrites it, whereas a pre-guard Ward that rewrites the workspace record drops a field it
  does not know. It lost because the workspace record is the one document that says what this
  workspace is, and a second file would be a second place to look for that; and because the rewrite
  it defends against does not happen in a converged workspace — a pre-guard Ward rewrites the record
  only to mint an id, record a main line, or advance a stamp that has never moved. The cost: if one
  ever does, the marker is dropped silently, doctor on a guarded Ward reports the workspace below
  its level, and the next upgrade puts it back.
- **Read by a line match, never through the schema.** Parsing the record with
  `workspaceRecordSchema` and reading `.format` is one line and was the first draft. It lost because
  the schema is exactly what a newer Ward may have changed: a record that no longer validates would
  raise a schema error before the guard could speak, which is the `silver` failure again. The guard
  reads `^format:` in the front matter and nothing else. A marker that is present and not a plain
  integer is treated as newer than this Ward, never as absent. The cost: the marker's spelling is
  frozen — it is the one line of the record that can never change shape.
- **Two gates.** Gating the CLI's workspace resolver alone covers every verb that operates on a
  workspace, and is where the refusal is cheapest and cleanest. It is not enough alone: `repo path`,
  `workspace register`, the completion suggesters, the candidate feed, doctor and the telemetry
  scope read all reach a workspace by other routes. Gating the document layer alone covers every
  route by construction, and is not enough alone either: several readers catch a failed read and
  degrade — a repository record that will not read is taken for a contained checkout — so a refusal
  thrown there can be swallowed into exactly the wrong answer. So the resolver refuses first, each
  other route is gated where it enters, and the document layer refuses again underneath as the net
  for a route nobody remembered. The cost is one `stat` of `workspace.md` per document read, with
  the verdict remembered per root for as long as the file is the same file.
- **What still runs is what does not read this workspace's record.** `doctor` is the exception that
  must run, because it is where a human is sent; it reports the one finding and skips every check
  that would read a record. `context` reads only `AGENTS.md` files and could have been let through;
  it is refused because it resolves the workspace like every other verb, and a narrower rule there
  would be a second rule. `repo path` refuses when any workspace its search would ask is too new,
  rather than skipping it: a skipped workspace that would have answered first is a different path
  returned silently.
- **Completions offer nothing, silently.** The alternative was to keep offering what can be read
  without parsing — repository names are file names. It lost because an offered name is a promise
  that the verb will take it, and every verb here refuses. The callback and the feed treat a too-new
  workspace as no workspace: exit 0, no stderr, no candidates from it.
- **The raise rides the convergence commit.** The alternative is the stewardship path the intent
  names for migration: put the raise on the upgrade's branch, so a human previews and merges the
  step that locks older Wards out. It is attractive for exactly that reason. It lost on ordering:
  convergence writes the new shapes on the main line directly
  ([0042](../0042-upgrade-owns-convergence/README.md)) — that is how `silver` arrived — so a marker
  that waits for a merge leaves commits on the main line holding a shape with nothing guarding it,
  and closing that gap means every converge step that writes a new shape must itself wait for the
  merge and run on a later upgrade. Riding the one journal commit makes the property structural: no
  commit holds a level's shape without its marker. The cost is that the raise is not previewed; the
  human's act is running the upgrade, and the upgrade's report is where the cost is stated
  ([IF-002](intent-feedback.md)).
- **A shape waits for its level; nothing else does.** `checkout: external` was written by an
  ordinary verb, not by convergence, so a level that only convergence respects would leave the same
  hole: a newer Ward writing a new shape into a workspace nobody has upgraded. Two wider rules were
  weighed. Raising the level from any verb that needs it closes the hole and removes the one moment
  the cost is announced. Refusing every write until the upgrade is the textbook rule and stops all
  work in a workspace on the day a binary updates. The narrow rule lost neither property: a level's
  `needs` predicate names the documents only it can read, and the document layer refuses those — and
  only those — below the level. The cost is that the predicate is written by hand and nothing checks
  it against the schema.
- **The pin is JSON Schema in a fixture, compared structurally.** A hash of the schemas would fail
  as reliably and tell the developer nothing. The fixture makes the shape change a reviewable diff,
  and the comparison separates what is mechanical from what is not (below).

### Layout

`src/store/format.ts` owns the levels, the marker's reading, the verdict and both refusals. It sits
in the store because the document layer calls it and it must depend on nothing above the file's
framing; it imports no schema. `src/store/document.ts` calls it on every read and write. Convergence
owns the raise as one more check-then-do step. The CLI's resolver, `locateRepo`, the registry's
`register`, the suggesters and the candidate feed each ask it where they enter a workspace; doctor
asks it before any workspace check.

### Mechanisms

- **Adding a level** is one step: append an entry to `FORMAT_LEVELS`. Convergence then raises every
  workspace to it, its `older` text is what the upgrade prints, a Ward without the entry refuses a
  raised workspace, and the pin test demands a re-pin against the new level.
- **Where the mechanical check stops.** The pin test compares each record schema with the pinned
  one. It **fails outright** when a schema _widens_ with the level unmoved: an enum or constant
  gains a value, a closed set opens, a type changes, a bound loosens, a pattern changes, a required
  field becomes optional or disappears. Those are the cases where an older Ward rejects a record the
  newer one writes, and `silver` is one. It **cannot decide** a new field: a Ward drops a field it
  does not know rather than rejecting it, so the comparison sees an addition and nothing more, and
  whether an older Ward then does the wrong thing is a question about behaviour. The external
  checkout field is that case. For it the test fails until the pin is rewritten, and the comment
  above the test asks the question to answer first. It **cannot see** a refinement's rule, or a
  field whose meaning changed while its type did not.
- **Fresh workspaces.** The record is written without the marker and the format step establishes it
  in the same run, reporting `format N` with no account of older Wards: nothing older ever read it.

### The limit

A Ward built before this entry does not read the marker, and nothing written now can make it. Level
1 therefore stops no existing binary; the guard holds from the first Ward that carries it, against
every level raised after.

For the two changes that motivated it, in a workspace raised to level 1:

- **`silver`.** A Ward from [0060](../0060-floor-identity/README.md) up to 0064 still fails on floor
  0's record with the schema error it fails with today — on `status` and on `workspace restore`
  alike, measured with the build at the commit before 0065. A Ward from before 0060 has no color
  field: by its schema it reads the floor and drops the color and emoji from any project record it
  rewrites (not trialed).
- **`checkout: external`.** A Ward from before 0065 still reads an external repository as a
  contained one with a missing checkout, and its `workspace restore` still clones it. Measured, in a
  workspace whose ground floor is not yet silver: the build at the commit before 0065 printed
  `restored  demo (cloned from …)` and left a clone at `repos/demo/`. Where the ground floor is
  silver — any workspace upgraded since 0064 — that same build fails on the color before it reaches
  the clone, so in practice the silent case is left to Wards older than 0060 and to workspaces not
  upgraded since 0064.
- **The build immediately before this entry** reads everything level 1 holds correctly and ignores
  the marker.

Whether anything cheap narrows this was tried rather than assumed. The candidate was to write the
first guarded level so that a pre-guard Ward fails on the workspace record — the one record a new
level is free to reshape — instead of limping. Measured against the build before this entry, with
`workspace.md` made invalid: `status`, `task list`, `repo list`, `task open`, `project open` and
`workspace restore` all ran and exited 0. A pre-guard Ward is written to degrade past a broken
workspace record, so breaking it stops nothing. What does stop every pre-guard Ward is an invalid
record among the floors, which nearly every verb reads; planting one — a sentinel project directory
whose name is the message — would work and was rejected: it is a permanent false record in every
workspace's tree, which every reader from now on must know to skip, to serve builds from a window
two days wide.

So the remedy for the past is operational and is what the raise to level 1 prints: update `ward` on
every machine that shares the workspace.
