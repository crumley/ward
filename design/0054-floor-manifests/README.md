# 0054 — Floor manifests: an `AGENTS.md` and notes for every floor

> Every floor that is not closed carries a manifest beside its record: Ward's part (`AGENTS.md`, the
> same on every floor and lineage-tracked) and the floor's part (`notes.md`, appended through
> `ward project note`), so a session on a floor loads what that floor has learned.
>
> **Status:** built — awaiting review · **Started:** 2026-11-08

The context-loading slice makes each level's `AGENTS.md` the manifest for that level, and the
lifecycle slice composes an artifact from Ward's part and the workspace's own, in that order
([`05-context-loading.md`](../../intent/01-concepts/05-context-loading.md),
[`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)). Only the root
has a manifest ([0017](../0017-claude-md-symlink/README.md),
[0020](../0020-deterministic-upgrade/README.md)). A floor has a `project.md` and nothing an agent
can read as "how we work here", so what a floor learns about its repositories, its gate, and its
conventions dies with the session that learned it.

[0051](../0051-floor-scope-sessions/README.md) made the gap sharper. A floor session is now a
recorded, launchable thing, and it stands at the workspace root, so a harness that loads guidance by
working directory reads the root's manifest and never the floor's. A floor manifest is only useful
if the session it is for is pointed at it. This entry builds the manifest, writes it at
`project open`, backfills it on every converge, brings it forward on upgrade, names its gaps in
doctor, points a launched floor session at it, and gives agents one verb to add to the floor's
notes. The worktree bridge that carries a floor's manifest into its tasks' worktrees builds on the
accessor this entry exposes.

## Serves intent

- [`05-context-loading.md`](../../intent/01-concepts/05-context-loading.md) — _Context loads from an
  `AGENTS.md` hierarchy_: the floor level gets its manifest, served to Claude Code through a link
  rather than a copy; and _two zones_: Ward's identical part loads first and caches, and the floor's
  notes load after it.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md) — _Compose
  first_: the floor manifest is composed from separately addressable parts, so an upgrade replaces
  Ward's part and never touches the floor's; _Divergence must be detectable_: Ward's part has a
  lineage, so an untouched one moves forward and a hand-edited one is kept and named.
- [`01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md) — _Charge
  nurse_: the role that holds a project's status needs that project's working knowledge in front of
  it, and the floor session that plays it is now told where that knowledge is.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — §13 (the workspace compounds:
  a floor's lessons outlive the session that learned them), §16 (one source of truth: `CLAUDE.md` is
  a link), §17 (notes are written under the store lock and journaled, like every record write).

## Scope

- **In:**
  - **Three files per floor**, at `projects/<floor>-<slug>/` beside `project.md`:
    - `AGENTS.md` — `FLOOR_AGENTS_MD`, byte-identical on every floor. It says what the directory is,
      where the floor's facts live (`project.md`), what belongs in the notes and what does not, and
      how to add to them. It ends with a `@notes.md` import line, after all of Ward's prose.
    - `CLAUDE.md` — a relative link to `AGENTS.md`.
    - `notes.md` — seeded once with a header naming the floor's slug, the rule, and a dated first
      bullet. After that, only `ward project note` writes to it, and it only appends.
  - **Written at `ward project open`**, with the record, in the same journal commit.
  - **Backfilled by converge** (`workspace create`, and phase 1 of `workspace upgrade`,
    [0042](../0042-upgrade-owns-convergence/README.md)) as the `floor manifests` step, after the
    standing project. It fills in whichever of the three files a floor that is not closed lacks, and
    never touches a file that is there.
  - **Upgraded through the lineage.** The upgrade's artifact pass decides each floor's `AGENTS.md`
    exactly like the root's: current, stale (upgraded), missing (installed), or customized (kept and
    named as residue). `notes.md` is never in the pass.
  - **`ward project note FLOOR TEXT [--json]`.** It appends `- <UTC date> — TEXT` to the floor's
    `notes.md` under the store lock and commits it as `Note on floor N`. It refuses empty text, more
    than one line, an unknown floor, or a closed one. A floor whose notes are missing is seeded
    first. `ward schema project note` documents the shape.
  - **The load path.** A launched or resumed floor session gets `WARD_FLOOR_MANIFEST`, the absolute
    path of its floor's `AGENTS.md`, beside `WARD_AGENT`. The root manifest tells an agent to read
    it and the notes beside it before starting, how a self-recorded floor session finds the same
    file, to read a task's floor's notes too, and to add to them with `ward project note`.
  - **Doctor.** One `floor manifests` finding: `ok` when every floor that is not closed carries all
    three files, otherwise one `info` per floor naming each gap, with `ward workspace upgrade` as
    the remedy where a file is missing.
  - **The root manifest** gains the layout sentence and the _Load your floor_ bullet. The outgoing
    0053 default joins the root lineage.
