# 0069 — A floor's reflection, proposed on a stewardship branch

> Three verbs let an agent that is already running reflect on one floor's finished work: a packet of
> what to read, a stewardship vehicle to propose in, and a record of what was covered that reaches
> the main line, cursor and all, only through the gated merge.
>
> **Status:** built — awaiting review · **Started:** 2026-11-16

Ward is meant to compound, and nothing in it does yet. A floor accumulates closed tasks, each with a
brief, a set of pull requests and the session records of the agents that worked it, and the only
thing that carries a lesson from one of them to the next is an agent remembering to run
`ward project note` before it finishes ([0055](../0055-floor-manifests/README.md)). That verb
appends one line. It cannot merge two notes that say the same thing, retire one that stopped being
true, or notice a pattern across twelve tasks, and nothing ever asks anyone to try. The intent
describes the loop that would
([`04-reflection-and-evolution.md`](../../intent/01-concepts/04-reflection-and-evolution.md)), and
the pieces it needs are built: a session's harness history can be located per machine
([0029](../0029-launched-sessions/README.md), [0038](../0038-machine-bound-sessions/README.md)), and
a change to the workspace itself has a vehicle with a preview and a gated merge
([0019](../0019-stewardship-worktrees/README.md), [0030](../0030-upgrade-self-service/README.md)).

This entry builds the first slice of that loop, for one scope: a **floor**. Ward's part is the
bookkeeping around a judgement it does not make. It says what there is to read, builds the vehicle,
and writes down what was covered. The reading and the proposing are done by an agent that is already
running, typically the floor's own session, and the human lands the result with the same merge that
lands an upgrade, or does not. Ward starts no agent and calls no model here.

## Serves intent

- [`intent/01-concepts/04-reflection-and-evolution.md`](../../intent/01-concepts/04-reflection-and-evolution.md)
  — _Reflection is a family of goal-directed routines_: this is one member of the family, scoped to
  a floor's arc since its last reflection. _Reflection must scale by chunking and rolling up_: the
  packet gives each history's size so a reader can plan its chunks, and the chunking itself is the
  reading agent's. _Why it stays cheap_: the workspace records what each reflection covered, and the
  next one is offered only the rest ([IF-003](intent-feedback.md)). _What reflection produces_:
  proposals, adopted through the stewardship path; the product this slice proposes is the floor's
  notes ([IF-001](intent-feedback.md)).
