# 0057 — Context from the root: every session starts at the root and reads downward

> Every session starts at the workspace root, learns its scope from its own record, and reads each
> `AGENTS.md` on the path from the root down to where it works; task worktrees move under their
> floor, to `floors/<N>-<slug>/`, so that path passes through the floor's manifest.
>
> **Status:** accepted (2026-11-10) · **Started:** 2026-11-09

Two entries in review each built a custom mechanism to get one level's context to the session that
needs it. [0055](https://github.com/crumley/ward/pull/123) gives every floor a manifest beside its
record, then has to start a floor session with `WARD_FLOOR_MANIFEST`, because floor sessions stand
at the workspace root ([0051](../0051-floor-scope-sessions/README.md)) and loading keyed to the
working directory never reaches the floor's directory.
[0056](https://github.com/crumley/ward/pull/125) has the same gap one level down: a task worktree
sits under `worktrees/`, not under its floor, so it writes a Claude Code–named `CLAUDE.local.md`
into every worktree and hides it from the repository with a git exclude. Both mechanisms still
depend on the agent following an instruction under any other harness. Each answers one case, and
each goes against how harnesses load guidance.

The cause is the same both times. The context-loading slice keys context to the directory a session
_starts_ in, and Ward deliberately starts sessions at the root. This entry turns that around. The
root is where every session starts, and it is the one place every harness is sure to load. The
session's scope comes from its identity (`WARD_AGENT` names its record). One harness-neutral rule in
the root manifest takes it downward: before working in a directory, read each `AGENTS.md` on the
path to it. The layout then makes the path carry the context, with a task's worktree under its
floor's directory, where the floor's manifest sits. That makes the env variable, the pointer file
and the exclude unnecessary.

Now is the moment, because neither mechanism has merged. 0055 and 0056 are reworked on their own
branches, so the ledger never records a mechanism that is already dropped. The intent change this
rests on is its own pull request ([#126](https://github.com/crumley/ward/pull/126)), and
[`intent-feedback.md`](intent-feedback.md) carries it with exact before and after text.

## Serves intent

- [`05-context-loading.md`](../../intent/01-concepts/05-context-loading.md): _Context loads from an
  `AGENTS.md` hierarchy_, as revised by [IF-001](intent-feedback.md). Sessions start at the root,
  take their scope from identity, and read downward, and the `floors/` layout is what makes the path
  carry each level's guidance. The slice's _Left to implementation_ leaves the layout and the
  reading aids to this entry.
- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md): _Working directory: the
  second axis_. Scope is fixed when the session starts, and the directory it works in follows the
  work. _Anchor_: a task's worktree is still an anchor, and only its location on disk changes.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md): _Putting a
  workspace right_. `ward workspace upgrade` brings an existing workspace's layout forward to the
  one this release expects, and `ward workspace restore` re-materializes it on a fresh clone.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md): §5, harness-agnostic, because
  the mechanism is a directory path and an `AGENTS.md`, not a harness's filename. §16, one source of
  truth, because a floor directory holds links onto the record and never copies. §17, because
  worktree paths in the record change only through `ward`, under the lock, with a journal commit.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md): _Organized around nouns and
  verbs_. `ward context PATH` is one read verb that names a chain the layout already implies.

## Scope

- **In:**
  - **The `floors/` tree.** For every floor that is not closed, `floors/<N>-<slug>/` is a view of
    that floor, named after its record directory `projects/<N>-<slug>/`. A floor is its project's
    address, so the view is a working place for that project, never a second record. It holds three
    relative links: `AGENTS.md` → `../../projects/<N>-<slug>/AGENTS.md`, `CLAUDE.md` → `AGENTS.md`,
    and `notes.md` → `../../projects/<N>-<slug>/notes.md`. It also holds the floor's task worktrees.
    Nothing else is written there. The whole tree is ignored by the workspace's git: `/floors/`
    joins `IGNORE_LINES`. Converge establishes it in three places: `ward project open`, the
    `floor views` step in phase 1 of `workspace upgrade`, and `workspace restore`. Each fills in
    only what is missing and never replaces a file that is there.
  - **Where a worktree is placed.** A new task worktree on floor N is created at
    `floors/<N>-<slug>/<address>-<branch>`, a stewardship worktree included. The directory name is
    the same one `worktrees/` uses today, so only its parent changes. A legacy bare task
    (`legacy-t<room>`, [0053](../0053-legacy-task-address/README.md)) has no floor, so its worktrees
    stay at `worktrees/` while it is open, and that directory is retired once nothing holds it (next
    bullet).
  - **Retiring `worktrees/`.** `floors/` becomes the one home for working checkouts, and
    `worktrees/` is removed shortly after the last worktree in it goes away. Phase 1 of
    `ward workspace upgrade` gains a `retire worktrees/` step, after `worktree placement`. It acts
    only when three things hold:
    1. no worktree record of a task that is not closed names a path under `worktrees/`, which after
       placement can only be an open legacy bare task's;
    2. `git worktree list --porcelain`, in every canonical checkout and in the workspace's own
       repository, names no checkout under `worktrees/`;
    3. nothing else is left in the directory.

    Then it removes the empty directory (`rmdir`, never recursive) and drops the `/worktrees/` line
    from the workspace's `.gitignore`, in one journal commit (`Retire worktrees/`). While any of the
    three fails, the step lists what holds the directory as residue and changes nothing. An open
    legacy task is named by its address. Anything left behind, such as a checkout a close did not
    tear down or one no record names, is listed with the command that removes it
    (`git -C repos/<name> worktree remove <path>`). The step never deletes a checkout itself,
    because a checkout left behind may hold the only copy of some work. In the layout code,
    `worktrees` leaves `SCOPE_DIRS`, so converge no longer recreates the directory, and
    `/worktrees/` leaves `IGNORE_LINES`. Doctor's ignore check expects the line only while the
    directory exists. A workspace with no open legacy bare task, like every workspace whose legacy
    tasks have all closed, retires the directory on its first upgrade once its leftovers are
    cleared. No new bare task can be opened, so the set that holds `worktrees/` only shrinks, and
    the step converges on its own as those tasks close. A legacy task's closed records keep the
    `worktrees/` paths they had, since those paths are history.
  - **The migration.** Phase 1 of `ward workspace upgrade` gains a `worktree placement` step, after
    `floor views`. For every worktree of an open floor task whose recorded `path` is not its
    placement, it does three things:
    1. **Find the worktree on disk.** It reads where the worktree actually is from
       `git worktree list --porcelain` in the source repository, matching the branch: the canonical
       checkout `repos/<name>`, or the workspace's own repository for the stewardship case. It never
       infers the location from the record alone.
    2. **Move it**, with `git worktree move <actual> <placement>`, run from that repository. A
       worktree that is dirty is refused and named. So is one with an open session whose working
       directory lies inside it, and so is one that git refuses to move (locked, or holding
       submodules). The move is never forced.
    3. **Update the record.** It rewrites the worktree record's `path` under the store lock, one
       journal commit per task (`Move worktree <branch> for task <address> to floors/`). On a second
       machine, where the record already says `floors/`, step 3 is a no-op and only the move runs.

    Every refusal is listed as residue with its reason, and the step converges: run the upgrade
    again once the worktree is clean or the session closed. The worktrees of closed tasks are
    already torn down, and their records keep the path they had, since that path is history.
  - **`workspace restore`.** A worktree whose record names `floors/` is created there, as today. If
    the branch is already checked out at another path, which is how a clone that missed the move
    looks, restore moves that checkout instead of cutting a second one. It then establishes the
    floor views.
  - **Doctor.** No check expects `worktrees/` to exist. One `floor views` finding: `info` per open
    floor whose view is missing or whose links do not resolve to its record, with
    `ward workspace upgrade` as the remedy. One `worktree placement` finding: `info` per open floor
    task's worktree that is not at its placement, naming the reason the last move would refuse if
    one applies (dirty, an open session inside it). The existing missing-worktree check reads the
    record's `path` and needs no change.
  - **Task sessions default to the root.** `ward session open TASK` without `--dir` records
    `workingDirectory: .`. Today it guesses the task's first worktree. `--dir` still records what
    the caller names.
  - **`ward context PATH [--json]`.** It prints, in order, every `AGENTS.md` on the path from the
    workspace root down to `PATH`, root first and nearest last. It also prints the `CLAUDE.md` or
    link that serves each one, and whether each resolves. `PATH` defaults to the current directory,
    and a path outside the workspace is refused. `ward schema context` documents the shape. The verb
    is read-only and takes no lock.
  - **The root manifest.** Three changes, and the outgoing default joins the lineage:
    - the `floors/` layout sentence, in place of `worktrees/`;
    - the _Establish your scope_ and _Read downward_ bullets, whose text is in
      [The root manifest's rule](#the-root-manifests-rule);
    - _Work in the task's worktree_ names `floors/<N>-<slug>/` and `ward context`.
- **Deferred:**
  - **Removing `--dir`.** The record keeps working directory as an axis, and some human may
    legitimately start a session elsewhere. _Safe to defer because_ Ward never chooses anything but
    the root, and the manifest never tells an agent to use the flag. If no one passes it for a
    while, removing it is a one-flag change.
  - **Harness-native assists.** One example is starting Claude Code with its _Project instructions_
    set to `claude-md-and-agents-md` through `--settings`, so it also loads a repository's
    `AGENTS.md` when that repository has no `CLAUDE.md` (see the harness table). Another is a pi
    extension that loads nested `AGENTS.md` files. _Safe to defer because_ the reading rule does not
    depend on them. Under design rule 4 they are alternates beside the baseline, adopted once real
    sessions show which layers are being skipped.
  - **`ward context --session ID`**, the chain for a session's scope instead of for a path. _Safe to
    defer because_ the scope is one `session show` away, and the path form already serves every case
    where the agent knows where it is about to work.
  - **Workdirs.** The workdir anchor kind is not built. When it is, it follows the same rule at
    `floors/<N>-<slug>/<address>-<name>/`. _Safe to defer because_ nothing creates one today, and
    `/workdirs/` stays ignored.
  - **Moving legacy bare tasks' worktrees.** _Safe to defer because_ legacy bare tasks have no floor
    and so no floor manifest to pass through. Moving them would change nothing an agent loads, and
    the pool only shrinks. Retirement removes `worktrees/` once the last of them is gone.
- **Acceptance:**
  1. `bun test test/workspace/floor-views.test.ts` covers the following:
     - `project open` writes three links for the new floor. They resolve to the record's files, and
       `git status --porcelain` stays empty.
     - Converge on six floors (one closed) establishes five views and is idempotent. It leaves a
       file a human put in place untouched.
     - Doctor names a missing or dangling view, and `ward workspace upgrade` clears it.
  2. `bun test test/workspace/worktree-placement.test.ts` covers the following:
     - `worktree create` on floor 2 places the worktree at `floors/2-beta/f2t1-<branch>`, the
       stewardship case under `floors/0-workspace/`, and a legacy task's under `worktrees/`.
     - Upgrade moves a clean old-layout worktree and rewrites its record in one commit per task.
       `git worktree list` in the canonical checkout names the new path. The branch, its HEAD and
       its stash count are unchanged, and a second upgrade does nothing.
     - A dirty worktree, one with an open session inside it, and one git refuses to move are each
       left in place and named as residue. Each moves on the next upgrade once cleared.
     - On a second clone where the record already says `floors/` and the checkout stands at the old
       path, upgrade and restore both move it, and neither creates a second checkout.
     - Doctor's `worktree placement` names each worktree that is not at its placement, and is silent
       once all are.
     - Retirement: with no open legacy task and no checkout under it, upgrade removes an empty
       `worktrees/` and its `.gitignore` line in one commit, and a second upgrade does nothing. An
       open legacy task's worktree, a leftover registered checkout, and a stray file each keep the
       directory, are named as residue, and are left untouched. Converge does not recreate the
       directory, and doctor's ignore check is silent once it is gone.
  3. `bun test test/cli/context.test.ts`:
     - For a file inside a floor task's worktree, `ward context` lists the root's, the floor's and
       the repository's `AGENTS.md` in that order.
     - Its `--json` parses as `contextShape`.
     - A path outside the workspace is refused.
  4. `bun test test/agent/launch.test.ts test/cli/session-show.test.ts`: a task session opened
     without `--dir` records `.`, and one opened with `--dir` keeps its value.
  5. `bun test test/workspace/lineage.test.ts` pins the 0057 root manifest and finds the outgoing
     default in its history.
  6. `bun install --frozen-lockfile && env -u WARD_AGENT mise run check` exits 0.

## Design

- **Decisions:** no new ADRs. The store stack ([ADR 0005](../decisions/0005-store-stack.md)) governs
  the worktree record whose `path` the migration rewrites. Each entry-local decision below was
  decided at the entry's review on 2026-11-10. Entry-local:
  - **Start at the root, and read downward.** Two alternatives were weighed. The first is to start
    low and load upward: each session starts in its scope's own directory, a floor session in its
    floor and a task session in its worktree, and the harness loads every `AGENTS.md` from there up
    to the root. _Attractive_ because every harness already does that walk at startup, so loading
    would need no instruction at all. _It lost_ for three reasons. A floor's directory is a record
    directory, the place an agent is told never to write (0051's decision). A task worktree's top is
    a foreign repository's checkout, so the walk up from it reaches the floor only if the layout
    nests it there, and Codex stops at the git root, which is the worktree itself. And a
    coordinating session works across many directories over its life, so no one starting point is
    right for it. The second alternative is to keep sessions at the root and point each one at its
    context with a mechanism per case: `WARD_FLOOR_MANIFEST` for floor sessions (0055), and a
    `CLAUDE.local.md` pointer plus a git exclude for worktrees (0056). _Attractive_ because both
    were built and tested, and Claude Code loads the pointer natively. _It lost_ because each
    mechanism is custom. The variable reaches only processes Ward launches. The pointer file is
    named for one harness. Both still fall back on an instruction for every other harness, so they
    add machinery without removing the instruction. _Cost:_ loading below the root is one
    instruction-following step for any harness that does not load nested guidance itself (see the
    table below). The risk that follows from that is in _Risks_, with its mitigations.
  - **Scope from identity, with no new variable.** _Alternative:_ an environment variable per scope,
    such as `WARD_FLOOR_MANIFEST` or a `WARD_SCOPE`. _Attractive_ because the agent would read its
    scope without running a command. _It lost_ because `WARD_AGENT` already names the session, and
    the session's record already carries its scope, floor, task and parent (0051, 0052). A second
    variable restates the record, can disagree with it, and reaches only processes Ward started.
    _Cost:_ one `ward session show $WARD_AGENT --json` at the start of a session.
  - **`floors/` is ignored, and every file in it is derived.** _Alternative:_ track `floors/` in the
    workspace repository and ignore only the worktrees under it. _Attractive_ because a fresh clone
    would have the floor manifests on the path before any restore. _It lost_ for three reasons. The
    tracked part would duplicate records that already live in `projects/`, so the tree would hold
    the same fact twice. Ignoring worktrees inside a tracked directory takes a pattern
    (`/floors/*/*/`) that silently forbids any tracked subdirectory there later. And a worktree is
    itself a git checkout: an `add` that misses the pattern records it as an embedded repository,
    which is the accident `/worktrees/` exists to prevent. _Cost:_ on a fresh clone, `floors/` does
    not exist until `workspace restore` runs. That is also when the worktrees first exist, so until
    then there is nowhere to work and nothing to load.
  - **A floor's view links onto the record; it is not the manifest.** _Alternatives:_ make
    `floors/<N>-<slug>/AGENTS.md` the manifest itself, which moves 0055's file out of `projects/`;
    or move the floor's record directory under `floors/` altogether. _The first is attractive_
    because there would be one real file and no link. _The second is attractive_ because the floor
    would be one directory. _The first lost_ because the manifest's `@notes.md` import and its
    lineage are written against the record directory. Moving it splits Ward's part from the floor's
    part, which 0055 composes deliberately as neighbours. _The second lost_ because records stay
    under `projects/`, the tree every reader, the store, and `.gitignore` treat as the record.
    Mixing scratch checkouts into it would put them one `git add` away from the journal. _Cost:_
    three links per floor, kept by converge. Verified with Claude Code 2.1.319: an `@notes.md`
    import read through the `AGENTS.md` link resolves against the link's target, so it loads
    `projects/<N>-<slug>/notes.md` (see the harness table). The `notes.md` link serves a harness or
    an agent that reads the import line as a plain path beside the file.
  - **The worktree's directory name keeps the address.** _Alternative:_ drop the `f<N>t` prefix
    under `floors/<N>-<slug>/`, since the floor is already in the path. _Attractive_ because it is
    shorter. _It lost_ because the name then changes in the move, and a worktree a human has known
    as `f7t26-context-from-root` would be renamed under them. The address also still says the room,
    which the parent directory does not. _Cost:_ the floor number appears twice in the path.
  - **Stewardship worktrees go under their task's floor, like any worktree.** _Alternative:_ a
    separate `stewardship/` directory, or leaving them at `worktrees/`. _Attractive_ because a
    checkout of the workspace's own repository is a different kind of thing. _It lost_ because what
    loads is decided by the path, and a stewardship task sits on a floor (usually floor 0) whose
    manifest applies to it as much as to any other task. A separate place would skip that layer.
    _Cost:_ the walk down passes the workspace's root `AGENTS.md` twice: once at the root, and once
    as the stewardship branch's own copy at the worktree's top. That is correct, since the branch's
    copy is what the change is about.
  - **`worktrees/` is retired, not kept as a second home.** _Alternative:_ keep `worktrees/` for
    good, as the place for legacy bare tasks and anything without a floor. _Attractive_ because it
    needs no step, and nothing in it is harmful once it is ignored. _It lost_ because a second home
    for checkouts is a second place every reader, placement rule and doctor check has to know about,
    for a set of tasks that can only shrink. A directory that stays after its last checkout also
    keeps converge and the ignore list spelling a layout the workspace no longer has. _Cost:_ one
    upgrade step and a conditional ignore check, and a leftover checkout blocks retirement until a
    human removes it.
  - **The migration runs in `workspace upgrade`, not in a verb of its own.** _Alternative:_ a
    dedicated `ward worktree relocate [ADDRESS]`. _Attractive_ because moving a live working
    directory is a deliberate act, and a verb names it. _It lost_ because 0042 makes upgrade the one
    verb that brings a workspace's shape forward to what this release expects, and a layout change
    is exactly that. A second verb would also leave a workspace half moved with no owner for the
    other half. Restore covers the second machine. _Cost:_ an upgrade can now move directories a
    human has open in an editor or terminal. It moves only clean worktrees with no open session
    inside them, and it reports every move.
  - **`ward context` is in.** _Alternative:_ leave the chain to the agent. _Attractive_ because the
    rule is simple enough to follow by hand. _It lost_ because the verb is small: a pure walk over
    path segments plus a `readlink` per hop. It turns the reading rule into one deterministic
    command, which is also the cheapest check that a migration placed things where the rule expects.
    _Cost:_ one read verb and one schema.
  - **Task sessions default to the root.** _Alternative:_ keep the first-worktree default.
    _Attractive_ because a self-recorded agent that really did start in its worktree would get the
    right directory without a flag. _It lost_ because the default is a guess, and after the
    migration the guess names a path that moved. Every session now starts at the root, so `.` is the
    honest default. _Cost:_ an agent that really started elsewhere passes `--dir`.

- **Layout:** `src/workspace/floor-views.ts` is the one home for the view: its path from a project
  directory, the three links, `establishFloorView`, and the inspection doctor reads. Placement, the
  path a worktree should have, is one pure function in `worktrees.ts`, used by create, the
  migration, restore and doctor so none of them spells the path. The migration step lives in
  `converge.ts` beside the other phase-1 steps, and calls a single `relocateWorktree` that does the
  find, the move and the record update. `ward context` is a pure function over path segments in
  `src/workspace/context.ts`, so the CLI only prints it.
- **Mechanisms:**
  - `relocateWorktree` runs its checks in order: the worktree is found in `git worktree list`;
    `git status --porcelain` in it is empty; no open session's `workingDirectory` lies inside it.
    Only then does it run `git worktree move`, and then rewrite the record under the lock. If the
    move succeeds and the commit fails, the next run finds the record behind the disk and finishes
    the update.
  - `establishFloorView` writes each link only when the path is absent (`lstat`), the 0017 posture.
    A link that points elsewhere, or a regular file, is reported, never replaced.

### Harness loading: what is verified, what is assumed

The reading rule is the baseline. This is what each harness does on its own, which is the part an
agent does not have to read itself. "Verified" means checked against a run or a harness's own docs
on 2026-11-09. "Assumed" means neither confirms it.

- **Claude Code**, 2.1.319, checked against its memory and skills docs and against runs in a scratch
  layout of `floors/1-a/<worktree>` with an `InstructionsLoaded` hook logging every load:
  - _Verified (run):_ at start it loads `CLAUDE.md` from the start directory and every directory
    above it.
  - _Verified (run):_ reading a file under `floors/1-a/<worktree>/src/` with the Read tool loads
    `floors/1-a/CLAUDE.md` (load reason `nested_traversal`). That covers the directories between the
    start directory and the file, not only the file's own.
  - _Verified (run):_ `cat` of a single file through Bash triggers the same load.
  - _Verified (run):_ `cd floors/1-a/<worktree> && ls` through Bash loads nothing. A Bash `cd` does
    not change what is loaded.
  - _Verified (run):_ the floor link's `@notes.md` import resolves to `projects/1-a/notes.md`,
    against the link's target, with no external-import prompt, since the target is under the start
    directory.
  - _Verified (run and docs):_ a repository's own `AGENTS.md` at a worktree's top is **not** loaded.
    By default Claude Code reads `AGENTS.md` only when no `CLAUDE.md` exists in the start directory
    or above it, and the workspace root has one. A repository that carries only `AGENTS.md` (Ward's
    own does) reaches a root-started Claude Code session only through the reading rule, or through
    the deferred `claude-md-and-agents-md` assist.
  - _Verified (docs):_ writing or editing a file also triggers the nested load.
  - _Verified (docs):_ nested `.claude/skills/` directories load the first time a file in their
    subtree is read or edited.
  - _Verified (docs):_ the `/cd` command moves the session and adds the new directory's project
    skills.
  - _Assumed:_ that Grep and Glob alone trigger no nested load, because the docs name only read,
    write and edit.
  - _Assumed:_ that a repository's `.claude/settings.json` (permissions, hooks) below the start
    directory is never loaded, because the docs describe no such discovery.
- **Pi**, 1.4.0, checked against its `docs/configuration.md`:
  - _Verified (docs):_ it loads one context file per directory (`AGENTS.override.md`, else
    `AGENTS.md`, else `CLAUDE.md`) from the working directory and every parent, plus its agent
    directory.
  - _Assumed:_ that this happens once, at start, and that a later change of directory or a file read
    below loads nothing. The docs describe no subdirectory loading.
  - Started at the root, pi has the root manifest and nothing below it, so everything below comes
    from the reading rule.
- **Codex**, which has no Ward adapter today, checked against its `AGENTS.md` guide:
  - _Verified (docs):_ once per run, it reads at most one file per directory from the git root down
    to the working directory, capped at 32 KiB in total.
  - Started at the workspace root, the git root is the root, so it loads only the root manifest. A
    later `cd` changes nothing.
  - _Assumed:_ that starting it inside a worktree would stop at the worktree, because a linked
    worktree is its own git root. That is a further reason not to start low.

So a later directory change matters to one harness only. In Claude Code, opening a file below the
root loads that subtree's `CLAUDE.md` files and skills, which is why each floor's view carries a
`CLAUDE.md` link. For every harness, the reading rule is what makes the chain complete.

### The root manifest's rule

The installed root manifest replaces 0055's _Load your floor_ bullet and 0056's _Load your task_
bullet with these two bullets, in the _Driving `ward` as an agent_ section, after _Record your
session_:

```markdown
- **Establish your scope from the record, not from where you stand.** Every session starts here, at
  the workspace root. `WARD_AGENT` names yours: `ward session show $WARD_AGENT --json` gives its
  `scope` (workspace, a floor's project, or a task), its `floor` or `task`, and its `parent`, the
  session that started it. A session recorded with `WARD_AGENT=1` has no record yet; record it
  first. A task's brief is named by `ward task show ADDRESS --json` (`brief.path`); read it before
  you start.
- **Read downward before you work anywhere.** Before you read or change anything below the root,
  read every `AGENTS.md` on the path from here down to it, root first and nearest last. A task's
  worktree stands at `floors/<N>-<slug>/<address>-<branch>/`, so the path passes the floor's
  manifest (`floors/<N>-<slug>/AGENTS.md`, with the floor's `notes.md` beside it) and then the
  repository's own `AGENTS.md` at the worktree's top. `ward context PATH` prints that chain. Some
  harnesses load part of it for you, and none loads all of it, so read it yourself whatever the
  harness.
```

### Changes to the open pull requests

**[#123](https://github.com/crumley/ward/pull/123), floor manifests (0055).** Keep the floor's three
files beside `project.md`, `FLOOR_AGENTS_MD` and its lineage, the backfill in converge, the upgrade
pass, `ward project note`, and the doctor finding. Change the following:

1. Drop `FLOOR_MANIFEST_ENV` (`WARD_FLOOR_MANIFEST`) from `floor-manifest.ts`. Drop the floor branch
   of `sessionEnv` in `src/agent/run.ts`, so that launch and resume set `WARD_AGENT` alone and
   `run.ts` no longer imports `resolveProject`. Drop the acceptance row that asserts the variable on
   a floor-1 and a floor-0 launch, and replace it with one that asserts its absence.
2. Replace the root manifest's _Load your floor_ bullet with _Establish your scope_ as written
   above. Until this entry's build lands, it says "a floor session, or a task on floor N, reads
   `projects/<N>-<slug>/AGENTS.md` and the `notes.md` beside it", and _Read downward_ arrives with
   the `floors/` layout. The outgoing default joins the lineage as 0055's already does.
3. Make `FLOOR_AGENTS_MD` read correctly from either directory, because the same bytes are reached
   through `floors/` later. Its _What is here_ list names the record directory as
   `projects/<this directory's name>/` and says the floor's task worktrees stand under
   `floors/<this directory's name>/`. It names a task's brief as `brief.md` beside each `task.md`,
   which `ward task show` also reports. The text stays byte-identical across floors.
4. In the 0055 README, record the dropped load path as a rejected alternative that links here. In
   its Scope, the floor manifest is reached through the reading rule, with no variable.
5. Set 0055 IF-001's Status to the disposition under _Settlements_ below.

No floor manifest moves under `floors/` in #123. The views are this entry's build, and they link
onto the files #123 writes.

**[#125](https://github.com/crumley/ward/pull/125), worktree context bridge (0056).** Keep
`briefSchema`, `ward task brief`, the lenient read, the brief doctor findings (`info` for an untyped
brief, `warn` for an invalid one), and `ward schema task brief`. Change the following:

1. Delete `src/workspace/worktree-pointer.ts` and every caller. `createWorktree` and
   `createWorkspaceWorktree` return `{task, record}` again, and `worktree create --json` loses
   `pointer`. `restore.ts` no longer converges a pointer, and `recordBrief` no longer rewrites one.
2. Remove the common-dir `info/exclude` line. Ward writes nothing into a repository's git directory.
   Existing exclude lines and pointer files on a machine that ran the branch are left alone, since
   nothing merged ever wrote them.
3. Drop doctor's `pointer` finding.
4. Replace the root manifest's _Load your task_ bullet. Brief discovery joins _Establish your
   scope_, and the instruction to write briefs with `ward task brief ADDRESS FILE` stays.
5. Add `brief: {path, standing}` to `task show --json` and a `brief` line to its human output. This
   was a deferral in 0056, and it becomes in scope because without the pointer `task show` is where
   a brief is found. `standing` is `typed`, `untyped`, `invalid` or `absent`, from the lenient read.
6. Drop the pointer tests and the stewardship-exclude test. Keep the brief tests. Add one asserting
   `task show`'s `brief` for each standing.
7. In the 0056 README, retitle the entry to the typed brief. Its Scope and Design lose the pointer,
   the exclude and the `CLAUDE.local.md` decision, which become a rejected alternative linking here.
8. Set 0056 IF-001's Status to the disposition under _Settlements_ below.

**[#124](https://github.com/crumley/ward/pull/124), floor hosts (0031) — no change.** A host window
already opens in the session's recorded working directory, which is the root for every Ward-started
session, and floor hosts are already one per floor. After this entry a floor's host, its view
`floors/<N>-<slug>/`, and its record `projects/<N>-<slug>/` are three faces of one floor. A later
entry may open a floor host's spare shells in the floor's view, which is out of scope here.

### Settlements

- **0055 IF-001: declined, in favour of [#126](https://github.com/crumley/ward/pull/126).** Its
  Status line becomes:

  > declined — context loads downward from the root along the path a session works in, and scope is
  > read from the session's record ([#126](https://github.com/crumley/ward/pull/126)); a scope-keyed
  > variable is not needed

  #126 is the intent edit that settles the friction the item raised.
- **0056 IF-001: declined.** Ward writes nothing inside an anchor, so there is no harness-named file
  to name in intent. Its Status line becomes:

  > declined — a custom, harness-specific context file written into each worktree and hidden by a
  > git exclude works against the grain of how harnesses load guidance, and is non-standard and
  > unreliable; context reaches a worktree through the standard `AGENTS.md` hierarchy instead, read
  > downward from the workspace root ([#126](https://github.com/crumley/ward/pull/126))

### Order of work

1. **#126, the intent edit**, reviewed and merged first. Merging it is the adjudication.
2. **Rework #123** as listed. It then stands alone: floor manifests, notes, and scope from identity.
   #124 is stacked on #122 and is independent of both; it can merge in any order.
3. **Rework #125** onto the reworked #123, as listed: the typed brief and `task show`'s `brief`.
4. **A new task on floor 7 builds this entry**: the `floors/` views, placement, the migration,
   restore, doctor, the session default, `ward context`, and the root manifest's _Read downward_
   bullet. It depends on #123, because the views link onto its files. Its pull request carries this
   entry's Status to built.
5. **Run `ward workspace upgrade` in each workspace**, as the human, on each machine. This moves the
   worktrees. Open sessions inside old worktrees are named and left. Close them, or let them finish,
   and run the upgrade again. Once nothing holds `worktrees/`, the same upgrade retires it.

### Risks

- **An agent skips a layer.** The reading rule is an instruction, and an agent that forgets it works
  without its floor's notes or its repository's conventions. Mitigations:
  - the rule sits in the root manifest, the one file every harness loads;
  - Claude Code loads the floor's `CLAUDE.md` natively the first time it touches the floor's
    subtree;
  - `ward context PATH` turns the walk into one command;
  - the floor manifest's first line says what directory it serves, so an agent that reads the
    repository's `AGENTS.md` without it can see the gap;
  - the deferred harness-native assists can close the commonest gap, a repository's `AGENTS.md`
    under Claude Code, once sessions show it matters.

  The residue cannot be enforced: no harness offers a hook that runs before a session's first read
  in a directory under every harness.
- **The upgrade moves a directory someone has open.** An editor, terminal, `direnv` or `mise` trust,
  or a running process holding the old path loses it. Only clean worktrees with no open session
  inside are moved, and each move is reported. `mise trust` and `direnv allow` are path-keyed, so
  the first command in a moved worktree may ask for trust again. The upgrade's report says so.
- **Harness history keyed to an old path.** Claude Code and pi file a run's history under the
  directory it started in. A closed session's record keeps its old `workingDirectory`, and `locate`
  still finds its history, because the lookup uses the recorded path, not the directory's existence.
  An open session inside a worktree blocks that worktree's move, so `resume` never lands in a
  directory that is gone.
- **Two machines, one record.** The record moves on the first machine to upgrade, and the second
  machine's checkouts are still at `worktrees/`. Placement there reads the checkout's real location
  from git, so upgrade or restore moves it rather than cutting a second one. Doctor names it until
  then.
- **A floor's slug changes.** There is no verb to rename a floor today. If one arrives, it must move
  the view and the floor's worktrees as this migration does. The placement step already gives it
  that for free on the next upgrade.
