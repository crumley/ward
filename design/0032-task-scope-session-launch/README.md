# 0032 — Task-scope session launch

> `ward session open TASK --purpose TEXT` now opens a session at **task scope** and starts the agent
> in it, standing in the task's own worktree — the launched open
> [0029](../0029-launched-sessions/README.md) built, reached from the task's side. `--handle` stays
> the record-only path at either scope, and a declared agent is refused the launched open outright.
>
> **Status:** built — awaiting review · **Started:** 2026-08-24

Ward's core delivery loop — a task, its worktree, an agent working in it, a pull request out of it —
had a manual seam in the middle. 0029 made `ward session open --purpose TEXT` launch the agent at
workspace scope and deliberately deferred the other scopes; `session open TASK` stayed record-only,
so the task whose worktree was ready still needed its agent started by hand, in the right directory,
with the session recorded separately. The records were already shaped for this (scope is data on the
session document, and task sessions have nested beside their task since
[0004](../0004-work-spine/README.md)), so the extension is an addition, not a migration.

This entry extends the launch to task scope: the same spine — assigned handle, record before
process, `WARD_AGENT`, exit ≠ close — with the task's worktree as where the agent stands, and the
ambiguous cases (no worktree, several) refused rather than guessed. Extending it also creates a
hazard the entry must close itself: the invocation being repurposed is one installed manifests teach
an already-running agent to use for recording itself, and those manifests stay stale until each
workspace upgrades — so the launched open refuses a declared agent, at both scopes, and the manifest
is refreshed through the [0020](../0020-deterministic-upgrade/README.md) lineage mechanism.

Spec-feedback lives in [`spec-feedback.md`](spec-feedback.md); the build journal in
[`build-log.md`](build-log.md).

## Serves intent

- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — the launched
  lifecycle (record precedes process, exit leaves `open`, events on the trail, the session-log
  minimum's fields) now holds at a second scope with no lifecycle change, because nothing
  lifecycle-shaped turned out to be scope-shaped.
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md) — scope and working
  directory are recorded as the two independent axes, with the directory derived from the scope's
  own record when the opener does not choose (SF-001 in [`spec-feedback.md`](spec-feedback.md)
  records the friction in how the slice words that independence).
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — the session nests under the scope
  it belongs to (`tasks/<code>-<slug>/sessions/`), and workspace-wide id uniqueness lets `resume`,
  `locate`, and `close` address a launched task session by bare id with nothing new.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — the seam's start-at-a-scope
  constraint is realized for the task scope with the adapter untouched, which is the thin-adapter
  promise holding.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the installed
  `AGENTS.md` described the task open as record-only, which is now false, so the manifest is
  refreshed and the outgoing default's fingerprint joins the lineage for `ward workspace upgrade` to
  act on.
- [`principles`](../../intent/00-foundation/01-principles.md) — §16 (the record precedes the
  process, and a refusal writes nothing), §12 (the handle still costs zero tokens), §6 (the
  sole-worktree rule is deterministic; ambiguity refuses rather than guesses), §20 (every refusal
  names the ways through).

## Scope

