# 0006 — Scope from the working directory

> The location half of the human-shell contract, made real on the spine: standing inside a task's
> worktree, the task-addressed verbs no longer demand the code the directory already states — a
> human gets the task inferred (and echoed), a declared agent is refused the inference, and anywhere
> unclaimed the missing code is a deterministic error naming the fix.
>
> **Status:** accepted · **Started:** 2026-08-08

Second entry delivered as a Ward task in the bootstrap workspace (task `t1`, session
`scope-from-cwd-1`), building directly on [`0004`](../0004-work-spine/README.md)'s records and
[`0005`](../0005-agent-audience/README.md)'s declared caller. Until now every task-addressed verb
required an explicit code, even when the caller stood inside the very worktree a worktree record
claims — a directory that fully determines the task. The human-shell contract already licenses
ending that: Ward "derives the scope from the location and does not make the human restate what the
directory already implies." This entry builds the minimal honest version — inference from the one
location kind that exists (the recorded worktree) on the verbs where it clearly pays — and takes the
contract's asymmetry clause seriously enough to make the agent-caller call explicit.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — "workspace- and scope-aware from
  any working directory": the scope-derivation clause is the core of this entry, realized for the
  worktree → task step of its chain; its asymmetry clause (§8) is decided consciously — a declared
  agent is **refused** the inference (the decision and its why below); the "never a prompt" posture
  holds — a miss is a deterministic error, and the interactive picker stays deferred.
- [`principles`](../../intent/00-foundation/01-principles.md) §1 (context management is the prime
  directive) — the friction removed is exactly "making someone name the scope they are standing in";
  §6 (determinism) — resolution is a pure read over recorded state, same answer for the same cwd and
  records, and the derivation is echoed rather than silent; §8 (two audiences) — the affordance is
  human-facing, the agent path stays fully explicit; §16 — the _record_ claims the directory (the
  worktree record's `path`), not live git state.
- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) /
  [`domain-model`](../../intent/01-concepts/00-domain-model.md) — inference respects task identity:
  codes are unique among open tasks, so only non-closed tasks' records claim directories, and a
  closed task's stale record claims nothing.

## Scope

- **In:**
  - **Resolution of the enclosing task from the working directory** — a new pure read
    (`src/workspace/scope.ts`): when the cwd sits at or below a directory that a **non-closed**
    task's worktree record claims (the record's workspace-relative `path`), the task is resolved;
    anywhere else — workspace root, the record tree, an unclaimed sibling, a closed task's stale
    path, outside the workspace — it is not.
  - **The TASK/CODE argument becomes optional on five verbs** — `session open`, `task pr`,
    `task pause`, `task resume`, `worktree create`. An explicit code always wins; without one, a
    **human** caller inside a claimed worktree gets the inferred task, echoed
    (`task t1 — from the working directory`) so the derivation is visible, never silent.
  - **`task close` keeps its explicit code** — deliberately out of the inference set (the decision
    below).
  - **The asymmetry, decided:** a **declared agent** (`WARD_AGENT`, the 0005 predicate) is
    **refused** inference — no task argument is a deterministic error telling it to pass scope
    explicitly, even standing inside a claimed worktree.
  - **Legible misses:** a human outside any claimed worktree with no explicit code gets
    `no task given and no task worktree encloses this directory — name one: <usage>` — an error
    naming the exact fix, never a prompt.
  - **Inferred sessions record the right directory:** when `session open` infers the task, the
    session's `workingDirectory` defaults to the claiming worktree's path (the caller stands in it),
    not merely the task's first worktree; `--dir` still overrides.
  - **The workspace `AGENTS.md` teaches both sides:** the human line (verbs need no code inside a
    worktree) and the agent line (name the task explicitly; inference is a human affordance).
