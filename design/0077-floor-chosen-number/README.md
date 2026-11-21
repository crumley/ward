# 0077 — A floor at a chosen number: `ward project open SLUG --floor N`

> A floor may be opened at a number its opener chooses, provided the record has never spent it.
> Floors now list by number rather than as text, and doctor reports two floors that hold one number.
>
> **Status:** built — awaiting review · **Started:** 2026-11-20

Until this entry every floor took the next number: `nextFloor` returned one past the highest number
any project record held or had vacated. The intent leaves room for a workspace's own conventions
about floor numbers, such as low numbers for work that recurs and high numbers for work that arrives
and leaves, and says Ward neither enforces nor infers them
([`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md), _Identity_). The allocator
gave a workspace no way to practise one. The only way to put a floor on a number of its own was to
open and abandon floors until the counter reached it, and each of those floors would have retired a
number for nothing.

Two defects sit next to the allocator and are fixed here because a chosen number makes both worse.
Floors were listed in directory-name order, so `ward project list` and `ward status` printed floor
10 between 1 and 2 (observed: `0, 1, 10, 11, 12, 2, 3, …, 9`). Gaps that a chosen number leaves make
that order harder to read. Two `projects/<N>-*` directories on one number also went unnoticed: a
workspace travels, every machine holding it allocates from its own copy, and two machines that each
open the next floor before syncing produce two floors on the same number. `resolveProject` silently
took whichever the scan read first. A chosen number makes that collision more likely, because two
people reading the same convention reach for the same number.
[0058](../0058-room-collisions/README.md) handled the same shape for rooms. This entry reports the
floor case in doctor and leaves renumbering to the entry after it.

## Serves intent

- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Identity_: floor numbers
  are never reused, and floor `0` is reserved. Both rules now hold for a chosen number, since one is
  refused while anything in the record has spent it, and the ordering conventions the slice leaves
  to a workspace become something a workspace can practise.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — **§17**: the choice is checked
  and the floor written inside the one store-lock critical section the allocator already uses, so
  two openers on one machine cannot both take a number. **§20**: every refusal names what spent the
  number and what to type instead, and a collision is reported as a doctor finding. **§8**: the same
  order and the same `chosen` fact reach the human listing and `--json`.

## Scope

- **In:**
  - **`--floor N` on `ward project open`**, for a human and an agent alike. The value is read as a
    string and parsed by `requireFloorChoice` (`src/workspace/projects.ts`), so a bad value is
    refused in Ward's words, not the argument parser's. `openProject` takes the parsed number and
    checks it in the critical section, against the same scan the allocator reads.
  - **What counts as spent.** `spentFloors` reads every `projects/<N>-*` directory on its own and
    records what spent each number. A number is **held** when a floor's record stands on it, open or
    closed. It is **retired** when a record names it as `previousFloor`, the number the standing
    project left when it moved to floor 0 ([0041](../0041-ground-floor/README.md)). It is spent by a
    **directory** when the directory leads with it but its record will not read, or reads as another
    floor. The directory counts because every task address under it composes with its number.
  - **Unchosen numbering is unchanged in rule** and now reads the same scan: one past the highest
    ordinary number ever spent. A chosen number counts like any other, so after `--floor 40` the
    next unchosen floor is 41.
  - **Refusals**, each naming what to do instead (choose a number never spent, or leave `--floor`
    out and take the next, which the record-dependent refusals name):
    - `0`: it is the ground floor's, reserved in every workspace.
    - anything not a whole number, a negative included (`--floor -3` and `--floor=-3` alike).
    - a number above **999**, the ceiling (reasons under Design).
    - a number a floor holds, naming the floor by slug and directory:
      `floor 4 is held by alpha
      (projects/4-alpha)`.
    - a retired number, naming the floor that retired it and where it moved:
      `floor 3 was retired
      by workspace (projects/0-workspace), which stood on floor 3 before it moved to floor 0`.
    - a number spent by an unreadable directory, pointing at `ward doctor`.
  - **Floor order.** `projectDirs` (`src/workspace/scan.ts`) sorts by the number a directory leads
    with, then by name, and `readProjects` sorts by the record's floor (a stable sort over that
    order). Every listing (`project list`, `status`, their `--json`), every scan over tasks and
    sessions, and every resolver that takes a first match reads one of the two. The floors' tmux
    identities (`floorIdentities`, `src/agent/naming.ts`) keep the first directory on a shared
    number instead of the last, so they agree with `resolveProject`.
  - **Doctor `floor collisions`** (warn), one finding per number that more than one directory leads
    with. It is read from directory names alone, so an unreadable record is still counted. The
    finding names each floor by its directory, says that a verb given the number reaches the first
    by name and that the number's task addresses (`f<N>t<room>`) cover rooms on all of them, and
    ends with one remedy sentence kept in `floorCollisionRemedy` so the renumbering verb can be
    named there once it exists.
  - **JSON and schema.** `project open --json` gains `chosen: boolean`, documented in
    `ward schema project open`. The record shape does not change, so no format level is raised.
  - **The root manifest** (`src/workspace/templates.ts`) gains one bullet on `--floor`, what spent
    means, the default numbering and the doctor report. The outgoing default's hash is appended to
    the lineage and the pin is moved.
  - **Tests** (`test/cli/floor-choice.test.ts`, in-process): allocation at a chosen number and the
    unchosen number that follows, the parse, each refusal (each opening nothing), list and status
    order with their `--json`, a two-machine collision reproduced by clone and pull with doctor's
    finding, the empty case, and the schema.
- **Deferred:**
  - **Renumbering a floor.** _Why safe:_ a collision loses nothing. Both directories and every
    record under them stand. `resolveProject` now answers deterministically with the first by
    directory name, and every task stays nameable, by its room address where that is unique and by
    0058's slug-qualified address where it is not. Renumbering also has to rewrite the floor's
    directory and every path that quotes it: the floor view, worktree directories and records, and
    the recorded working directory of open sessions. That is a verb with its own design, and it is
    the next entry's.
  - **Refusing floor verbs on a collided number.** A verb given a collided number reaches the first
    floor by name. Refusing, as an ambiguous room address does, would also block every floor verb on
    both floors until a renumber exists, so it is left for the renumbering entry, which can offer
    the remedy in the same refusal. _Why safe:_ doctor names the collision and which floor a verb
    reaches, so nothing happens silently.
  - **A ceiling on unchosen numbers.** The allocator still has no ceiling. _Why safe:_ only a choice
    can jump the counter, and choices are capped at 999. Unchosen numbering passes 999 only after
    hundreds of floors, far past the lifetime counts the intent sizes for.
- **Acceptance:**
  1. `env -u WARD_AGENT mise run check` is green: static, fast and live tiers.
  2. `bun test test/cli/floor-choice.test.ts` passes. Its cases are named in Scope.
  3. `bun test test/workspace/lineage.test.ts` passes with the new pin and the 0068 manifest in
     history.
  4. In a scratch workspace (`WARD_CONFIG_DIR` and `WARD_STATE_DIR` redirected):
     `project open alpha
     --floor 12`, `project open beta` and `project open gamma --floor 5`
     open floors 12, 13 and 5, `project list` prints `0, 5, 12, 13`, and `project open x --floor 12`
     refuses with `floor 12 is held by alpha (projects/12-alpha) … the floor takes the next (14)`.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **Spent is read from the directories, not only from the records.** The old allocator read
    records alone, through `readProjects`, which throws on the first record that will not read. The
    alternative was to keep that and let an unreadable record block every open, as it already does
    through the identity scan. It was attractive because it changes nothing. It lost because a
    number's directory, not its record, is what task addresses compose with. A directory that is
    present but unreadable, which is what a half-applied sync or a hand edit leaves, still owns its
    number, and an allocator that skipped it could hand the number out again. The cost is a tolerant
    read that swallows any error from one record. It is confined to `spentFloors`, and every other
    reader still throws. An unchosen open in such a workspace still refuses, at the identity scan,
    with the record's own parse error.
  - **The default stays one past the highest number ever spent.** The alternative was the lowest
    number never spent, which would fill the gaps a chosen number leaves. It was attractive because
    it keeps numbers short. It lost because it hands out numbers out of opening order: a later floor
    would read as older than an earlier one, and a workspace that left 2–9 free for a convention
    would find its next unchosen floor on 2. The rule also keeps the intent's own sentence true,
    that the next project takes the next number. The cost is that one large choice moves every later
    unchosen floor past it, which is the reason for the ceiling. This default was chosen for the
    build rather than ruled by intent, so [`intent-feedback.md`](intent-feedback.md) raises it.
  - **The ceiling is 999.** Without one, a slip such as `--floor 1200` for `120` would be paid by
    every floor opened afterwards. Three digits keeps a task address at seven characters at most
    (`f999t99`), the same sayable-and-typable bound the room ceiling (`ROOMS_PER_FLOOR`, 99) serves,
    and it is far above any lifetime floor count the intent sizes for, while leaving room for
    conventions such as hundreds-for-kinds-of-work. A lower ceiling such as 99 was considered and
    lost: it would rule out exactly the spaced-out conventions the choice exists for. The ceiling
    applies to choices only (see Deferred).
  - **Parsed by Ward, not by the argument parser.** The option is a string. `integer()` from the
    parser would have refused `seven` and `2.5` in its own words, with no remedy, and would not know
    the ground floor's reservation. A string costs one parse in Ward and gains a single voice for
    every refusal of a bad number. The parse refuses before the lock; what the record has spent is
    checked under it.
  - **`chosen` in the JSON report.** The report already carries `floor`, so the question is whether
    a caller needs to know how the number came about. It does: a caller that passed `--floor` can
    confirm its choice was taken as asked, and one that did not can see that the number was Ward's.
    The field is always present (`false` when unchosen), so callers need no presence check.
  - **Collisions are warn, the same as rooms.** Nothing is lost, and every floor and task can still
    be reached. Unlike a room, the collision does not clear when work closes, because a floor number
    is never reused, so the finding says it stands until all but one floor holds another number. It
    does not promise a verb that does not exist yet.
- **Layout:** the meaning of "spent" lives in one function, `spentFloors`, which both allocation and
  the choice read, so the number Ward picks and the numbers it refuses cannot disagree. Floor order
  is fixed in the two scan functions, `projectDirs` and `readProjects`, and not at each listing, so
  that no surface sorts for itself. The doctor check reads directory names with `dirFloor`, the same
  reader the order uses.
- **Mechanisms:** `openProject` calls `spentFloors`, then `requireUnspent` (for a choice) or
  `nextFrom` (for the default), then the identity pick, all inside `withStoreLock`. The floor is
  committed in that same section. `nextFloor(root)` remains for callers outside an open and reads
  the same scan.

  **For the renumbering entry:** a renumbered floor must keep its old number spent. Today
  `previousFloor` is the only stored way to retire a number. It is a single optional integer that
  only the 0041 relocation writes, and its refusal wording assumes that relocation ("before it moved
  to floor N"). A floor renumbered twice, or a ground floor that had already moved and is then
  renumbered, needs more than one retired number, which is a record-shape change and probably a
  format level. `floorCollisionRemedy` in `src/workspace/doctor.ts` is where the finding should
  start naming the verb.
