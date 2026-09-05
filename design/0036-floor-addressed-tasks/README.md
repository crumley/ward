# 0036 — The task address: `f3t1`, rooms in opening order, and a glance that forgets

> A task on a floor is addressed `f<floor>t<room>` — the room composed with its floor, derived from
> the record and spoken everywhere Ward names a task — with the bare room kept as a shorthand that
> resolves while it is unique and refuses by name when it is not. Rooms are handed out in opening
> order round a 99-room floor rather than reused the moment one closes, and `ward status`,
> `ward task list`, and `ward project list` drop work that settled more than a week ago, saying what
> they dropped and how to see it.
>
> **Status:** built — awaiting review · **Started:** 2026-09-04

A task code is allocated as the smallest room no open task holds, workspace-wide, and every
task-addressed verb resolves a bare code against the open set. Two failures follow from that, and
both are on the record. The first is collision across floors: five floors and the bare pool can each
hold a `t1`, so `t1` names five live tasks at once and every verb that takes it picks the first the
scan happens to reach. The second is collision across time: a close frees a room immediately, so the
next open takes it — a close sweep aimed at a delivered `t18` once closed a freshly opened `t18`
seconds after its creation, and the work had to be reopened under a new code. An identity that
changes hands within seconds is an identity the record cannot be trusted on (§11, §16): briefs,
session logs, and a human's memory all name a task by a string that has quietly moved.

The intent already holds the answer for the neighbouring noun. A room composes its address from its
floor and its room code (`4A12`) precisely because in-flight cardinality is high and per-floor
sequences keep the codes tiny; the task was given a bare workspace-unique code instead, on the
argument that it is operated on far more often than it is browsed. That argument survives — a bare
room is still what a human types most of the time — but it does not require the bare form to be the
_only_ form. Composing the address the way a room's is composed makes it unambiguous, and keeping
the bare form as a shorthand keeps it cheap: the shorthand is offered where it works and refuses,
naming its candidates, where it does not.

