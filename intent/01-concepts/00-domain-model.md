# Domain Model

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

This file defines the **concepts** (the nouns) and how they relate, with the reasoning for each. It
is pure _what_: nothing here depends on the filesystem, a multiplexer, a harness, or a model. The
swappable machinery is named as contracts in [`../02-subsystems/`](../02-subsystems/); its build is
planned in [`../../design/`](../../design/).

## The containment hierarchy

Work is organized as a hierarchy of nested scopes. Each level contains the levels below it.

```
Workspace
└── Project          (a coherent body of work; may be heavyweight or ad hoc)
    └── Task         (one unit of deliverable work)
        └── Worktree (a branch of a repository being changed)
            └── Room (a scope where deep work happens on a worktree)
```

Not every level is always present. **Levels are elided, not faked:** lightweight work lives as a
task directly under the workspace (no project is invented to hold it), and a quick task need not
stand up a separate room or the full persona cast — a single agent may both direct and do the work.
You add a level only when it earns its keep; you never create an empty container for ceremony's
sake. The hierarchy describes containment and scope, not mandatory ceremony — **why:** it must scale
down to one-off work as gracefully as it scales up, or the ceremony would defeat the prime directive
for small jobs. (Exactly when each level is warranted is being settled in
`../00-foundation/open-questions.md`.)

> **On "mission."** A higher-than-project grouping ("mission") is intentionally _not_ a containment
> level. If missions prove useful, the current intent is that a mission is an **attribute of a
> project** (the larger objective a project advances), not a container above it. Deferred — see
> `../00-foundation/open-questions.md`.

### Workspace

The root. Local and personal to one human and their agents. Self-sufficient: holds all metadata,
tooling, and skills needed to understand and resume the work within it. A workspace is configured
with a set of **repositories** it knows how to work in.

### Project

A coherent body of work with its own definition of success: not just "are the tasks done" but "do
they add up to the outcome the project was for." It is the natural scope for a managing persona that
holds the whole picture. Projects may be heavyweight and durable, or **ad hoc and lightweight**.

### Task

One unit of deliverable work — the level at which work is started, tracked, paused, resumed, and
closed (lifecycle: `03-work-lifecycle.md`). A task **has an identity** and may exist **purely
locally** or be **linked to a remote work item**; when linked, it can be **referenced by either its
local identity or its remote identity** (the work-item id) — both routes resolve to the same task. A
task can span **multiple worktrees across multiple repositories** — the change it represents is not
always confined to one repo. Tasks, too, may be ad hoc and lightweight.

### Worktree

A branch of a single repository, checked out so it can be changed independently of the repository's
main line. Worktrees are where code actually changes. A task owns one or more worktrees; each
belongs to one repository and one branch.

### Room

The scope in which **deep work happens** on a worktree. A room is where hands-on agents do detailed
work under direction. It is the innermost scope and the one most jealously guarded for focused
context.

A room is a **reusable resource that hosts sessions**, not a session itself — like a real ward room
that is turned over and assigned to new work. Because opening a room only makes sense once you know
what work it is for, **opening a room mints its first session**: the brief that conjures the room
conjures the agent that will work in it (no "open room with nothing happening in it" state). A room
is **occupied** while one or more sessions work in it, and becomes **free** again when its last
session closes — occupancy is **derived from the room's sessions, never stored on the room** (see
_Status_, below) — at which point it can be **reassigned**, its code reused. The permanence rule
lives on the **session**, not the room: **closed stays closed** is a _session_ guarantee
(`02-sessions-and-lifecycle.md`); a room is a slot that empties and refills. A worktree may host
**sequential** rooms over its life, but **one occupied room per worktree at a time** — parallel deep
work belongs on separate worktrees, where it cannot collide. **Why one at a time:** two rooms on one
branch would generate the very conflicts the worktree boundary exists to prevent. **Why a reusable
slot, not a closed-forever scope:** rooms are addressed by a small, memorable code (`4A12`) sized to
in-flight cardinality; permanently retiring a code on every close would burn the address space the
human keeps in their head.

## Repositories and the main line

A workspace knows a set of repositories. Each is checked out at a well-known location and **tracks
its main line** (its default branch), kept fresh on a cadence (`03-work-lifecycle.md`) so new
worktrees branch from current code. The _what_ is: the workspace maintains current, canonical
checkouts of its repositories, distinct from the per-task worktrees branched off them.