- **Deferred:**
  - **The worktree bridge.** Carrying a floor's manifest into its tasks' worktrees is the next
    entry. _Safe to defer because_ this entry gives it everything it needs to read:
    `floorManifestPaths(projectDir)` names the three files, and `FLOOR_MANIFEST_ENV` is the variable
    a task session can be started with. Until it lands, the root manifest's bullet tells a task's
    agent to read its floor's notes.
  - **Importing the ground floor's notes from the root manifest.** Since
    [0041](../0041-ground-floor/README.md) the ground floor's directory is the same in every
    workspace, so the import would no longer break the root's lineage. _Safe to defer because_ 0051
    separates the two scopes: a workspace-scope session holds every floor's status, and the ground
    floor's session owns the workspace's own work. Loading the ground floor's notes into every root
    session would merge the two again. A floor-0 session already gets them through its own manifest.
  - **Graduating notes into a stable prefix, and promoting them between floors.** _Safe to defer
    because_ both need artifact provenance and a rule for when a note has stopped changing. That
    should be shaped by real notes. The notes file is append-only and dated, so nothing written now
    blocks either later.
  - **Harness-native injection** of the floor manifest (a system-prompt flag per adapter). _Safe to
    defer because_ the environment variable reaches every harness through one code path. A native
    flag is an adapter-surface addition, made once there is a reason to prefer one harness's
    mechanism.
  - **Manifests on closed floors.** _Safe to defer because_ a closed floor takes no tasks and no
    sessions, so nothing would load one. Whatever a closed floor already carries is left alone, and
    doctor does not ask about it.
  - **A per-floor `agent:` block, and a verb to read notes.** _Safe to defer because_ the notes are
    a markdown file that is read directly, as records are, and agent configuration per scope is
    [0051](../0051-floor-scope-sessions/README.md)'s deferral, unchanged here.
- **Acceptance:**
  1. `bun test test/workspace/floor-manifest.test.ts` covers:
     - The template: its hash is pinned with an empty, distinct history. It names no ordinary floor
       and ends in `@notes.md`.
     - The lineage expands to one exact path per floor that is not closed. It classifies current,
       stale against a historical hash, and customized.
     - `project open` writes four files in one commit, with a relative `CLAUDE.md` link and the
       seeded notes, and every floor's `AGENTS.md` is the same bytes.
     - Converge on six floors (one closed, no manifests) writes on floors 0, 1, 2, 4, and 5, skips
       3, and is idempotent. It leaves a floor's own `CLAUDE.md` alone.
     - Upgrade keeps a hand-edited floor `AGENTS.md` byte-identical and names it as residue.
     - `notes.md` survives `project open`, converge, upgrade, and doctor byte-identical.
     - `project note` appends exactly one dated line and commits only the notes file. It seeds
       missing notes, refuses four cases with nothing written, and its `--json` parses as
       `projectNoteShape`.
     - Doctor: `ok` with every floor manifested, one `info` per floor naming each gap, and nothing
       about a closed floor.
     - A floor-1 and a floor-0 launch carry `WARD_FLOOR_MANIFEST` with the right absolute path, and
       a workspace launch carries none.
  2. `bun test test/workspace/lineage.test.ts` shows the 0053 root manifest in history and the 0054
     default pinned.
  3. `bun test test/workspace/create.test.ts test/workspace/converge.test.ts test/cli/converge.test.ts test/workspace/upgrade.test.ts test/cli/upgrade.test.ts test/cli/mutation-json.test.ts`
     carries the fourteenth create step and the ground floor's `AGENTS.md` row in the upgrade
     report.
  4. `bun install --frozen-lockfile && env -u WARD_AGENT mise run check` exits 0.

## Design

