# Domain Model

This file defines the **concepts** (the nouns) and how they relate, with the reasoning for
each. It is pure *what*: nothing here depends on the filesystem, a multiplexer, a harness,
or a model. Mechanisms live in `07-subsystem-seams.md` and `../how/`.

## The containment hierarchy

Work is organized as a hierarchy of nested scopes. Each level contains the levels below it.

```
Workspace
└── Project          (a coherent body of work; may be heavyweight or ad hoc)
    └── Task         (one unit of deliverable work)
        └── Worktree (a branch of a repository being changed)
            └── Room (a scope where deep work happens on a worktree)
```

Not every level is always present. **Levels are elided, not faked:** lightweight work lives
as a task directly under the workspace (no project is invented to hold it), and a quick
task need not stand up a separate room or the full persona cast — a single agent may both
direct and do the work. You add a level only when it earns its keep; you never create an
empty container for ceremony's sake. The hierarchy describes containment and scope, not
mandatory ceremony — **why:** it must scale down to one-off work as gracefully as it scales
up, or the ceremony would defeat the prime directive for small jobs. (Exactly when each
level is warranted is being settled in `08-open-questions.md`.)

> **On "mission."** A higher-than-project grouping ("mission") is intentionally *not* a
> containment level. If missions prove useful, the current intent is that a mission is an
> **attribute of a project** (the larger objective a project advances), not a container
> above it. Deferred — see `08-open-questions.md`.

### Workspace

The root. Local and personal to one human and their agents. Self-sufficient: holds all
metadata, tooling, and skills needed to understand and resume the work within it. A
workspace is configured with a set of **repositories** it knows how to work in.

### Project

A coherent body of work with its own definition of success: not just "are the tasks done"
but "do they add up to the outcome the project was for." It is the natural scope for a
managing persona that holds the whole picture. Projects may be heavyweight and durable, or
**ad hoc and lightweight**.

### Task

One unit of deliverable work — the level at which work is started, tracked, paused,
resumed, and closed (lifecycle: `05-work-lifecycle.md`). A task may exist **purely
locally** or be **linked to a remote work item**. A task can span **multiple worktrees
across multiple repositories** — the change it represents is not always confined to one
repo. Tasks, too, may be ad hoc and lightweight.

### Worktree

A branch of a single repository, checked out so it can be changed independently of the
repository's main line. Worktrees are where code actually changes. A task owns one or more
worktrees; each belongs to one repository and one branch.

### Room

The scope in which **deep work happens** on a worktree. A room is where hands-on agents do
detailed work under direction. It is the innermost scope and the one most jealously
guarded for focused context.

A room is a **scope that hosts sessions**, not a session itself: it is *opened* on a worktree
(with a brief), is *active* while one or more sessions do work in it, and is *closed* when its
work is done to the resident's satisfaction — and, like a session, **closed stays closed**.
**Open ≠ running** applies to rooms too (`04-sessions-and-lifecycle.md`): a room can be open
with no session attached, and resume re-attaches one. A worktree may host **sequential** rooms
over its life, but **one active room per worktree at a time** — parallel deep work belongs on
separate worktrees, where it cannot collide. **Why one at a time:** two rooms on one branch
would generate the very conflicts the worktree boundary exists to prevent.

## Repositories and the main line

A workspace knows a set of repositories. Each is checked out at a well-known location and
**tracks its main line** (its default branch), kept fresh on a cadence
(`05-work-lifecycle.md`) so new worktrees branch from current code. The *what* is: the
workspace maintains current, canonical checkouts of its repositories, distinct from the
per-task worktrees branched off them.

## Status: recorded at the leaves, derived above

Each unit of work records **its own** state — a task is *active*, *blocked*, or *closed*
(`05-work-lifecycle.md`); a room is open or closed; a session is open/running/closed
(`04-sessions-and-lifecycle.md`). The status of a **containing** scope is **derived** from its
children, not stored as a separate field: a project's status is a *query* over its tasks'
states, the workspace's over its projects'. Only judgments that **cannot** be derived from
children — a priority, a "blocked on an external decision" note, an attention flag — are
recorded at the higher scope.

**Why derive, not store.** A stored roll-up goes stale the instant a child changes, and would
make every child transition write its parent — a lost-update hazard (`01-principles.md` §17).
Deriving keeps "where does everything stand?" always correct (§6) and is why the status
personas — charge nurse, house supervisor — can run a fast model: their work is mostly reading
and rolling up, not reasoning. (A *cached* roll-up is allowed only as an explicit cache over
the leaf truth, never a second source of truth, §16.)