The third failure is one of attention rather than identity. `ward status` prints every task the
workspace has ever held; on a workspace a few months old that is seventy lines, sixty-eight of them
closed, and the two lines that can still be moved forward are lost among them. The attention surface
exists to route attention ([0004](../0004-work-spine/README.md)'s derived status,
[0009](../0009-live-forge-state/README.md)'s needs-you), and a listing that never forgets defeats it
by volume. This entry filters the glance rather than the record, and — since the room a closed task
held is about to belong to someone else — stops printing that room for closed work at all.

## Serves intent

- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Identity_: the address is
  **composed** where global uniqueness is genuinely needed, exactly as the slice already prescribes
  for rooms, and stays **derived, never stored** (Status: only what cannot be derived is recorded
  above the leaves). The slice still says a task code is workspace-unique among open tasks; where
  this build reads that differently, [`spec-feedback.md`](spec-feedback.md) says so rather than
  rewriting it.
- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _size codes to real
  cardinality_ and _time is another ambiguity-breaker_: 99 rooms per floor is sized to the observed
  lifetime task count of a container, and the opening-order sequence is what makes time actually
  available as the ambiguity-breaker the slice relies on.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — _"what needs me?" is a first
  class query_ presented as **one glanceable answer**: the window is what keeps the glance
  glanceable. _Supply nouns by recognition_: completion offers full addresses, so what the shell
  fills in is what the verb accepts. _Asymmetry (§8)_: the ambiguous shorthand is a deterministic
  refusal naming every candidate, never a prompt.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — **§16**: the record keeps
  carrying the room as `code`; the address is derived from it and containment, so there is no second
  identity to keep in step. **§20**: an ambiguous shorthand degrades to a named lesser answer (the
  candidates) rather than a guess, and a windowed listing always says it is windowed. **§6**: the
  filter is a pure function of the records and the clock, and `--all` is the exact inverse.
- [`03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md) — the lifecycle is
  untouched: this entry changes how a task is addressed and displayed, not what states it has or how
  it closes.

## Scope

- **In:**
  - **The address, derived in one place** (`src/workspace/address.ts`): `taskAddress`, `taskFloor`,
    `taskRoom`, `parseTaskAddress`/`requireTaskAddress`, `nextRoom`, and `ROOMS_PER_FLOOR`. The
    module imports only the error type, so every layer can reach it without an import cycle. No
    record changes: `code` stays the room, and every existing record composes an address unchanged.
  - **Resolution over the address** (`src/workspace/scan.ts`, `resolveOpenTask`): the full address
    resolves or refuses; a bare room resolves while exactly one open task in the workspace holds it
    and otherwise refuses naming every candidate by address and slug. Parsing is case-insensitive; a
    non-address argument is refused as a bad argument, not reported as a lookup miss. Every
    task-addressed verb inherits this — `task pause|resume|pr|close`, `worktree create|rebase`,
    `session open TASK`, `workspace upgrade TASK`, the close cascade, and the scope-from-cwd echo.
  - **Ward speaks the address** wherever it names a task to a human: mutation echoes
    (`opened f3t22 — slug`), status and task-list lines, the freshness sub-line's remedy, needs-you
    entries and their commands, worktree-list rows, the cwd-derivation echo, the self-service
    upgrade's steps and refusals, doctor's worktree finding, the repository-removal refusal, and the
    telemetry scope (`task:f3t22`). Completion (`src/cli/suggest.ts`) offers full addresses only.
  - **`address` in `--json`** on every shape that carries a task: `task list`, `status` (tasks and
    needs-you entries), `worktree list`, `worktree create`, `worktree rebase`, and every task
    mutation. `code` keeps its name and meaning beside it. `ward schema` documents both.
  - **New worktree paths carry the address** (`worktrees/f3t22-<branch>`); existing worktree records
    carry their own `path`, so nothing on disk moves, and branch names are unchanged.
  - **Allocation in opening order** (`src/workspace/tasks.ts`): each container — every floor and the
    bare pool — runs its own sequence from its most recently opened task's room, wrapping at
    `ROOMS_PER_FLOOR`, skipping rooms open tasks hold and the derived-slug directory guard
    [0030](../0030-upgrade-self-service/README.md) added. A container with every room held refuses,
    naming the floor and the remedy.
  - **The settled-work window** (`src/workspace/status.ts`): `SETTLED_AFTER_DAYS = 7`;
    `settledTask`, `settledProject`, and `glanceOrder` are exported so `status`, `task list`, and
    `project list` apply one rule. Each verb takes `--all`, prints a footer naming what it hid, and
    carries a `hidden` summary in `--json` — always present, zeroed under `--all`.
  - **Closed work is shown by slug and date**
    (`· picker-returns-cue [closed · delivered ·
    2026-08-22]`), open work by address; open sorts
    before closed within a container. `--json` is unchanged in this respect: a closed task still
    carries `code` and `address`.
  - **The manifest** (`src/workspace/templates.ts`): the address, the shorthand rule, the window,
    and the agent's obligation to pass the full address; the outgoing default's fingerprint appended
    to the lineage ([0020](../0020-deterministic-upgrade/README.md)'s mechanism) so existing
    workspaces upgrade.
  - **Tests**: `test/workspace/address.test.ts` (composition, parsing, the room sequence, resolution
    and its refusals, continuity against a seeded container) and `test/cli/settled-window.test.ts`
    (the filter, the footer, `--all`, the `hidden` summary, the closed-by-slug rendering, the sort),
    plus the existing suites carried to the new addresses and shapes.
- **Deferred:**
  - **A time-based reuse delay** ("no room comes back within N days"). _Why safe:_ the round-robin
    already delivers what such a rule is for — the whole floor is spent before anything repeats —
    and it does so from the records alone, with no clock in the allocation path. A delay would add a
    second rule that can refuse an open on a workspace with rooms free, for a guarantee the first
    rule already gives.
  - **`ward task move ADDRESS --project N`.** _Why safe:_ a task changes floors rarely and the move
    is available today by closing and reopening — which is also what makes the address stable in the
    meantime. Building the verb without first settling what happens to the worktree paths, the
    branch names, and the PR links recorded under the old address would be building the disruptive
    half of it.
  - **A configurable window.** _Why safe:_ `--all` is the escape hatch for every case the default
    gets wrong, and it costs nothing to type; a knob would ask the human to decide something the
    surface can decide for them, and would make two workspaces' `ward status` mean different things.
  - **Hiding closed sessions.** _Why safe:_ `status` lists only a task's OPEN sessions, so the
    listing this entry filters has no settled sessions in it to hide; a surface that lists sessions
    in their own right does not exist yet, and it should carry its own decision about what it
    forgets rather than inheriting a rule written for tasks.
  - **A floor picker, and any mechanism behind the floor tiers.** _Why safe:_ where a project lands
    is a naming practice, not a rule (Design, below) — floor numbers are monotonic and never reused,
    so there is nothing to enforce; a routing default belongs to whatever records the association,
    and needs no picker either way.
- **Acceptance:**
  1. `mise run check` green.
  2. `bun test test/workspace/address.test.ts` — `f3t1`/`t18` compose from containment and from the
     record's field; `F3T1` parses and `3t1`, `3-1`, `t0`, `t100` do not; the sequence continues
     from the container's most recent room, wraps at 99, skips held and blocked rooms, and returns
     no room when the floor is full; two floors' room 1 both resolve by address; a bare `t1` held by
     two floors refuses naming both, and resolves again once one closes.
  3. `bun test test/cli/settled-window.test.ts` — a task closed 30 days ago and a floor whose every
     task settled are absent from `status`, `task list`, and `project list`; a close two days old is
     present, rendered by slug and date; the footer names the counts and the flag; `--all` restores
     everything; `hidden` is present in all four `--json` documents and zeroed under `--all`.
  4. `bun test test/workspace/spine.test.ts test/cli/mutation-json.test.ts test/cli/self-service.test.ts`
     — a freed room is not handed straight back; mutation echoes, worktree paths, and JSON documents
     carry the address.
  5. In a throwaway workspace: `ward task open a --project 2` echoes `opened f2t1 — a`;
     `ward worktree create F2T1 --repo NAME` succeeds and creates `worktrees/f2t1-a`;
     `ward schema task list` shows `address` required and a `hidden` block.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **Compose the address; do not renumber the rooms.** The alternative was making task codes
    globally unique — one workspace-wide sequence, `t1`…`t70` — which removes the ambiguity outright
    and needs no new spelling. It lost on the intent's own reason for per-floor room codes: a code
    the human keeps in their head must stay small, and a workspace-wide sequence grows without bound
    while a floor's does not. Composition also costs no migration, because it changes nothing the
    record stores. The cost is a second spelling to teach — `f3t1` and `t1` name the same task —
    paid down by making the full address the one Ward itself always speaks and completion always
    offers, so the shorthand is what a human types, never what Ward answers with.
  - **The shorthand refuses rather than picks.** Resolving a bare `t1` to "the first match in scan
    order" was the behaviour being replaced, and disambiguating by recency ("the most recently
    opened `t1`") was the tempting middle. Recency lost because the caller cannot see it: two live
    tasks named `t1` are equally plausible referents, and a verb that silently chose the newer one
    would make `ward task close t1` mean something different on Tuesday than on Monday, on exactly
    the operation that is hardest to undo. The refusal names every candidate with its slug, so the
    fix is a copy-paste. The cost is that a bare code that worked yesterday can refuse today, when a
    second floor opens the same room — which is the honest report of a real ambiguity, and is why
    completion offers only addresses.
  - **Opening order, not smallest-free, and no time-based delay.** Smallest-free is one line and
    keeps addresses dense; it is also precisely what handed a closed task's room to a new task
    seconds later. A time-based reuse delay was the other candidate and reads well in the abstract,
    but it needs a clock inside the allocation path and can refuse an open on a floor that has rooms
    free — a failure mode with no good message. Going round the floor gets the same guarantee from
    the records alone: a room comes back only after the container has spent every other one, which
    on the observed rate is many months. The cost is sparse-looking addresses (`f3t22` on a floor
    holding two open tasks) and a cursor that must be derived by scanning `openedAt` across closed
    records too — both cheap, and the second is the same scan the resolver already does.
  - **Ninety-nine rooms.** The ceiling sets the address width, which is the whole point of the
    scheme: two digits keeps `f3t22` at five characters. Nine was considered and rejected as too
    small to outrun reuse on a busy floor; 999 buys nothing a workspace will ever use and costs a
    character on every address a human types. It is a named constant with its reasoning beside it,
    not configuration — a workspace that could change it would be a workspace whose addresses mean
    something different from every other one's.
  - **Containment answers "which floor?", with the record's field as backup.** The task record
    carries an optional `floor`, and the directory carries one too. The directory wins because it is
    where the task actually is; a record whose field disagreed with its location would be describing
    somewhere else, and the address must name where the task can be found. The field still answers
    for a record read outside its tree. Neither is a second identity: both feed one derivation.
  - **`task list` and `project list` become objects.** The two listings were bare JSON arrays, and
    the additive-evolution policy ([0005](../0005-agent-audience/README.md)) would have kept them
    that way. They could not: a windowed array is byte-for-byte indistinguishable from a complete
    one, so an agent reading a filtered listing would have no way to know it was filtered — the
    silent-lesser-answer §20 forbids. Wrapping them (`{ tasks | projects, hidden }`) is the smallest
    change that lets the document say what it left out. This is a **breaking** shape change, the
    first in the contract's life; it is named here, in the entry, and `ward schema` carries it. The
    cost is that a consumer indexing the document must read `.tasks` / `.projects`; `status` was
    already an object and only gained a field.
  - **The window filters the display, never the derivation.** Status is derived over every record —
    the rollup, the in-review overlay, needs-you, freshness — and only the listing is filtered
    afterwards. Deriving over the filtered set would have been marginally cheaper and would have
    made a floor's status depend on when you asked, which is a different answer to "where does
    everything stand", not a shorter one.
  - **A closed task is named by its slug.** Printing the room of a closed task names the slot rather
    than the work, and after this entry that slot belongs to whoever takes it next — which is
    exactly how a list of six `t1`s came to be unreadable. The slug is what distinguishes closed
    work to a human, and the close date is the second ambiguity-breaker the intent already leans on.
    `--json` keeps both fields: the record is the record, and this is a rendering rule.
  - **The standing project never settles.** Its floor is the home for work on the workspace itself
    and it never closes, so a settled-looking standing project (every stewardship task delivered
    long ago) would drop the one floor that is always relevant. It is exempted explicitly rather
    than by accident of its state.
  - **The floor tiers are a naming practice, not a mechanism.** Low floors for recurring maintenance
    and high floors for transient feature work is a convention a human can follow today with no code
    at all, because floor numbers are monotonic and never reused — there is nothing to enforce and
    nothing to configure. Building a tier mechanism would fix an ordering the record deliberately
    leaves to judgment.
- **Layout:** `src/workspace/address.ts` is the new module and the single home for the address —
  every other file calls into it, and none of them re-derives a floor or re-parses a code. `scan.ts`
  keeps owning resolution, now expressed over that module. `status.ts` grows the window predicates
  and the glance order beside the derivation they filter, so the three listing verbs share one rule
  rather than three copies. `src/cli/index.ts` gains one identity renderer (`renderTaskIdentity`)
  and one footer renderer (`renderHidden`) used by every listing surface — the alternative, per-verb
  formatting, is how `status` and `task list` came to render the same task two slightly different
  ways. **Relationship to neighbouring entries:** the session handlers and
  `src/workspace/sessions.ts` are untouched (they resolve through `resolveOpenTask` and inherit the
  address for free), so the sessions work in flight lands beside this one; `StatusReport` grows only
  by addition.
- **Mechanisms:** _Addressing:_ `taskAddress({dir, record})` reads the floor from the directory
  (falling back to the record's field) and prefixes the room. _Resolution:_ `requireTaskAddress`
  parses, the open set is filtered by room and — when given — floor, and the arity of the result
  decides between the task, the "no open task" refusal, and the ambiguity refusal. _Allocation:_ the
  container's tasks are read under the store lock, the cursor is the maximum `openedAt` among them,
  and `nextRoom` walks forward from it modulo the ceiling, skipping held and blocked rooms; a full
  circuit returns 0 and the caller refuses. _The window:_ `settledTask` and `settledProject` compare
  a close instant against `SETTLED_AFTER_DAYS`; an absent or unparseable timestamp is never settled,
  so nothing is hidden on the strength of a parse failure. _Upgrade:_ the manifest's outgoing bytes
  are a known default, so a workspace still carrying them untouched reads as `stale` and is brought
  forward by `ward workspace upgrade`.
