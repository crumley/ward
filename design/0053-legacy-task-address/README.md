# 0053 — The legacy task's full address: `legacy-t2`

> A legacy bare task under `tasks/` is addressed `legacy-t<room>` — its pool named where a floor
> would be — so it keeps a full address once floors reuse its room, and the shorthand's ambiguity
> refusal names it by that spelling.
>
> **Status:** built — awaiting review · **Started:** 2026-11-08

[0036](../0036-floor-addressed-tasks/README.md) gave a floor task a composed address (`f3t1`) and
kept the bare room as a shorthand that resolves while it is unique among open tasks. A legacy bare
task was left with only the bare room, on the claim — repeated in
[0041](../0041-ground-floor/README.md)'s deferral of migrating them — that `t<room>` _is_ its full
address. That held only until a floor opened the same room. Rooms run in opening order round every
floor, so reuse is certain, and once it happens the legacy task has no spelling at all: the only
string that could name it is the shorthand, and the shorthand now refuses.

The record shows it. A workspace holding legacy `t2` beside `f11t2` and `f12t2`, and legacy `t6`
beside `f12t6`, cannot show, link, unlink, pause, or close either legacy task — and the refusal that
is meant to be a copy-paste fix names the legacy candidate as `t2`, the one spelling that cannot
work. 0041 rules the pool out of migration because moving a task renumbers every path that quotes
it, so the pool stays, and its tasks need an address that composes the way a floor task's does.

## Serves intent

- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Identity_: where uniqueness
  is genuinely needed it is **composed**; the legacy pool composes with its room exactly as a floor
  does, and the address stays derived from containment, never stored.