## Sessions, agents, and personas

These three are distinct and often confused:

- **Agent** — a running AI instance doing work, within exactly one scope and working
  directory at a time.
- **Persona** — a named role definition (a **name** plus a **role**, with a disposition)
  that shapes how an agent behaves. Personas are tailored to scopes; the set is open and
  configurable. A persona's name and role are **internal** and must never leak to remote
  artifacts (`01-principles.md` §4).
- **Session** — one bounded episode of an agent working at a scope: opened, possibly
  *running*, then closed, and possibly resumed or woken. A session is recorded so it
  survives a pause and a reboot, including its **harness handle** (the locator for its
  underlying harness run). (Lifecycle: `04-sessions-and-lifecycle.md`.)

A single scope commonly has **multiple agents with different personas** working together —
this is normal, not exceptional (e.g. charge nurse, attending, and residents collaborate
around a project's work). The mapping of personas to scopes is the role model in
`03-scopes-and-personas.md`.

## Working directory: the second axis of a session

A session has a **scope** (what it is responsible for) *and* a **working directory** (where
it runs and from which it loads context):

- Broad scopes often start at or near the **workspace root**, to load workspace-wide
  context and skills.
- Narrow scopes start in the **specific directory** of the thing they work on — a
  repository or a worktree — to load *that* directory's context and skills and stay
  specialized.

The mechanism (e.g. `AGENTS.md` files through the hierarchy) is a *how* —
`../how/context-loading.md`. The *what* is that scope and working directory are
independently chosen when a session starts. **Why two axes:** what an agent is responsible
for and where it stands are genuinely different choices; separating them is what lets a
project-scope agent read broadly while a room stays narrow.

## Artifacts

An **artifact** is **any durable piece of output that should be shareable across sessions
and agents** — not just a brief. Decisions, notes, generated data files, scripts, analyses,
status snapshots, handoffs: if it should outlive the session that made it and be usable by
others, it is an artifact. Artifacts are how a scope's accumulated output persists outside
any one agent's memory and outside the code itself. (Where artifacts live and in what
format is a *how* — `../how/metadata-and-schemas.md`.) **Why a first-class noun:** durable
shared output is the connective tissue between sessions and scopes; without naming it, it
scatters and is lost.

### Artifacts carry provenance (lineage)

Beyond its **type**, every artifact records **how and why it came to exist**: which persona
created it, in what working directory, from which session, what context/intent it served,
and **which other artifacts it derived from**. **Why:** a month later the question is
"where did this CSV with these calculations come from?" Provenance lets a human or agent
trace it — "this CSV came from that Python script (itself an artifact of another task),
which computed one field wrong" — and fix the error at its root. Lineage makes durable
output trustworthy and debuggable, not just present (`01-principles.md` §11).

### Artifacts are discoverable across their scope, and read-mostly across tasks

- **Discoverable upward and across.** An artifact created at a scope is **discoverable
  throughout that scope**: a task's artifact is visible at the project scope and can be
  referenced — for example, included in a **brief** to a *different* task that finds it
  relevant. **Why:** the value of durable output is realized only if other work can find
  and reuse it.
- **Owned by their origin.** A task **must not alter another task's artifact** without
  specific guidance to do so. **Why:** silent cross-task mutation breaks provenance and
  surprises the owner; sharing is read-mostly by default, and writing across a boundary is
  a deliberate, instructed act.

### Briefs

A **brief** is one artifact *type*: a handoff document created at one scope to **conjure
and orient another agent** — what the room or task is for, where and at what scope it
operates, what is expected, and why it is being brought into existence. A resident briefs a
room it starts. A room *may* fold its brief into the durable output that lands in the
worktree, but need not — so the model accounts for briefs that live as scope artifacts
independent of any worktree.

### Capturing artifacts elsewhere is part of closing work

Artifacts live in the workspace by default, but some deserve a wider home. **Part of
closing a task is deciding whether any of its artifacts should also be captured
elsewhere** — committed into the worktree's files, posted to a remote issue, promoted to a
project-level artifact, and so on. Capturing an artifact across the boundary is a
**deliberate act of re-authoring, not a wholesale copy**: the agent composes a version fit
for the destination — stripped of local provenance and internal front matter — exactly as
it would for any code or remote comment it produces. **Why:** the workspace is local and
personal; an artifact valuable to others (or to the remote record) crosses the privacy
boundary only by deliberate translation (`05-work-lifecycle.md`, `01-principles.md` §4).