- **Decisions:** no new ADRs. The store stack ([ADR 0005](../decisions/0005-store-stack.md)) governs
  the files this entry adds to the record tree. Entry-local:
  - **Ward's part is identical on every floor.** _Alternative:_ a per-floor template naming the
    floor's number, slug, and claims. _Attractive_ because the manifest would read as the floor's
    own, with no hop to `project.md`. _Lost_ because every instance would hash differently, so the
    lineage could not tell an untouched instance from an edited one without re-rendering each
    floor's history. The claims also change under `project claim`, which would make an untouched
    manifest stale on every claim. And the shared prefix would stop caching across floors. _Cost:_
    one more file to read, which the manifest names.
  - **The floor's part is its own file, not a tail section of `AGENTS.md`.** _Alternative:_ one
    file, with Ward's prose above a marker and the notes below it. _Attractive_ because there is one
    file to read and nothing to import. _Lost_ because any note would change the file's hash, so
    every floor with notes would read as customized and the upgrade could never bring its Ward-owned
    part forward. That is exactly the conflict composition exists to prevent. _Cost:_ a harness that
    does not expand `@notes.md` reads the notes as a second file, and the manifest says so.
  - **The notes are seeded once, never left uncreated.** _Alternative:_ create `notes.md` on the
    first note. _Attractive_ because an empty floor carries no file. _Lost_ because the manifest's
    import and its instruction would then point at a file that may not exist, and a floor with no
    file says nothing about where notes go. The seed's header _is_ the rule. _Cost:_ a five-line
    file on floors that never take a note.
  - **Notes are written through a verb.** _Alternative:_ let an agent append to the file directly.
    _Attractive_ because appending to markdown is something an agent already does well, and a verb
    is one more surface. _Lost_ because the file sits in the record tree, and the root manifest's
    rule since [0045](../0045-agent-record-reads/README.md) is that an agent never writes there
    except through `ward`. A direct append would also sit uncommitted in the workspace's own tree
    until something swept it into an unrelated journal commit. The verb gives the write the lock and
    its own commit. A human may still edit the file, since it is the floor's. _Cost:_ one verb, and
    a one-line limit per note.
  - **Floor manifests carry no baseline.** _Alternative:_ fingerprint each floor's `AGENTS.md` in
    `.ward/baselines.md`, as converge does for root artifacts. _Attractive_ for symmetry. _Lost_
    because baselines exist for defaults the lineage did not know yet
    ([0005](../0005-agent-audience/README.md), [0020](../0020-deterministic-upgrade/README.md)), and
    the floor lineage is complete from its first default. A baseline per floor would also put a
    baselines write into every `project open`, or else leave the next upgrade a backfill to make for
    nothing. The first build did fingerprint, and that is how this surfaced: a workspace whose
    floors were opened by `project open` manufactured an upgrade vehicle just to record their
    hashes. _Cost:_ doctor's baseline checks do not cover floor manifests, and a customized one
    shows only in the upgrade's residue.
  - **Many instances, expanded to exact paths.** _Alternative:_ a path pattern
    (`projects/*/AGENTS.md`) on `ArtifactLineage`, matched by the upgrade. _Attractive_ because
    there would be one entry and one shape. _Lost_ because every consumer of the lineage would have
    to learn patterns, and the root lineage shape is shared with code this entry has no reason to
    touch. `floorManifestLineages(projects)` returns ordinary exact-path entries, one per floor that
    is not closed, and the upgrade concatenates them after the root's. _Cost:_ the floor history
    lives in its own constant, guarded by its own pin.
  - **The load path is an environment variable plus the root manifest's instruction.**
    _Alternatives:_ launch a floor session in its project directory, which 0051 rejected because a
    record directory is where an agent is told not to write; pass the manifest through each
    harness's own system-prompt flag; or have the agent derive the path from its id (`f7-1@mbp`). _A
    launch in the floor directory is attractive_ because Claude Code would load the floor's
    `CLAUDE.md` natively. _A harness flag is attractive_ because loading would not depend on the
    agent following an instruction. _They lost_ because one breaks 0051's decision and the other
    grows the adapter seam per harness. _Derivation lost_ because it is a guess about the directory
    layout, which an agent should never be asked to make. Ward knows the floor at launch and says
    it. _Cost:_ loading is one instruction-following step, read from the root manifest that every
    root session already loads. A self-recorded floor session reads the path from the manifest's
    rule instead.
  - **Closed floors are skipped everywhere.** The reason is the deferral in Scope. A floor that
    closes keeps what it carried, so closing never deletes the floor's notes.
- **Layout:** `src/workspace/floor-manifest.ts` is the one home for where a floor's manifest lives
  (`floorManifestPaths`), which floors carry one (`carriesManifest`), how one is established
  (`establishFloorManifest`), the seed, the lineage expansion and its history, and the load-path
  variable's name. It imports no project reader, so the project module, converge, upgrade, doctor,
  and the launch path all depend on it without an import cycle. The note verb lives with the other
  project mutations in `projects.ts`. `lineage.ts` changes only by the one history entry the root
  manifest owes, and `create.ts` does not change.
- **Mechanisms:**
  - `openProject` calls `establishFloorManifest` inside its lock before it commits the floor
    directory. Converge's step calls the same function per floor that is not closed, and stages
    exactly what it wrote.
  - `assessUpgrade` builds its list as the root lineage followed by the tree's floor lineages, and
    runs the existing decide loop over it. The baseline loop still reads only the root lineage.
  - `launchSession` and `resumeSession` build the child's environment in one `sessionEnv`. A floor
    that no longer resolves names no manifest rather than failing a resume.