## Status: recorded at the leaves, derived above

Each **leaf** unit of work records **its own** state — a task is _active_, _paused_, or _closed_
(`03-work-lifecycle.md`); a session is _open_ or _closed_ (`02-sessions-and-lifecycle.md`; _running_
is a **derived live overlay** — a process attached right now — never a stored state). These are the
only genuinely leaf-recorded states. The status of a **containing** scope is **derived** from its
children, not stored as a separate field — and that includes the **room**: a room is the innermost
_container_ and its sessions are its leaves, so **room occupancy is derived from its sessions** — a
room is _occupied_ iff it holds at least one non-closed session, _free_ otherwise. Likewise a
project's status is a _query_ over its tasks' states, the workspace's over its projects'. Only
judgments that **cannot** be derived from children — a priority, a "waiting on an external decision"
note, an attention flag — are recorded at the higher scope.

**Why derive, not store.** A stored roll-up goes stale the instant a child changes, and would make
every child transition write its parent — a lost-update hazard (`../00-foundation/01-principles.md`
§17). Deriving keeps "where does everything stand?" always correct (§6) and is why the status
personas — charge nurse, house supervisor — can run a fast model: their work is mostly reading and
rolling up, not reasoning. (A _cached_ roll-up is allowed only as an explicit cache over the leaf
truth, never a second source of truth, §16.)

### The derivation rule

Rolling child states up to a container follows one rule, **progress-biased**:

- **Precedence (highest wins): `active` ▸ `paused` ▸ `closed`.** Any child that can still be moved
  forward makes the container `active`; if none can but some are only set down, it is `paused`; only
  when **every** child is `closed` is the container `closed`.
- **An empty container is `active`.** A freshly-opened project with no tasks, or a new workspace
  with no projects, starts `active` — there is nothing blocking it, and the human **pauses** it
  explicitly if they don't want it on the active list. (No special "idle/empty" status to reason
  about.)
- **`in-review` is a derived overlay, not a rollup input.** A task in review (it has open PRs —
  `03-work-lifecycle.md`) counts as `active` for its container; review is a flavor of "in flight,"
  surfaced as a presentation detail, not a competing rollup state.

**Why this precedence:** Ward's status is **just enough to route attention**, not a
project-management state machine. The question the status personas answer is "where can I still make
progress?", so any in-flight child wins — a project is not stuck just because one of its tasks is
set down. **Why empty = active:** the alternative (a distinct empty/idle state) adds a state to
reason about for no routing benefit; "active with nothing in it yet" is the honest reading of a
brand-new scope.

## Sessions, agents, and personas

These three are distinct and often confused:

- **Agent** — a running AI instance doing work, within exactly one scope and working directory at a
  time.
- **Persona** — a **name** plus a **role** plus a disposition, shaping how an agent behaves. A
  persona _has_ a **role**, and the two evolve differently: **roles are a fixed, closed vocabulary**
  (the ward roles — house supervisor, attending, charge nurse, resident, medical student —
  `01-scopes-and-personas.md`), while **personas are an open, evolvable cast** the workspace tailors
  to its work. **Many personas may share one role** (a strict charge nurse and a relaxed one are two
  personas, one role). A persona's name **and** its role are **internal** and must never leak to
  remote artifacts (`../00-foundation/01-principles.md` §4) — and the _closed_ role vocabulary is
  part of what makes that leak-guard enforceable (`../02-subsystems/06-remote-provider.md`).
- **Session** — one bounded episode of an agent working at a scope: opened, possibly _running_, then
  closed, and possibly resumed or woken. A session is recorded so it survives a pause and a reboot,
  including its **harness handle** (the locator for its underlying harness run). (Lifecycle:
  `02-sessions-and-lifecycle.md`.)

A single scope commonly has **multiple agents with different personas** working together — this is
normal, not exceptional (e.g. charge nurse, attending, and residents collaborate around a project's
work). The mapping of personas to scopes is the role model in `01-scopes-and-personas.md`.

## Working directory: the second axis of a session

A session has a **scope** (what it is responsible for) _and_ a **working directory** (where it runs
and from which it loads context):

- Broad scopes often start at or near the **workspace root**, to load workspace-wide context and
  skills.
- Narrow scopes start in the **specific directory** of the thing they work on — a repository or a
  worktree — to load _that_ directory's context and skills and stay specialized.

