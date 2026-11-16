# 0058 — Rooms two machines both handed out: `f5t45-distill-2026-10-18`

> A task that shares its room with another open task is addressed by its room and slug,
> `f<floor>t<room>-<slug>`, the floor plus its record's directory name. Doctor reports the room
> until all but one holder closes, and allocation stays offline and unchanged.
>
> **Status:** built — awaiting review · **Started:** 2026-11-14

[0036](../0036-floor-addressed-tasks/README.md) made `f<floor>t<room>` a task's full address, which
names exactly one container and one room. That holds while one allocator hands out rooms. A
workspace travels in git, though, and every machine that holds a clone is an allocator reading only
its own copy of the record. `nextRoom` picks the room after the floor's most recently opened task.
Two machines that each open a task before their records sync therefore read the same cursor and pick
the same room. Once the records sync, the floor holds two open tasks in one room.

The record shows it. Floor 5 of a workspace shared by a laptop and an unattended VM holds three such
pairs: `f5t45`, `f5t46` and `f5t47` each have one task opened by the VM and one opened on the
laptop. The laptop's copy of the remote main line did not move between mid-October and 2026-11-08,
when one `pull --rebase` brought three weeks of the VM's journal in at once. Every spelling that
could name those six tasks refuses: `f5t45` is ambiguous, the bare `t45` is ambiguous, and the
refusal names both candidates as `f5t45`, the one spelling that cannot work. None of the six can be
shown, linked, paused, or closed. [0053](../0053-legacy-task-address/README.md) closed the same gap
for legacy tasks by giving them an address that composes. This entry does the same for a room two
machines both handed out.

## Serves intent

- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Identity_: where uniqueness
  is genuinely needed it is **composed**. Room plus slug composes the way floor plus room does: it
  is derived from containment (the record's directory), never stored. Codes stay sized to
  cardinality, because the qualifier appears only where a collision makes it necessary.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — Ward **prefers the full
  address** when it speaks, and refuses an ambiguous shorthand by naming the candidates. Each
  candidate is now named by a spelling the verb accepts.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — **§8**: the `address` in
  `--json` and the address on a human line are the same string, and both resolve. **§20**: a
  collision degrades to a named, usable answer and a doctor finding rather than a dead end. **§3**
  and **§4**: allocation stays local, and opening a task never reaches for the network.

## Scope

- **In:**
  - **The spelling** (`src/workspace/address.ts`). Any address form may carry a slug qualifier:
    `f5t45-distill-2026-10-18`, `legacy-t2-seam`, or the bare `t45-distill`, case-folded. The
    qualifier narrows the room to the one task whose record directory is `t<room>-<slug>`.
    `qualifiedAddress` composes it for any task. `distinctAddress(task, all)` is the address Ward
    speaks: the room address whenever that resolves to this task, otherwise the qualified one.
    `collidingRooms` lists the floor rooms that more than one open task holds.
  - **Every task-addressed verb accepts it**, through the two resolvers. `addressMatches` checks the
    slug when one is given. Both resolvers refuse through one `ambiguous` helper. It names a
    candidate as `f1t2 (slug)` when the room alone names it, and by its qualified address alone when
    another task holds the same room.
  - **Ward speaks it wherever an address must resolve.** That covers the `address` in `task list`
    (computed over the whole workspace, so a filter that drops one holder cannot make the other's
    room look unique), in `status` and `task show`, and in `task show`'s `next` command. It also
    covers completion, the doctor brief remedy, the mutation echoes and `--json` of `pause`,
    `resume`, `pr`, and `worktree create|rebase`, the address derived from the working directory,
    and the address the upgrade vehicle hands back to its own resolvers.
  - **Doctor** (`room collisions`, warn): one finding per contested room, naming each holder by its
    qualified address, the likely cause, and the remedy. Each holder is addressed as shown, and the
    room clears when all but one close.
  - **The manifest** (`src/workspace/templates.ts`) describes the case and its spelling. The
    outgoing default's fingerprint is appended to the lineage, so installed workspaces read stale
    and upgrade.
  - **Tests**: `test/workspace/address.test.ts` covers parsing, the naming table (open/paused/closed
    rivals, other floors), the property that every spoken address resolves to its own task only, and
    `collidingRooms`. `test/cli/room-collisions.test.ts` reproduces the live shape: a workspace is
    cloned as a second machine, each copy opens `f1t2` before syncing, and the clone's journal is
    pulled back. On that workspace the file checks the refusals,
    `show|pr|pr --unlink|pause|resume|
    close` through the qualified address, `task list --json`
    (filtered too), doctor, closing one holder, and the next open taking a fresh room.
- **Deferred:**
  - **A `ward task renumber` verb.** _Why safe:_ the qualified address already lets every verb reach
    the task a renumber would rename, so nothing is stranded. The collision dissolves without a
    renumber when all but one holder closes, because a room is a slot that empties. A renumber also
    rewrites what quotes the room: the record directory, the worktree directories
    (`<address>-<branch>` under the floor's view), the worktree records' paths, and the recorded
    working directory of every open session. Doing that under a live agent standing in the worktree
    breaks `session resume`, the one guarantee a session record exists to keep. A renumber can be
    built later if collisions turn out to outlive their tasks.
  - **Checking the remote before allocating.** _Why safe:_ the alternatives below reject it as the
    fix. Leaving it out loses nothing, because the qualified address covers whatever a check would
    have prevented.
- **Acceptance:**
  1. `bun install --frozen-lockfile && mise run check` is green, and green again with `CI=true`.
  2. `bun test test/workspace/address.test.ts` passes. `f5t45-distill-2026-10-18` and its upper-case
     spelling parse with the slug. `f5t45-`, `f5t45--x`, `f5t45:distill`, and `f5t100-x` do not
     parse. Every address `distinctAddress` speaks matches exactly its own task.
  3. `bun test test/cli/room-collisions.test.ts` passes. With `f1t2` held twice, `task show f1t2`
     and `task pause t2` refuse with
     `is ambiguous — f1t2-distill-2026-10-25, f1t2-weekly-rituals-design; name one`. Every verb
     works through the qualified address. Doctor warns once. After one holder closes, `f1t2`
     resolves to the other.
  4. Against the live workspace, read-only: `task list --floor 5 --json` gives the six colliding
     tasks qualified addresses, `task show` resolves each of them, and `doctor` names `f5t45`,
     `f5t46`, and `f5t47`.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **The slug qualifies the room; the machine does not.** The record does not know which machine
    opened a task. Task records carry no machine, and the journal commit records a git author, which
    is the same person on both machines. Only the task's session ids carry `@machine`, and a task
    can have no session at all, or sessions from several machines. A machine suffix would therefore
    first need a new stored field, and could never name the tasks already in the record. The slug is
    already there. With the floor in front, it is the record's own directory name, and two tasks in
    one container cannot share a directory, so the qualified address is unique by construction. It
    also reads as what the task is for, where `@ws-main` reads only as where it ran. The cost is
    length: `f5t45-distill-2026-10-25-conflicts` is long. It is paid only while a collision lasts,
    and only for the tasks in it.
  - **A hyphen, not a colon.** `f5t45:distill-2026-10-18` separates the parts more visibly. It lost
    for 0053's reason: addresses travel into worktree directory names and stewardship branch names,
    where `:` is not legal in a git ref. The hyphen form is also the spelling a human already sees,
    the task directory and usually the worktree directory, so it can be copied from a path.
  - **Qualified only when needed.** The alternative is to speak `f5t45-<slug>` for every task, which
    would make the address one spelling forever. It lost on the identity rule that codes are sized
    to real cardinality: almost every room has one holder, and a five-character address is what
    makes a task sayable. The qualified form is accepted for every task, so a script that wants
    stability can always use it. Ward speaks it only where the room address would not resolve. The
    rule follows how the resolvers read a room: open work first, then closed. An open task is
    qualified when another open task holds its room. A closed task is qualified when any other task
    does. The cost is that a task's spoken address can change when a rival appears or closes. The
    qualified form never stops working, so a copied line still resolves.
  - **Collision-tolerant allocation, not collision-free.** Three ways to prevent the collision were
    weighed:
    - _Rooms namespaced by machine_ (`f5t45@mac`, or disjoint room ranges per machine) is what makes
      session ids safe, and it lost on the intent's own distinction. A session id is the address of
      a record that must never be written over, so it pays for global uniqueness. A room is a slot
      that empties and refills, so it is sized to the work in flight. A machine part would make
      every room address longer and harder to remember on every machine. Most workspaces run on one
      machine, and those would gain nothing from it.
    - _Checking the remote before allocating_ needs the network at `task open`. That breaks the
      offline model (§3, §4) and adds latency and a failure mode to every open, including unattended
      ones. It also misses the observed case: the laptop's remote-tracking ref went three weeks
      without moving. Reading the last-fetched ref adds no network, but it closes only the gap
      between a fetch and its merge, which the sync already closes. A live fetch helps only when the
      other machine has already pushed. Either way the collision stays possible, so the address work
      is needed regardless.
    - _Detect and renumber_ is deferred in Scope, with its reasons.

    What remains is to make the collision harmless, visible, and self-clearing. Every holder is
    addressable, every listing and refusal names it so, doctor reports the room, and the room clears
    when its holders close. The cost of this choice is that collisions keep occurring whenever two
    machines open tasks while out of sync, and each one shows longer addresses until it clears. The
    room allocation is unchanged: once the records meet, the contested room counts as occupied, so
    the next open on either machine takes a fresh one.
  - **Doctor warns rather than errs, and names no close.** Nothing is lost and every verb works, so
    an error would overstate it. The remedy names `task show` and how the collision ends, not a
    `task close`. Whether either task is finished is the human's judgement (§18).
- **Layout:** the address module keeps sole ownership of the address. The naming rule
  (`distinctAddress`) and the collision scan (`collidingRooms`) sit beside the parse and the
  matcher, as pure functions over `{dir, record}`, so the scan layer, status, doctor, and completion
  all reach one rule. `scan.ts` owns the one ambiguity refusal both resolvers throw, and
  `resolvableAddress(root, task)` serves a caller that holds one task and needs to speak it or hand
  it back to a resolver. `taskAddress` is unchanged and still composes the room address for paths,
  branch names, journal subjects, and the telemetry scope. Those name a room's container on disk,
  and renaming them would move live worktrees.
- **Mechanisms:** _Parsing:_ one pattern, `^(?:(legacy-)|f(\d+))?t(\d+)(?:-([a-z0-9][a-z0-9-]*))?$`,
  case-folded. The slug group follows the slug rule (`requireSlug`). _Matching:_ room, then slug
  when given, then container, as in 0053. _Naming:_ the rivals are the other tasks with the same
  room address. A non-closed task is contested by a non-closed rival, and a closed task by any
  rival. A contested task is spoken qualified. _Supersession:_ 0036 is not superseded as a whole.
  The one claim replaced here is that `f<floor>t<room>` names at most one open task. It does so per
  allocator, and the slug-qualified form is the full address where two allocators met.