## Identity: human-memorable, scope-relative when that is enough

Things that can be **addressed** carry an **identity** so a human or agent can refer to them
unambiguously *enough*. Identity has two parts:

- A **human-readable slug** that conveys meaning (e.g. derived from a name).
- A **short code** — a few characters — easy to say aloud and type.

**Identity is not always globally unique, and need not be.** The goal is that a human can
**keep it in their head, say it, and type it**, and an agent can **infer what is meant given
enough context** — not that every code is unique across the entire machine. Two design
commitments follow:

- **Lean on memorable conventions, not entropy.** Borrow the hospital metaphor: a **project
  is a floor** and its short code *is* a floor letter (`A`, `B`, `C…`); its **rooms are
  numbered on that floor** (`A1`, `A2`, `A3…`), so a room's code already names its project and
  its room in a few keystrokes. "The resident on A3" is unambiguous and costs no lookup. A
  convention that mirrors the structure beats a random string. **Why:** memorability *is*
  context management — a name you can hold in your head costs no lookup.
- **Size codes to real cardinality.** A person is not working on a thousand projects at
  once, and a hospital floor does not have ten thousand rooms. Identifiers should carry only
  as many digits/prefixes as the realistic number of *in-flight* things requires. **Why:**
  this is personal, small-scale, and human; over-provisioned identity is just noise to
  remember.

**Identity need not mirror containment.** A room is *contained* under a task and a worktree,
but it is *addressed* by its floor + number alone (`A3`); the task and worktree it belongs to
are **attributes discoverable from the room's record**, not parts of its address. The two are
different lookups on purpose — addressing optimizes for memory, containment for structure. The
cost to accept is that room numbers run as a simple per-project sequence (opening order on the
floor), not grouped by task.

Where global uniqueness genuinely is needed, it can be composed (e.g. floor letter +
room number); where **scope-relative** identity suffices (a session within its scope), that is
preferred. (Remaining edges — task codes, cross-workspace uniqueness, reuse after close:
`08-open-questions.md`.)

**What gets an identity** (current intent):

| Thing | Identity |
|-------|----------|
| Project | slug + code; the **code is a floor letter** (`A`, `B`, `C…`) |
| Task | slug + code (scope-relative to its project may suffice) |
| Room | **floor + number** (`A3`), by memorable convention; addresses the room workspace-wide without naming its task or worktree |
| Session | slug + code, scope-relative to its scope |
| Worktree | natural key (repository + branch) |
| Workspace | the root itself; identified by location |
| Artifact | addressed by scope + type + name |

A session also stores a **harness handle** — the locator for its underlying harness run — but
that is a recorded *attribute*, not a second identity (like a task's remote-work-item link;
`04-sessions-and-lifecycle.md`). Every addressable thing has exactly one identity.

## Messaging, dispatch, and waking

The hierarchy is also a communication structure:

- **Dispatch** — a scope hands a unit of work (or context) *downward* to something within
  it, and can see where it landed.
- **Report** — a scope reports status *upward* to the scope that contains it.
- **Wake / nudge** — a scope can ask to be notified, or be notified by another scope, when
  a condition is met (e.g. a room finishing). A waiting scope can block on a result, or
  detach and ask to be woken later.

These are important concepts, and Ward is **opinionated about how they work** — *how* a
message is delivered, *how* dispatch routes, *how* a wait is satisfied — because they
overlap heavily with the multiplexer. That opinion is recorded in
`../how/messaging-dispatch-wake.md`; the *what* here is only that these three flows exist
and are first-class.

## Forking a context (side quests)

Within any scope, work sometimes uncovers a sub-problem that would, if pursued inline, blow
up the scope's context with a detour. The model supports **forking**: a new context that
inherits the relevant context of its origin, resolves the side quest, and reports back a
clean result — leaving the origin's context focused.

A fork is **not always a pure peer detour.** A fork may be created at a **different scope
and/or persona** than its origin when that serves the work — e.g. forking a narrower,
specialized context to chase a deep sub-problem, then returning its result upward. What
every fork shares is the contract: inherit what is needed, do the side work elsewhere,
return a clean result so the origin stays focused. It inherits either by **exact-clone**
(branch the origin's real session, where the harness supports it) or by a **distilled brief**
(a fresh session seeded with a compacted brief) — the brief mode is the harness-neutral
baseline. **Why:** protecting the origin's context from detours is the prime directive in
miniature. (Mechanics and modes in `03-scopes-and-personas.md`.)