- **Deferred:**
  - **The interactive picker** for a missing/ambiguous task (the contract's delightful-resolution
    quality bar). _Why safe:_ every miss this entry leaves ends in a total, legible error naming the
    fix, so nothing blocks; every miss already routes through one resolver that branches on
    `callerIsAgent()`, so the picker later slots into exactly one place and is structurally barred
    from agents from birth; and the picker's own machinery (candidate ranking, accent/glyph cues)
    belongs to seams not yet built
    ([`05-visual-theming`](../../intent/02-subsystems/05-visual-theming.md)).
  - **Inference for locations other than worktrees** — the contract's chain names worktree → room →
    task → project, and record directories (`tasks/<code>-<slug>/`) also lexically imply a task.
    _Why safe:_ worktrees are the only location kind one occupies to _work_ today (rooms and
    workdirs don't exist yet); widening the claimed set later is additive to the same resolver — and
    the record-tree question is raised as SF-001 rather than answered unilaterally.
  - **Inference on `task close`.** _Why safe:_ excluded by decision, not by accident (below); the
    explicit form works everywhere, and evidence from use can reopen the call in a later entry.
  - **Scoping the read verbs by location** (`ward status` narrowed to the enclosing task). _Why
    safe:_ reads are workspace-global and unchanged; location-scoped reporting is additive and
    orthogonal to making the write verbs' target inferable.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. the resolution table — worktree root, nested subdirectory, a second task's worktree each
     resolve to their task; workspace root, the record tree, an unclaimed sibling, a closed task's
     recreated path, and a directory outside the workspace all resolve to nothing;
  2. each of the five verbs, through the spawned CLI from inside a claimed worktree with no task
     argument, acts on the enclosing task and echoes the derivation — and the inferred
     `session open` records the claiming worktree as the session's working directory;
  3. the two misses are deterministic errors naming the fix: a human outside any claimed worktree,
     and a declared agent anywhere (proven with `WARD_AGENT` through the spawned CLI);
  4. every explicit form is unchanged — explicit codes win from anywhere with nothing echoed, a
     declared agent with an explicit code proceeds, and `task close` without a code fails without
     mutating.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **A declared agent is refused inference.** The contract reserves exactly this right ("an agent
    caller may still be **required** to pass scope explicitly"), and this entry exercises it. _Why:_
    every verb that gains inference is a **write**, and a mis-inferred write is silent mis-targeting
    — the class of corruption nothing announces. A human's working directory is a place they
    deliberately stand (they see their prompt; the echo confirms the derivation); an agent's cwd is
    incidental state its harness manages, and inference would convert that incidental state into a
    mutation target. Explicitness is cheap for the side that can afford to be precise — the
    contract's own reasoning — and one `task list --json` away. The other reading (cwd is explicit,
    deterministic context, and §9 pins an agent to its directory) is real, but it argues _safety_,
    not _benefit_: the agent saves almost nothing, and the failure mode it buys is the worst one.
    This also keeps 0005's line intact — declaration changes **affordances**, never content: which
    arguments may be omitted is an affordance, and output for the same full command stays identical
    for both audiences.
  - **`task close` stays explicit.** _Why:_ close is the verb that destroys the very directory that
    would have named its target — an inferred close tears down the caller's own cwd and leaves their
    shell standing in a removed directory; and the gated, outcome-carrying verb is where a moment of
    ceremony costs least. Naming what you are closing reads true to the act.
  - **Inference is echoed, never silent.** Every inferred resolution prints
    `task <code> — from the working directory` (dim, human-styled) before the verb's own output.
    _Why:_ §6 — an implicit input made visible is checkable at a glance; a silent one is a guess the
    human has to verify by other means. Agents never see the line, because agents are never inferred
    for.
  - **The record claims the directory; git is not consulted.** Containment is a lexical test of the
    cwd against each record's `path` — not `git worktree list`, not marker files in the worktree.
    _Why:_ §16 — recorded state over live state; the record is what survives, and the same rule
    makes the stale-record case trivial: a **closed** task's record claims nothing, since the task
    can no longer be operated on and its code may since have been reused. Among open tasks at most
    one record can claim a directory (paths embed the open-unique task code), so scan order cannot
    change the answer.
  - **Mechanism in the workspace layer, policy in the shell.** `scopeFromCwd` is a pure resolver in
    `src/workspace/scope.ts`; the agent refusal, the error wording, and the echo live in the CLI's
    one `resolveTaskTarget` helper. _Why:_ the asymmetry is the human-shell contract's posture, not
    a property of the records — a future surface (the picker, a TUI) rebinds the policy without
    touching the resolution.
  - **`task pr` takes two arities via ordered alternatives.** `or()` with the one-argument form
    first: optique commits to the first alternative whose full parse succeeds, so `pr URL` binds the
    URL and `pr CODE URL` falls through to the explicit form (probed before building; an
    `optional()` first positional does not backtrack and cannot express this). _Why:_ the
    alternative — a positional that means CODE-or-URL depending on count — puts a guessing rule in
    the grammar; two honest arities keep both help lines true.
- **Layout:** `src/workspace/scope.ts` (the resolver — new), `src/cli/index.ts` (five parsers
  loosened, `resolveTaskTarget` beside `requireWorkspace`), `src/workspace/templates.ts` (the two
  `AGENTS.md` lessons). Tests: `test/workspace/scope.test.ts` (the resolution table, table-driven
  per CONTRIBUTING) and `test/cli/scope.test.ts` (the five verbs, the two misses, and the unchanged
  explicit forms, all through the spawned CLI via `runWard`/`runWardEnv`).
- **Mechanisms:**
  - _Resolution:_ `relative(root, cwd)`; reject empty/`..`-escaping; scan non-closed tasks' worktree
    records for `rel === path || rel.startsWith(path + '/')`; return the task and the claiming
    record.
  - _The one resolver:_ explicit code → pass-through; else declared agent → refusal error; else
    `scopeFromCwd` → miss error or echo + code (plus the claiming worktree's path, which
    `session open` uses as its working-directory default).

## Build log

### 2026-08-08 — Scope inference built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Probed optique's handling of an
optional leading positional (no backtracking — an `or()` of two arities with the shorter first is
the shape that works, kept as a comment at the parser). Built `src/workspace/scope.ts`
(`scopeFromCwd`: lexical containment of the cwd in a non-closed task's recorded worktree path);
loosened five parsers in `src/cli/index.ts` and routed them through one new `resolveTaskTarget`
helper (explicit wins → agent refused → inferred + echoed → legible miss); inferred `session open`
now records the claiming worktree as the session's working directory; grew the workspace `AGENTS.md`
template with the human lesson (no code needed inside a worktree) and the agent lesson (name the
task explicitly — inference is a human affordance). Tests: `test/workspace/scope.test.ts` (the
nine-row resolution table including the closed-task stale-record case and the record-tree non-case)
and `test/cli/scope.test.ts` (ten cases through the spawned CLI: all five inferred verbs, both
misses, explicit forms unchanged, close unchanged).

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `87 pass, 0 fail, 250 expect() calls` across 12 files — covering all four acceptance
  scenarios: the resolution table; the five verbs inferred through the spawned CLI (with the echo
  asserted and the inferred session's `workingDirectory` read back from the record); the human miss
  and the `WARD_AGENT` refusal, each with the fix named in the error; and the unchanged explicit
  forms, including `task close` refusing to run without a code and mutating nothing.
- Dogfood smoke in a scratch workspace: from inside `worktrees/t1-feature`,
  `ward session open --purpose …`, `ward task pr URL`, `ward task pause`, `ward task resume`, and
  `ward worktree create --repo demo --branch second` each echo
  `task t1 — from the working directory` and act on `t1`; from the workspace root
  `ward task
  pause` errors with the fix; `WARD_AGENT=1 ward task pause` inside the worktree errors
  with the agent wording; `ward task close` still demands its code.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- The entry itself is the loop in use: delivered as Ward task `t1` (slug `scope-from-cwd`) in the
  bootstrap workspace, session `scope-from-cwd-1`.

**Decisions** (entry-local, found while building): the parser probe above; and the echo goes to
stdout _before_ the verb's own line rather than being folded into it, so every verb's existing
output stays byte-for-byte what 0004/0005 shipped when the code is explicit.

**Next.** Natural follow-ons, in dogfood-priority order: the interactive picker behind the same
resolver branch (with theming's cues when they exist), location-scoped read verbs (`ward status`
narrowed to the enclosing task), and revisiting the claimed-location set (rooms, workdirs) as those
anchor kinds arrive.

## Spec-feedback

- **SF-001** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), "Workspace- and
  scope-aware from any working directory". The clause's chain ("a worktree → room → task → project")
  does not say whether the **record tree** counts as a location that implies scope: a caller
  standing in `tasks/t1-feature/` (the task's _records_) is inside a structure that lexically
  implies the task just as surely as its worktree does. **Assumption made to keep moving:** only
  locations one occupies to _work_ — today, recorded worktrees — imply scope; record directories are
  browsed, not occupied, so they imply nothing. **Proposed revision:** one sentence in the slice
  pinning the boundary either way, e.g. "the locations that imply scope are the _anchors_ a caller
  works in (worktrees, workdirs, and rooms' working directories), not the record tree that describes
  them" — or, if the record tree _should_ imply scope, saying so, at which point a later entry
  widens the resolver.