- [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — _The workspace's own main line: journal and stewardship_: adoption is a task, a branch, a
  worktree of the workspace's own repository, and the human's merge; the reflection record is
  written on that branch and nowhere else ([IF-005](intent-feedback.md)). _The standing workspace
  project_: the reflection's task opens on the ground floor.
- [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md)
  — a session's history belongs to its harness and its machine: the packet reports found, gone, or
  elsewhere for each, and the record keeps that answer ([IF-004](intent-feedback.md)).
- [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) — **§16**:
  the cursor is read from records on the main line, with no second copy. **§18**: the merge is the
  human's. **§6**: opening converges on the open reflection, and recording again replaces. **§20**:
  what could not be read is named in the packet and kept in the record. **§4** stops at the remote
  boundary and says nothing of what enters the record from a harness history
  ([IF-002](intent-feedback.md)).

## Scope

- **In:**
  - **`ward reflection packet FLOOR [--json]`** — read-only. For the floor: the closed tasks no
    landed reflection has covered, oldest close first, each with its record directory, outcome, pull
    requests, brief path and sessions; the floor's own sessions not yet read to their close; the
    tasks still open, as context; the floor's last reflection; the open reflection, if any; the
    paths of the notes and the manifest; and the files a reflection may change. Each session carries
    its event trail and where its history stands on the machine asked: `found` with the path and
    size in bytes, `gone`, `elsewhere` (it ran on another machine), or `unlocatable` (no handle).
    `unread` lists the ids that are not `found`.
  - **`ward reflection open FLOOR [--json]`** — builds the vehicle: a task on the ground floor named
    `reflect-floor-<N>`, marked `stewardship: reflection` and `reflects: N`, and a worktree of the
    workspace's own repository cut from the main line. Convergent: with the floor's reflection
    already open it reports the same one and re-establishes a missing worktree. Refused when the
    floor has no uncovered closed task.
  - **`ward reflection record FLOOR FILE [--json]`** — FILE (or `-`) is the reflecting agent's
    summary. Ward writes the reflection record into the worktree and commits it, with the agent's
    changes to the notes, as one commit on the stewardship branch. Run again, it replaces the record
    with the same number and the same coverage.
  - **What the agent may change on the branch:** the reflected floor's `notes.md`, and the ground
    floor's. Anything else the branch changes, committed or not, refuses the record.
  - **The reflection record:** `projects/<N>-<slug>/reflections/<n>.md`, a typed record whose body
    is the summary. It names the floor, its number, the task that carried it, the session that wrote
    it, the machine it ran on, the covered tasks by record directory, and each session in the
    interval with its state and where its history stood.
  - **The cursor:** the union of the tasks named in the floor's reflection records on the main line.
    Nothing else stores it.
  - **The hint:** `ward task close` adds one line, and a `reflection` field under `--json`, when the
    closed task's floor has at least five uncovered closed tasks and no reflection open.
    `ward status` carries `unreflected` per floor in `--json` and says it on the floor's row from
    the same threshold.
  - **Format level 2**, for the two shapes an older Ward rejects.
  - The root manifest teaches the three verbs; the floor manifest says a reflection's worktree is
    where the notes are rewritten.
- **Deferred:**
  - **Ward starting the reflecting agent, or handing it a prompt.** Safe to defer because the three
    verbs are the whole contract such a launcher would drive, and an agent told to reflect needs
    nothing else from Ward. What is lost meanwhile is only that somebody has to ask.
  - **Triggers that act**: reflecting at a task's close, at a project's, or on a cadence. The hint
    is the whole of the trigger here. Safe to defer because unreflected work does not expire from
    the record: the tasks, briefs and pull requests stay, and a late reflection covers more tasks in
    more chunks. Harness histories do expire, and that loss is real; the record says which sessions
    were read with a history and which without.
  - **Reflection above or beside the floor**: a roll-up across floors, workspace-scope sessions
    (they belong to no floor and no packet lists them), legacy bare tasks, and recovery reflection.
    Safe to defer because each is another member of the family with its own scope, and none of them
    changes what a floor's reflection covers.
  - **Other products**: the root or a floor's `AGENTS.md`, skills, personas, standards, and
    improvements bound for Ward's own repository. The manifests are installed artifacts with a
    lineage ([0020](../0020-deterministic-upgrade/README.md)): an edit turns one from untouched to
    customized and takes it out of every later upgrade, which is a decision a first slice should not
    make as a side effect. The workspace has no home for skills or personas yet. Safe to defer
    because the summary is free text: a reflection that finds something for Ward or for the manifest
    says so there, and a human can act on it.
  - **Telemetry as an input.** Whether usage telemetry feeds reflection is open in intent
    ([0013](../0013-telemetry-and-serialized-writes/README.md) records it and nothing reads it). The
    packet does not mention it.
  - **Pruning what a declined reflection leaves.** The branch stays, as every stewardship branch
    does ([0019](../0019-stewardship-worktrees/README.md)).
  - **A `next` line for the vehicle** in `ward task show`. The verbs' own reports name the acts that
    remain.
- **Acceptance:**
  1. `bun test test/cli/reflection.test.ts` passes: the loop end to end in a throwaway workspace
     (close, packet, open, propose, record, preview, merge, the cursor advanced, the next packet
     starting where this one reached), the declined path, the refusals, the hint, and the format
     level.
  2. In that test, before the merge the root holds no reflection record and its notes are unchanged,
     and `ward status --json` still counts every task; after it, only the task closed while the
     reflection was open.
  3. The record written in that test contains no path and no line of the session history the packet
     reported as `found`.
  4. `bun test test/store/format.test.ts` passes with the shapes re-pinned at level 2, and
     `bun test test/cli/format-guard.test.ts` passes with the three verbs among those a too-old Ward
     refuses.
  5. `ward schema reflection packet`, `ward schema reflection open` and
     `ward schema reflection record` each emit a schema.
  6. `mise run check` passes.

## Design

### The flow

An agent, or a human, asks what there is:

```
ward reflection packet 7 --json
ward reflection open 7
```

The agent reads what the packet names: the briefs, the pull requests, the histories that are
`found`, a chunk at a time when they are large. It edits `projects/7-<slug>/notes.md` in the
worktree `open` reported, writes its summary to a file, and hands it over:

```
ward reflection record 7 summary.md
```

The human reads the proposal and lands it, or closes the task unmerged:

```
ward workspace merge steward/reflect-floor-7 --preview
ward workspace merge steward/reflect-floor-7
ward task close f0t3
```

The last three are the verbs an upgrade already lands through. Each new verb's report names the ones
that follow it.

### Decisions

**The verbs are a `reflection` group, not flags on `ward project`.** One verb with `--open` and
`--record FILE` under `ward project reflect` was attractive: it sits beside `project note`, and a
floor is a project. It lost to the JSON contract, which is one shape per verb
([0008](../0008-json-shape-home/README.md)): a packet, a vehicle report and a record report are
three documents, and a verb whose schema depends on its flags cannot be discovered from
`ward schema`. The cost is a fourth noun at the top of the CLI, with one scope under it today. The
other members of the family will want the same three acts over a different scope, and the noun is
where they go.

**The cursor is the set of covered tasks, read from the reflection records.** A timestamp on the
project record is the obvious cursor and is what "where the last reflection reached" suggests. It
lost twice. A workspace's record is shared between machines through git, and a task closed on one
machine at ten o'clock can arrive on another after a reflection there recorded "through eleven":
behind a timestamp it would never be reflected on. And a field on `project.md` written in the
stewardship copy is a second copy of a fact the reflection record already states, on a file the
journal also writes, so the merge can conflict on it. With the set, the cursor advances because the
record landed, and for no other reason. The cost: answering "what is unreflected" reads every
reflection record of the floor, a directory that grows by one small file per reflection, and the
record lists each covered task by directory. The records also carry `from` and `through` timestamps,
as information for the reader: a floor session still open when it was read is offered again, and
`through` is where its history was last read to.

**The worktree's copy of the record is the reflection's window.** The reading takes minutes or hours
and work goes on beside it. Taking the window at record time from the live workspace was simpler,
and wrong: it would mark as covered a task that closed after the agent read the packet. The
stewardship worktree is already a copy of the record as it stood when the vehicle was cut, so the
window is read from it: what is closed in the copy and covered by no reflection in the copy. While
the reflection is open the packet reads the same tree, so what it lists is what the record will say.
Session records are read from the workspace itself, since a covered task's sessions are closed in
both and a floor session's trail is only current there. The cost is one rule to know:
`ward worktree rebase` moves the copy forward, and the window with it.

**The reflection record lives with the floor it describes.** The reflection's task is on the ground
floor, where all stewardship is, and putting the record beside it (`reflection.md` next to
`task.md`, as a brief sits) would keep every trace of the act in one directory. It lost because the
record's first reader is the next reflection of that floor, and the question it answers, what has
this floor already been through, is the floor's. Beside the project record it is one directory read
per floor, which is what lets `ward status` and the close hint ask it cheaply. The ground floor
still answers "what has been done to this workspace": its task list names every reflection, and each
record names its task. Records are numbered per floor from 1. Two machines that each record a
floor's next reflection before syncing both write the same number, and the second merge fails on the
file, cleanly; they are two reflections of the same work, and a conflict is the right answer.

**The agent edits the notes directly, in the copy.** The floor manifest says an agent never edits
`notes.md`, because it sits in the record tree where every write goes through `ward`. That rule is
about the main line, where an edit is a record write nobody reviews. In a stewardship copy the same
edit is a proposal: it is on a branch, it changes nothing until a human merges it, and the preview
shows every line. A verb for it was considered, something like `ward reflection note`, and it could
only have been an editor for a text file: the value of a reflection over the append is that it
merges, rewrites and retires, and each of those is an arbitrary edit. The manifest now says so in
one sentence. The cost is that Ward does not check what the edit says. It checks which files
changed.

**The record verb runs at the workspace root and commits in the copy.** A copy refuses mutating
verbs, since a journal entry written on a stewardship branch would merge back as false history.
`reflection record` keeps that rule: it refuses inside the copy like every other mutation, and at
the root it writes into the worktree the vehicle task holds, the way `ward workspace upgrade TASK`
writes the stamp and the baselines into one. What it commits there is stewardship work, on the
branch, and is exactly the thing the merge is for. Nothing about the reflection is journaled on the
main line except the vehicle itself (the task, its worktree record, the agent's session), which is
true whether or not the proposal is ever adopted. The alternative was to journal the record at once
and treat the merge as adopting only the notes; it would advance the cursor for a reflection the
human declined.

**A short, closed list of files.** The reflected floor's notes and the ground floor's, where the
manifest sends knowledge about the whole workspace. `record` compares the branch with its merge
base, counts staged, unstaged and untracked files too, and refuses naming every path outside the
list. The generous alternative, any file the agent thinks should change with the preview as the only
check, was attractive because the preview is real. It lost because the first slice should produce
diffs a human can read in a minute and trust the shape of, and because most other files in the
record tree are records, where a hand edit is the thing the workspace forbids. The check is at
`record`; a commit made on the branch afterwards is caught only by the preview.

**What the record holds, and the bound on the summary.** Reflection is the first thing in Ward that
moves content out of a harness history, which is one machine's and is deleted by its harness in
weeks, into the workspace record, which is committed, travels to every clone, and is pushed to the
workspace's remote as backup. The record therefore holds identifiers and standings that Ward wrote,
and one free-text field, the summary. Ward writes no history path into it (a path names a home
directory) and copies no history text. The agent is told, in the manifest and by the verb, to quote
no transcript. Ward cannot read a summary for meaning, so the rule is backed by a bound: a summary
over 32 KiB is refused. That is far above any honest summary and far below the smallest history
worth reading, so it stops a paste and nothing else. The notes are covered by the same rule and by
no bound; the preview is where a human sees them.

**The hint, and its threshold.** One line after a successful close, when the closed task's floor
holds five or more closed tasks that no landed reflection covers. Below five the line would appear
on most closes and stop being read, and a floor-level reflection has little to generalize from. It
is silent while the floor's reflection is open, and on a reflection's own close. It is computed
after the close has committed, and any error computing it is swallowed: advice about the floor may
not turn a finished close into a failed verb. `ward status` is the one other place it shows. A
doctor finding was considered and left out: unreflected work is not ill health.

**A reflection's own task is never reflected on.** It is excluded from the uncovered set by its
marker. Counted, every reflection of the ground floor would leave one more task for the next.

**Unreadable is still covered.** A task whose sessions ran on another machine, or whose histories
are gone, is covered by the reflection that lists it, and the record says each history was not read.
The alternative, leaving such a task uncovered until some machine can read it, means a floor worked
from three machines never finishes a reflection, while the histories it is waiting for expire. The
task's brief, pull requests and session trail are readable everywhere, and they are what the
reflection had.

### Chunking is the reader's

The intent's map-reduce (chunk, distill, roll up) is done by the reflecting agent, and Ward's part
in it is to make the plan possible before a file is opened. Measured on the floor where Ward itself
is built, the first packet lists 42 closed tasks and 19 sessions; 13 of the histories are on the
machine asked and come to 131 MB, the largest 25 MB, and six are on another machine. No reader takes
that in one pass, and some of it no reader on that machine takes at all. So the packet gives each
history's size and standing and builds in about a fifth of a second, the tasks come oldest close
first so a chunk by task is also a chunk by time, and the record keeps the standings. How the chunks
are cut and how their learnings are rolled up is not prescribed.

### The format level

Level 2. `stewardship` on a task is a closed set, and a Ward from before this entry rejects
`reflection` in it; every verb that lists tasks then fails on a schema error. The reflection record
is a new type an older Ward never reads, and it rides the same level. The level's `needs` test
recognizes a reflection record and a task marked as one, so a newer Ward on a workspace still at
level 1 refuses `reflection open` with the upgrade as the remedy, and writes nothing. The packet
needs no new shape and answers at any level. `reflects` is a new field, which an older reader drops.

### Layout

`src/workspace/reflection.ts` holds all of it: reading a floor's reflections, the uncovered set, the
packet, the vehicle, the record, the hint. It leans on the stewardship rails without changing them:
`openTask` gained the marker's second value and the `reflects` field, and `createWorkspaceWorktree`,
`mergeWorkspaceBranch` and the delivered close's reachability check are used as they are. The record
type is in `src/store/types.ts` with the others. `status.ts` asks the module for each floor's count.

### Mechanisms

- **The uncovered set** is the floor's tasks that are closed, are not themselves reflections, and
  whose record directory no reflection record in the tree names. Rooms are reused, so a closed
  task's address names nothing; its directory is what stays.
- **Session standings** come from the record first: a session whose recorded machine is not this one
  is `elsewhere` without touching the filesystem. Otherwise the recorded handle's adapter says where
  the history would be, and a `stat` gives its size.
- **Recording again** finds the vehicle's own record in the copy by the task it names, reads the
  window as if that record were absent, and writes the same number.
- **A floor that has closed** carries no notes, so its reflection may change the ground floor's
  alone.