- [`07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — Ward **prefers the full
  address** when it speaks and refuses an ambiguous shorthand naming the candidates; the candidates
  are now always named by a spelling the verb accepts.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md) — **§8**: the `address` in
  `--json` and the address on a human line are the same string, and both resolve. **§20**: the
  refusal degrades to a named, usable answer rather than a dead end.

## Scope

- **In:**
  - **The spelling** (`src/workspace/address.ts`): `legacy-t<room>` parses (case-folded) to the
    legacy pool and room; `taskAddress` composes it for every task with no floor; `LEGACY_PREFIX` is
    its one home. `addressMatches` and `spellAddress` are the shared matching and canonical
    spelling, so the open-only resolver (`resolveOpenTask`) and the read resolver
    (`resolveTaskForRead`, behind `task show`) cannot disagree on what an address names. The
    not-an-address refusal names all three forms.
  - **Every task-addressed verb accepts it**, by inheritance through the two resolvers — as 0036
    describes for the floor form. Its refusals name the legacy pool
    (`no open task at legacy-t9 —
    the legacy pool (tasks/) holds no open task in room 9`).
  - **Ward speaks it** wherever it names a legacy task: the ambiguity refusal, status and list
    lines, mutation echoes, journal subjects, completion, doctor's legacy finding, and `address` in
    every `--json` shape. `code` stays the room, unchanged.
  - **The manifest** (`src/workspace/templates.ts`) names the legacy form and says the refusal names
    each candidate by its full address; the outgoing default's fingerprint is appended to the
    lineage so installed workspaces read stale and upgrade.
  - **Tests**: `test/workspace/address.test.ts` (parsing, composition, resolution beside a floor
    task in the same room, closed-is-unaddressable) and `test/cli/legacy-address.test.ts` (the
    refusal text, and `task show|pr|pr --unlink|close|pause` and `task list --json` through the new
    address), with `ground-floor.test.ts` and `lineage.test.ts` carried forward.
- **Deferred:**
  - **The slug as an address.** _Why safe:_ it is not needed to close the gap, and it would not
    close it — slugs are not unique, among open tasks or over history. The workspace that exposed
    this holds `worktree-context-bridge` twice, as legacy `t6` and as a paused floor task, both
    open; eight closed `workspace-upgrade` tasks share one slug by design. A slug address would be a
    second shorthand with its own ambiguity refusal, and it collides with the address space itself
    (`t2` and `f3t1` are valid slugs). It can be built later on its own merits without touching this
    spelling.
  - **Migrating the legacy pool.** _Why safe:_ 0041's reasons stand unchanged; this entry removes
    the one cost of leaving the pool in place, so nothing presses for it.
- **Acceptance:**
  1. `mise run check` green.
  2. `bun test test/workspace/address.test.ts` — `legacy-t2` and `LEGACY-T2` parse to the legacy
     pool; `ft2`, `legacy:t2`, `legacyt2`, `legacy-f3t2`, `legacy-t0`, `legacy-t100` do not;
     `tasks/t18-a` composes `legacy-t18`; with `f1t1` and legacy `t1` both open, `legacy-t1` and
     `f1t1` each resolve, bare `t1` refuses naming `legacy-t1 (from-before)`, and once the legacy
     task closes, `legacy-t1` refuses and `t1` resolves to the floor task.
  3. `bun test test/cli/legacy-address.test.ts` — with legacy `t2` beside `f1t2` and `f2t2`,
     `task show|pr|close t2` refuse with
     `t2 is ambiguous — f1t2 (…), f2t2 (…), legacy-t2 (multiplexer-seam-design); name one`; `show`,
     `pr`, `pr --unlink`, and `close` succeed through `legacy-t2`; every `address` in
     `task list --json` resolves through `task show`.
  4. Against a workspace holding legacy `t2`, `ward task show legacy-t2` shows it and
     `ward task show t2` names `legacy-t2` among the candidates.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **Name the pool where the floor goes.** The address composes container + room: `f3` names a
    floor, `legacy-` names the pool. The alternative was keeping `t<room>` as the legacy task's full
    address and resolving a bare room to the legacy task first. That needs no new spelling and lost
    at once: it makes the bare room mean two things — a shorthand for floor tasks and an exact
    address for legacy ones — and lets the legacy pool silently win a collision, the pick-one-of-two
    behaviour 0036 replaced with a refusal. The cost of the choice made is that a legacy task's
    address changes from `t2` to `legacy-t2`; the bare `t2` still resolves wherever it did before
    (it is unique), so nothing that worked stops working, and the new address is what Ward prints,
    so a copied line always works.
  - **A word, and a hyphen.** `legacy:t2` reads as clearly and was the first candidate. It lost on
    where an address travels: new worktree directories are `worktrees/<address>-<branch>`, a taken
    stewardship branch is suffixed with the address, and `:` is not legal in a git ref — so the
    colon form would have needed a second, path-safe spelling, which is a second identity. A short
    sigil (`ft2`, `_t2`, `lt2`) was cheaper to type and lost on legibility and on slips: `ft2` is
    one dropped digit away from `f3t2`, and a dropped digit must never land on a different task —
    under this grammar it parses as nothing. The cost is nine characters where a floor address takes
    five, paid only on a pool that cannot grow and shrinks as its tasks close.
  - **No slug addressing.** The alternative considered, with the reason it lost, is the first
    deferral in Scope.
  - **The legacy form is exact, not a shorthand.** The pool is closed to new opens (0041) and its
    rooms were unique among open tasks when allocated, so `legacy-t<room>` names at most one open
    task. The resolver still routes several matches to the ambiguity refusal rather than assuming
    it, so a hand-edited pool degrades to a named refusal rather than a guess.
- **Layout:** the address module keeps sole ownership of the address; the matching rule moves into
  it beside the parse (`addressMatches`), where both resolvers were each re-deriving it inline.
  Every other caller already spoke through `taskAddress`, which is why one change there reaches the
  echoes, listings, JSON, completion, telemetry scope, and worktree paths together.
- **Mechanisms:** _Parsing:_ one pattern, `^(?:(legacy-)|f(\d+))?t(\d+)$`, case-folded; the legacy
  group sets `legacy: true` and excludes a floor. _Matching:_ room first; a legacy address then
  requires no floor (containment under `tasks/`), a floor address requires that floor, and the bare
  shorthand accepts any container. _Closed tasks_ are filtered before matching in the mutation
  resolver, exactly as before, so a closed legacy task answers to neither `legacy-t2` nor `t2`;
  `task show` keeps 0036's read rule (recently settled work is shown, older needs `--all`).
  _Supersession:_ 0036 and 0041 are not superseded as a whole; the one claim they share — that a
  legacy task's bare `t<room>` is its full address — is replaced here.