- **In:**
  - **The launched open at task scope.** `ward session open TASK --purpose TEXT` with no `--handle`:
    resolve the agent configuration, settle the launch directory, mint the UUID, write and commit
    the record (scope `task`, its task code, handle, directory, purpose, and the resolved
    `model`/`effort`), report it, then run the agent in the foreground with
    `WARD_AGENT=<session id>`, in the recorded directory. Exit ≠ close; the run's exit code is the
    invocation's; a spawn failure is refused legibly with the record standing — the 0029 contract,
    at the new scope.
  - **One launch spine for both scopes**, so their semantics cannot drift (Design, _One spine, two
    openers_).
  - **The launch-directory rule.** `--dir` wins when given. Otherwise: exactly one worktree — use
    it; zero — refuse, naming `ward worktree create TASK --repo NAME` and `--dir PATH`; several —
    refuse, naming every worktree path and `--dir`. A refusal happens **before the record exists**:
    no session, no id spent, no trail for a launch that had nowhere to stand.
  - **The launched open refuses a declared agent — at both scopes.** A caller with `WARD_AGENT` set
    is refused the handle-less open before any work, with the refusal naming both ways through:
    record your own run with `--handle`, and leave launching to a human until detached hosting
    exists. The task-scope half is this entry's obligation (it changed the meaning of an invocation
    stale manifests still teach); the workspace-scope half reaches beyond the entry's core scope and
    is named as an addition, with its reasoning, in Design (_The launched open is a human's verb_).
  - **The record-only path, unmoved.** `--handle` at either scope behaves exactly as before — same
    records, same output, no spawn — and the store-level `openSession` API keeps its record-only
    nature (it additionally records `model`/`effort` when the launch passes them, mirroring
    `openWorkspaceSession`).
  - **Resume / locate / close for launched task sessions** — already scope-agnostic since 0029 (bare
    id, recorded directory); this entry proves them against a launched task session rather than
    changing them.
  - **The manifest refresh** — the Sessions section gains the task-scope bullet (launched, in the
    task's worktree, sole-or-`--dir`) and now states that `--handle` is what makes an open
    record-only and that the launched open is the human's path; the outgoing 0029-era default's
    sha256 joins `INSTALLED_ARTIFACT_LINEAGE` so `ward workspace upgrade` brings an untouched
    manifest forward.
  - **Tests** — task-scope cases in the stub-harness end-to-end suite, the scope suite's task-open
    case updated to the launched behavior, and the lineage pins moved (the acceptance list below
    names what they prove).
- **Deferred:**
  - **Launching at project scope.** Safe to defer because the deferral costs only absence: the scope
    enum grows a value with the verb that opens one, and with both launched scopes now going through
    one spine, the third arrives as an opener, not a migration — nothing written today needs
    revisiting.
  - **A workspace-level sessions line in `ward status`.** 0029 deferred the presentation question to
    the entry with more than one homeless case in hand, and this entry deliberately keeps that
    deferral after deciding there is **nothing to build for task scope**: task rows have carried
    their open session ids since the status report gained `openSessions` (human `— sessions: …` and
    JSON alike), so a launched task session is already visible exactly where its work is. Safe to
    defer because the only sessions `status` cannot yet place are those with no task row — workspace
    scope today, project scope next — and they remain visible to `ward session locate`, the record
    itself, and `workspace restore`'s count; nothing is silently lost, only not yet summarized in
    one listing.
  - **Room-scope sessions, and a persona on the launch.** Safe to defer because rooms have no
    records and personas no cast to name one from — a launch cannot record a field that has no
    source (the session-log minimum's own conditioning) — and SF-002 in
    [`spec-feedback.md`](spec-feedback.md) records where that boundary will land so the future entry
    starts from what this one learned.
  - **Usage/token recording at close.** Safe to defer because the harness contract makes usage
    optional and nothing may depend on its presence; the session records remain complete without it,
    and the transcript it would be read from outlives the session by the harness's own retention.
  - **Hardening the test scaffolding against an ambient `WARD_AGENT`.** Building from inside a live
    agent session showed the spawned-CLI suites inherit the caller's `WARD_AGENT` and eight
    pre-existing cases fail under it (they assert human-shaped output); this entry's gate runs unset
    it ([`build-log.md`](build-log.md)). Safe to defer because the failures predate this entry and
    reproduce on its untouched base, CI carries no `WARD_AGENT`, and the fix spans many suites this
    entry otherwise leaves alone — a small dedicated change loses nothing in the gap beyond the
    `env -u` workaround it documents.
- **Acceptance:**
  1. `env -u WARD_AGENT mise run check` exits 0 (lint, format, `tsc --noEmit`, tests, links,
     actionlint).
  2. `bun test test/agent/launch.test.ts` — the launched task open writes scope `task` beside its
     task with the worktree as its directory and the resolved model/effort on the record, and the
     stub harness observes its own record from inside a run whose cwd is the worktree and whose
     `WARD_AGENT` is the session id.
  3. Same suite — the zero- and multi-worktree refusals name their options and manufacture nothing
     (no record, no spawn), and `--dir` launches exactly where it says at both edge cases.
  4. Same suite — a declared agent is refused the handle-less open at both scopes with nothing
     manufactured, while `--handle` still records for it at both.
  5. Same suite — `--handle` at task scope records without any spawn, and resume of a launched task
     session re-attaches in the recorded worktree.
  6. `bun test test/cli/scope.test.ts` — `session open TASK` launches with the sole worktree as the
     session's directory, and the rest of the cwd-inference behavior is untouched.
  7. `bun test test/workspace/lineage.test.ts` — the outgoing 0029-era `AGENTS.md` is a known
     default (so upgrade brings it forward) and the current default's pin matches the shipped
     template.

## Design

- **Decisions:** no new ADRs — the store stack ([ADR 0005](../decisions/0005-store-stack.md))
  governs the record, and every stack choice this launch rests on was 0029's. Entry-local, each with
  the alternative it beat:
  - **One spine, two openers.** The launch invariants — configuration resolved before the record,
    record written and reported before the spawn, `WARD_AGENT` set, argv from the same `startArgv` —
    live in one private function (`launchOpened`); each scope contributes only how its record is
    opened. _Alternative:_ a parallel `launchTaskSession` transcribing the workspace launcher's body
    — attractive because it would leave 0029's reviewed function byte-untouched. _Why it lost:_ it
    duplicates the ordering the whole design rests on, and a future edit to one copy forks the
    launch semantics silently. _Cost:_ the workspace path now flows through an indirection 0029's
    text does not describe — paid once, and the untouched 0029 suites pin that nothing observable
    moved.
  - **The task's agent stands in the task's worktree.** The worktree is the anchor where the task's
    changes are made, so it is where the launched agent loads context and acts. _Alternative:_ the
    workspace root, as 0029 does — attractive for uniformity, and it needs no directory resolution
    at all. _Why it lost:_ it hands a task-scope agent the whole workspace's ground and leaves it to
    find its own way down to the work; standing in the worktree is what makes the launch automate
    the delivery loop rather than merely relocate its first prompt. _Cost:_ the launch needs a
    directory-resolution step with two refusal cases — accepted and designed rather than smoothed
    over.
  - **Sole worktree derived; ambiguity refused, never guessed.** With one worktree there is nothing
    to decide. _Alternative:_ reuse the record-only default (`worktrees[0] ?? '.'`, from 0004) —
    attractive as one rule for both paths, with no refusals to write. _Why it lost:_ a guessed
    directory on a launch **mis-acts** — zero worktrees would stand the agent in a place the work
    never was, several would load one branch's context for another branch's work — where the
    record-only guess merely mis-records a run that already stood somewhere; that asymmetry is also
    why the record-only default is deliberately untouched. _Cost:_ a task with several worktrees
    always pays one `--dir`, and a task with none cannot launch without it. Both refusals name the
    way through and happen **before the record is written**, so a launch that never had a place to
    stand leaves no session, no spent id, and no trail to explain away.
  - **`--dir` stays one thing.** On the launched path the recorded working directory is also the
    launch directory, so the existing flag steers the launch by meaning what it always meant.
    _Alternative:_ a launch-specific flag beside it — attractive as a visible separation of
    recording from launching. _Why it lost:_ on a launched session the two are one fact, and two
    flags would let the record and the run disagree about where the agent stood. _Cost:_ none
    observed; the flag's description broadens without changing.
  - **The launched open is a human's verb until detached hosting exists.** A caller with
    `WARD_AGENT` set is refused the handle-less open at both scopes, before any work. _Alternative:_
    let declared agents launch too — attractive for symmetry, and it is the future shape once
    sessions can be hosted detached. _Why it lost, twice over:_ the standing posture since
    [0005](../0005-agent-audience/README.md) is that a declared agent is never handed an interactive
    affordance, and a foreground `claude` TUI in an agent's own shell — no terminal to drive,
    blocking forever — is the worst possible one; and the hazard is live, not doctrinal, because
    every 0029-era installed manifest teaches an already-running agent to record its task work with
    exactly the invocation this entry repurposed, and manifests in the wild stay stale until each
    workspace upgrades — the stale instruction must land on a legible refusal, never on a spawned
    TUI. The refusal covers **both** scopes for one coherent rule (the launched open, not one
    scope's flavor of it, is what an agent cannot use — guarding one scope would leave the same
    hazard reachable one argument away); covering the workspace scope is the entry's one addition
    beyond its core scope, named as one. _Cost:_ agent-driven launching waits for the
    detached-hosting arc 0029 deferred, and the refusal text names that boundary along with the
    agent's own path (`--handle`, which stays fully open to declared callers).
  - **`--handle` is what makes an open record-only.** The verb's paths split on one flag rather than
    on scope: no `--handle` launches (either scope), `--handle` records a run Ward did not start
    (either scope). _Alternative:_ keep the split by scope — attractive because it changes no
    existing invocation's meaning. _Why it lost:_ the scope split **is** the deferral this entry
    exists to end, and a one-flag rule is teachable in one sentence, which the manifest now spends.
    _Cost:_ the handle-less task invocation changes meaning under stale manifests — the exact hazard
    the human's-verb refusal above closes.
  - **`openSession` records what the launch passed, and nothing more.** The store function gains the
    same optional `model`/`effort` spreads `openWorkspaceSession` got in 0029. _Alternative:_ record
    the resolved configuration on every open, `--handle` included — attractive as more data on every
    record. _Why it lost:_ a hand-recorded session's run was not started by Ward, so today's
    resolution may not be what actually ran — the field would state a guess as a fact. _Cost:_
    hand-recorded sessions carry no model or effort, which is the session-log minimum's own
    conditioning (a field with no source is not invented).
  - **No new shapes, verbs, or completion.** 0029 built the JSON shapes scope-ready —
    `sessionMutationShape` already carries `scope`, `task`, `model`, `effort` — so the launched task
    open emits the document the record-only one did, `ward schema` already publishes it, the parser
    tree gained no words, and telemetry's verb tree is unchanged. Not a choice this entry made so
    much as 0029's groundwork paying out; stated so a reader looking for the plumbing knows there
    deliberately is none.
- **Layout:** no new modules, and the boundaries hold as drawn. The scope-shaped openers and the
  shared spine live in `src/agent/run.ts` — the Ward-shaped half of the harness seam — and the
  adapter (`src/harness/claude.ts`) is untouched, which is the seam's promise demonstrated. The
  launch-directory rule lives with the launch, not the store: `src/workspace/sessions.ts` stays a
  record writer whose defaults serve the record-only path, and the refusals are the launcher's. The
  manifest and its lineage move together (`src/workspace/templates.ts` +
  `src/workspace/lineage.ts`), the pairing 0020 established.
- **Mechanisms:**
  - _Open (task, launched):_ refuse a declared caller → settle the directory — `--dir`, else the
    task's sole worktree, else refuse naming the options → resolve the configuration → mint a UUID →
    write and commit `tasks/<dir>/sessions/<id>.md` (scope `task`, task code, handle, directory,
    purpose, model/effort) → report → spawn
    `claude --session-id <uuid> [--model M] [--effort E] <args…>` in the worktree with
    `WARD_AGENT=<id>` → wait → print the resume line → exit with the run's code.
  - _Open (task, `--handle`):_ unchanged — record and commit, no spawn.
  - _Resume / locate / close:_ unchanged code paths; a launched task session is found by bare id at
    its scope, resumed in its recorded worktree, located against it.
  - _Upgrade:_ unchanged — the lineage knows the 0029-era `AGENTS.md`, so a workspace still carrying
    it untouched is `stale` and comes forward.