The mechanism (e.g. `AGENTS.md` files through the hierarchy) is a _how_ — `05-context-loading.md`.
The _what_ is that scope and working directory are independently chosen when a session starts. **Why
two axes:** what an agent is responsible for and where it stands are genuinely different choices;
separating them is what lets a project-scope agent read broadly while a room stays narrow.

**Reaching beyond the working directory.** A narrow, worktree-scoped session is not walled off from
the rest of its task or project. Its **brief** may reference artifacts that live _outside_ the
worktree but within the enclosing scope — a decision note at the task level, a dataset from a
sibling worktree, a project-level analysis. Such references are **allowed and encouraged**, but each
carries a **short summary and why it might matter**, so the agent can judge for itself when to pull
it into context and when to leave it out. **Why:** this is context economy
(`../00-foundation/01-principles.md` §12) made concrete — the agent spends tokens on what _it_
decides is relevant, rather than having everything in scope forced into the window or hidden from it
entirely.

## Artifacts

An **artifact** is **any durable piece of output that should be shareable across sessions and
agents** — not just a brief. Decisions, notes, generated data files, scripts, analyses, status
snapshots, handoffs: if it should outlive the session that made it and be usable by others, it is an
artifact. Artifacts are how a scope's accumulated output persists outside any one agent's memory and
outside the code itself: they are the **durable context that informs the work**, carried between
agent sessions. The _output_ of a task is generally (but not always) **git commits in its
worktrees**; the artifacts are the context that made that work possible and that lets a later
session resume it. (Where artifacts live and in what format is a _how_ —
`../02-subsystems/00-metadata-store.md`.) **Why a first-class noun:** durable shared output is the
connective tissue between sessions and scopes; without naming it, it scatters and is lost.

### Artifacts carry provenance (lineage)

Beyond its **type**, every artifact records **how and why it came to exist**: which persona created
it, in what working directory, from which session, what context/intent it served, and **which other
artifacts it derived from**. **Why:** a month later the question is "where did this CSV with these
calculations come from?" Provenance lets a human or agent trace it — "this CSV came from that Python
script (itself an artifact of another task), which computed one field wrong" — and fix the error at
its root. Lineage makes durable output trustworthy and debuggable, not just present
(`../00-foundation/01-principles.md` §11).

### Artifacts are discoverable across their scope, and read-mostly across tasks

- **Discoverable upward and across.** An artifact created at a scope is **discoverable throughout
  that scope**: a task's artifact is visible at the project scope and can be referenced — for
  example, included in a **brief** to a _different_ task that finds it relevant. **Why:** the value
  of durable output is realized only if other work can find and reuse it.
- **Owned by their origin.** A task **must not alter another task's artifact** without specific
  guidance to do so. **Why:** silent cross-task mutation breaks provenance and surprises the owner;
  sharing is read-mostly by default, and writing across a boundary is a deliberate, instructed act.

### Briefs

A **brief** is one artifact _type_: a handoff document created at one scope to **conjure and orient
another agent** — what the room or task is for, where and at what scope it operates, what is
expected, and why it is being brought into existence. Like every artifact, a brief carries its
provenance — **who created it and why** — and, in addition, **who it is for** (the target
scope/persona), **using stable identities wherever possible** so the handoff stays unambiguous
later. It may also reference in-scope artifacts beyond the working directory, each with a short
summary (see _Working directory_, above). A resident briefs a room it starts. A room _may_ fold its
brief into the durable output that lands in the worktree, but need not — so the model accounts for
briefs that live as scope artifacts independent of any worktree.

### Capturing artifacts elsewhere is part of closing work

Artifacts live in the workspace by default, but some deserve a wider home. **Part of closing a task
is deciding whether any of its artifacts should also be captured elsewhere** — committed into the
worktree's files, posted to a remote issue, promoted to a project-level artifact, and so on.
Capturing an artifact across the boundary is a **deliberate act of re-authoring, not a wholesale
copy**: the agent composes a version fit for the destination — stripped of local provenance and
internal front matter — exactly as it would for any code or remote comment it produces. **Why:** the
workspace is local and personal; an artifact valuable to others (or to the remote record) crosses
the privacy boundary only by deliberate translation (`03-work-lifecycle.md`,
`../00-foundation/01-principles.md` §4).

## Identity: human-memorable, scope-relative when that is enough

Things that can be **addressed** carry an **identity** so a human or agent can refer to them
unambiguously _enough_. Identity has two parts:

- A **human-readable slug** that conveys meaning (e.g. derived from a name).
- A **short code** — a few characters — easy to say aloud and type.

**Identity is not always globally unique, and need not be.** The goal is that a human can **keep it
in their head, say it, and type it**, and an agent can **infer what is meant given enough context**
— not that every code is unique across the entire machine. Two design commitments follow:

- **Lean on memorable conventions, not entropy.** Borrow the hospital metaphor: a **project is a
  floor**, addressed by a **floor number** (`1`, `2`, `3…`, starting at 1); its **rooms carry the
  floor number plus a room code** — e.g. `4A12` is room `A12` on floor `4` — so a room's address
  already names its floor and its room in a few keystrokes. "The resident on `4A12`" costs no
  lookup. A convention that mirrors the structure beats a random string. **Why:** memorability _is_
  context management — a name you can hold in your head costs no lookup.
- **Size codes to real cardinality.** A person is not working on a thousand projects at once, and a
  hospital floor does not have ten thousand rooms. Identifiers should carry only as many
  digits/prefixes as the realistic number of _in-flight_ things requires. **Why:** this is personal,
  small-scale, and human; over-provisioned identity is just noise to remember.
- **Time is another ambiguity-breaker.** Because codes are sized to in-flight cardinality and may be
  reused over time, a bare code can be ambiguous across _history_ — but it rarely has to stand
  alone. "The resident in `4A12`" may be ambiguous over weeks; "the resident in `4A12` on Tuesday"
  is not. **Why:** anchoring to a moment (or to any surrounding context) is usually enough, so
  identity can stay short instead of buying global uniqueness with entropy.

**Identity need not mirror containment.** A room is _contained_ under a task and a worktree, but it
is _addressed_ by its floor number + room code alone (`4A12`); the task and worktree it belongs to
are **attributes discoverable from the room's record**, not parts of its address. The two are
different lookups on purpose — addressing optimizes for memory, containment for structure. The cost
to accept is that room codes run as a simple per-floor sequence (opening order on the floor), not
grouped by task.

Where global uniqueness genuinely is needed, it can be composed (e.g. floor number + room code). A
**session** takes the middle path: its id is allocated **unique among the open sessions in the
workspace** — if a name is taken, the next gets a discriminator (`riley-1`, then `riley-2`) — so a
**bare session id is a sufficient address** for every operation that touches it (resume, close,
dispatch, recovery), without dragging a scope qualifier through every call. **Why workspace-unique
rather than scope-relative:** a scope-relative id is ambiguous the moment two scopes both hold a
`riley-1`, which forces every session operation to carry `(scope, id)` — a sign the model, not the
intent, was wrong; making the id as unique as a bare address needs (and no more) keeps the APIs
single-keyed and the identity still memorable. Uniqueness is only among _open_ sessions and only
workspace-wide, sized to in-flight cardinality; over history a reused id is disambiguated by time
and context like every other code. (Remaining edges — task codes, cross-workspace uniqueness, reuse
after close: `../00-foundation/open-questions.md`.)

**What gets an identity** (current intent):

| Thing     | Identity                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Project   | slug + code; the **code is a floor number** (`1`, `2`, `3…`)                                                                          |
| Task      | slug + code (scope-relative to its project may suffice); when remote-linked, also **referenceable by its remote work-item id**        |
| Room      | **floor number + room code** (`4A12`), by memorable convention; addresses the room workspace-wide without naming its task or worktree |
| Session   | slug + code, **unique among open sessions workspace-wide** (a bare id addresses it)                                                   |
| Worktree  | natural key (repository + branch)                                                                                                     |
| Workspace | the root itself; identified by location                                                                                               |
| Artifact  | addressed by scope + type + name                                                                                                      |

A session also stores a **harness handle** — the locator for its underlying harness run — but that
is a recorded _attribute_, not a second identity (like a task's remote-work-item link;
`02-sessions-and-lifecycle.md`). Every addressable thing has exactly one identity.

## Messaging, dispatch, and waking

The hierarchy is also a communication structure:

- **Dispatch** — a scope hands a unit of work (or context) _downward_ to something within it, and
  can see where it landed.
- **Report** — a scope reports status _upward_ to the scope that contains it.
- **Wake / nudge** — a scope can ask to be notified, or be notified by another scope, when a
  condition is met — e.g. a room **reporting a milestone**, or a room **completing** (the two wake
  flavors; `../02-subsystems/02-messaging-coordination.md`). A waiting scope can block on a result,
  or detach and ask to be woken later.

These are important concepts, and Ward is **opinionated about how they work** — _how_ a message is
delivered, _how_ dispatch routes, _how_ a wait is satisfied — because they overlap heavily with the
multiplexer. That opinion is recorded in `../02-subsystems/02-messaging-coordination.md`; the _what_
here is only that these three flows exist and are first-class.

> **How dispatch routes.** Two paths, by whether the sender knows the target: **direct** when it
> does (address the target identity, e.g. via the CLI resolving it to a session handle), and
> **through the originating scope's status persona** — charge nurse or house supervisor — when it
> does not, since a session knows its neighbors, not the whole workspace
> (`01-scopes-and-personas.md`). The routing _mechanism_ is owned by the messaging seam
> (`../02-subsystems/02-messaging-coordination.md`); the _what_ here is only that work flows down to
> an addressable target and the dispatcher can see where it landed.

## Forking a context (side quests)

Within any scope, work sometimes uncovers a sub-problem that would, if pursued inline, blow up the
scope's context with a detour. The model supports **forking**: a new context that inherits the
relevant context of its origin, resolves the side quest, and reports back a clean result — leaving
the origin's context focused.

A fork is **not always a pure peer detour.** A fork may be created at a **different scope and/or
persona** than its origin when that serves the work — e.g. forking a narrower, specialized context
to chase a deep sub-problem, then returning its result upward. What every fork shares is the
contract: inherit what is needed, do the side work elsewhere, return a clean result so the origin
stays focused. It inherits either by **exact-clone** (branch the origin's real session, where the
harness supports it) or by a **distilled brief** (a fresh session seeded with a compacted brief) —
the brief mode is the harness-neutral baseline. **Why:** protecting the origin's context from
detours is the prime directive in miniature. (Mechanics and modes in `01-scopes-and-personas.md`.)

## Canonical home for

- **The containment hierarchy** — Workspace → Project → Task → Worktree → Room — and the
  _levels-are-elided-not-faked_ rule.
- **The Agent / Persona / Session distinction**, and _multiple personas per scope_.
- **The two axes of a session** — scope and working directory (assembly in
  [`05-context-loading.md`](05-context-loading.md)).
- **Status: recorded at the leaves, derived above** — including the **derivation rule** (precedence
  `active ▸ paused ▸ closed`, empty container is `active`, `in-review` is a derived overlay) and
  **room occupancy derived from its sessions** (a room stores no occupancy of its own).
- **Artifacts**, their **provenance/lineage**, the **brief** type, and cross-scope
  discoverability/ownership.
- **Identity** — slug + short code, the floor/room convention, identity-need-not-mirror-containment.
- **The dispatch / report / wake flows** and **forking** as concepts (mechanisms in
  [`../02-subsystems/02-messaging-coordination.md`](../02-subsystems/02-messaging-coordination.md)
  and [`01-scopes-and-personas.md`](01-scopes-and-personas.md)).

Every other slice links here rather than redefining these nouns.

## Open questions

- **When does each level exist?** Rules for a task directly under the workspace vs. inside a
  project; when a project is warranted vs. an ad hoc task; the cheapest possible one-off.
- **Artifact taxonomy.** Beyond _brief_, which other types are first-class, and where exactly they
  live relative to scope.
- **Provenance depth**, and how a cross-task artifact reference is recorded so the borrower doesn't
  appear to own it. **Cross-task mutation:** what "specific guidance to alter another task's
  artifact" looks like concretely.
- **Identity edges.** Task codes (and whether project-relative); floor-number uniqueness within a
  workspace. _Resolved:_ session ids are **unique among open sessions workspace-wide** (Identity,
  above), and a **room code is reused** when its room is freed (the reusable-resource Room model,
  above). Whether a closed _floor_ number is reused, retired, or retained for history is still open.
  (Indexed in [`../00-foundation/open-questions.md`](../00-foundation/open-questions.md).)
- **Dispatch routing.** _Settled:_ both paths hold — direct addressing when the sender knows the
  target, routing through the originating scope's status persona when it does not. The remaining
  **mechanism** is owned by
  [`../02-subsystems/02-messaging-coordination.md`](../02-subsystems/02-messaging-coordination.md).
