# 0013 — Telemetry and serialized writes

> The store climbs the last rung of the no-lost-updates ladder: a plain-filesystem lock in `.ward/`
> serializes the write-and-commit critical section (identity allocation → record write →
> `commitRecords`), so concurrent mutating `ward` commands are safe and the orchestrator's
> run-one-at-a-time discipline can drop; and every invocation now appends one local, personal usage
> row under `.ward/telemetry/` — never committed, never remote, never a cost to the command it
> records.
>
> **Status:** accepted · **Started:** 2026-08-11

[`0004`](../0004-work-spine/README.md) deferred the store lock deliberately: "one human, sequential
commands… `.ward/` reserved for locks when concurrency arrives." That load has changed twice.
Delivery is now agent-per-task with multiple concurrent tasks, and the orchestrating session runs
every mutating `ward` command **one at a time by hand**, because two concurrent `task open`s could
allocate the same code and race the store's git commits — replaying exactly that (five concurrent
`task open`s against the 0012 build) produces duplicate codes (`t2` and `t3` each allocated twice),
raw `index.lock` and `cannot lock ref` failures on four of the five calls, and half-written records
left uncommitted on disk. And the human-shell intent obligates **local usage telemetry** — a write
on _every_ invocation, read verbs and concurrent agent calls included. The store intent wrote the
ladder for this moment (derive → append → one owner → _serialize the few unavoidable shared
writes_); this entry climbs its last rung and adds the first genuinely concurrent writer.

## Serves intent

- [`metadata-store`](../../intent/02-subsystems/00-metadata-store.md) — the core of this entry: the
  "serialize the few unavoidable shared writes" rung, built to the contract's four contention
  constraints. _No resident process:_ the lock is a plain filesystem primitive, safe from a cold
  start. _Readers never observe a partial document:_ applied to the mechanism itself — the lock is
  created atomically **with** its holder content (staged in `.ward/tmp/`, `link(2)`ed into place),
  so no observer ever sees a lock that cannot say who holds it. _Contention is legible and fails
  safe:_ the lock file names pid, host, verb, caller, and start time; a crashed writer is taken over
  through a rename-and-verify break that is safe to repeat (§6); a wedged lock never requires
  archaeology — doctor names its state and the refusal names its holder. _Sized to its real load:_
  brief critical sections (the mutate-and-commit span only), a bounded wait, an honest refusal.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — "record command usage as local
  telemetry, per invocation," realized as what exists today of the named fields (scope is recorded
  anchor-shaped, as far as the concept exists; persona does not exist in the implementation yet —
  SF-001); the Not-list's "not telemetry that ever leaves the workspace" enforced structurally
  (untracked twice over, below); the `doctor` surface grows the two findings this entry's conditions
  need (§20).
- [`principles`](../../intent/00-foundation/01-principles.md) §17 — no lost updates, the entry's
  reason to exist; §4 — telemetry is local and personal, and a tracked telemetry file would be one
  `git push` from leaving, so the boundary is guarded structurally and by doctor; §6 — takeover is
  idempotent and safe to repeat, and a live writer is never stolen from; §20 — a telemetry failure
  never fails or noisies the command (the command's work is the work), and the conditions this entry
  can produce (held lock, stale lock, tracked telemetry) are all conditions doctor can name; §8 —
  the lock's holder record and every refusal serve both audiences in plain text.
- [`open-questions`](../../intent/00-foundation/open-questions.md) — honored by omission: whether
  the telemetry **analysis** loop is a reflection type is an open question, so this entry records
  and deliberately does not analyze.

## Scope

- **In:**
  - **The store write lock** (`src/store/lock.ts`): `withStoreLock(root, verb, fn)` around every
    store mutate-and-commit span — `task open|pause|resume|pr|close`, `project open`,
    `session open|close`, `worktree create` (record write + commit only), `repo add` (record write
    - commit only, with the registration re-checked under the lock), and `workspace create`'s
      post-marker steps. Acquire = write holder JSON to `.ward/tmp/`, `link(2)` to
      `.ward/store.lock`; EEXIST = held. Holder names pid, host, verb (CLI words), human-or-agent
      (the 0005 `WARD_AGENT` signal), start time, and a per-acquisition nonce. Stale policy:
      same-host dead pid → stale immediately; same-host live pid → never stolen; unknowable liveness
      (other host, unreadable content) → stale past an age bound (30 s default). Takeover: rename
      the judged lock aside (one winner), verify byte-identity against what was judged, restore via
      `link(2)` on a mismatch — announced on stderr, safe to repeat. Wait: backoff with jitter,
      bounded (10 s default; `WARD_LOCK_TIMEOUT_MS`/`WARD_LOCK_STALE_MS` override), then a refusal
      naming the holder — never a raw git `index.lock` collision.
  - **Local usage telemetry** (`src/cli/telemetry.ts`): armed at CLI startup, written by a process
    exit handler — one JSONL row per invocation, read verbs included: `at`, `verb` (command words
    only, never arguments), `caller` (`human`/`agent`), `agent` (the declared `WARD_AGENT` value,
    when present), `cwd`, `scope` (the invocation's scope as the concept exists today,
    anchor-shaped: `task:tN` inside a worktree a non-closed task claims, `repo:<name>` inside a
    registered canonical checkout, `workspace` anywhere else inside — resolved eagerly at
    invocation, omitted if the command exits first), `exit`, `ms`, `ward`. Appended with one small
    `O_APPEND` write to `.ward/telemetry/usage-YYYY-MM.jsonl`. Untracked **twice over**: root
    `.gitignore` lines (new in `IGNORE_LINES`: `/.ward/store.lock`, `/.ward/telemetry/`) and a
    self-defending catch-all `.gitignore` inside `.ward/telemetry/` itself, so a workspace created
    before this entry leaks nothing either. Any telemetry failure is swallowed silently; outside a
    workspace nothing is recorded and nothing is created. Reads never take the store lock for it.
  - **Doctor names the new conditions** (§20): `store lock` — absent `ok`, held-by-live-writer
    `info` (pid, verb, held-for), stale `warn` (who left it, that the next write takes it over, that
    deleting it is safe) — never an error, because nothing is blocked; `telemetry` — tracked
    telemetry is a `warn` with the untrack remedy (the §4 boundary guard), untracked is `ok`.
  - **The workspace teaches it**: the installed `AGENTS.md` gains the concurrency lesson (run `ward`
    commands concurrently; writes serialize on `.ward/store.lock`; a refusal names the holder; reads
    never wait) and the `.ward/` layout line names the lock and telemetry; the `.ward/README.md`
    template describes both.
  - **Tests**: the lock protocol (`test/store/lock.test.ts`), real concurrency + takeover +
    contention + doctor lock findings (`test/workspace/concurrency.test.ts`), telemetry rows,
    isolation, and the git-status invisibility (`test/cli/telemetry.test.ts`), and the AGENTS.md
    lesson pinned in `test/workspace/create.test.ts`.
- **Deferred:**
  - **Telemetry analysis** (aliases, the reflection loop). Whether the analysis loop is a reflection
    type is an **open question in intent**, expressly not resolved here; recording is in scope,
    analysis is not. _Why safe:_ rows are append-only JSONL — any future analyzer reads what is
    already being recorded; nothing recorded constrains it.
  - **Any remote/telemetry interaction** — not deferred, **forbidden** by intent ("never surfaced to
    remote artifacts", §4); named here so its absence reads as the decision it is.
  - **A resident daemon/broker for serialization** — likewise forbidden: the store contract requires
    safe writes from a cold start, and a store that needs a broker cannot record the recovery that
    would restart the broker.
  - **Telemetry rotation/pruning.** Monthly shards bound any single file and make pruning a plain
    deletion, but nothing prunes. _Why safe:_ a row is ~200 bytes and local; months of heavy use
    cost megabytes; retention policy belongs to the analysis loop, which is the open question above.
    Deferred, not forgotten.
  - **Serializing canonical-checkout git operations** (concurrent `fetch`/`worktree add` on one
    `repos/<name>`). _Why safe:_ the store lock guards the **record**; the checkout is the world.
    Git's own ref locking turns those collisions into legible, retryable errors, and worktree
    creation is not the hot path the orchestration discipline was protecting. Real contention
    evidence would make this its own entry.
  - **A doctor finding for an unwritable telemetry directory.** _Why safe (and adjudicated, not
    overlooked):_ §20's loop obligates doctor to explain what a **degraded surface points at** — but
    telemetry failure is deliberately silent, no surface degrades, so no green-lighting
    contradiction can arise. When analysis exists and rows carry weight, this decision should be
    revisited.
  - **Verifying the `WARD_AGENT` value / required agent context** — unchanged from 0005; the
    declared value is recorded as given (it is telemetry's courtesy field, not an identity check).
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. **the race is real**: five concurrent `task open`s through the **spawned CLI** (plus four
     concurrent module-level opens in-process) yield unique codes `t1`–`t5`, every record present, a
     linear history (one commit per open, no merges), a clean `git status`, no lock left behind, and
     no `index.lock` ever surfacing to a caller;
  2. a stale lock left by a crashed writer is taken over with the takeover named on stderr;
     contention past the bound exits 1 naming the holder's pid and verb and mutates nothing; a live
     same-host holder is never stolen; unknown-host and unreadable locks age out on the bound;
  3. telemetry rows are appended for a human-shaped and an agent-shaped caller (with the declared
     value), record verb words never arguments, and carry the outcome; the row records the
     invocation's scope, anchor-shaped — `workspace` at the root, `task:tN` inside (and below) a
     claimed worktree, `repo:<name>` inside a canonical checkout; an unwritable telemetry path
     leaves exit code, stdout, and stderr byte-identical to a healthy run; nothing telemetry-related
     shows in the store's `git status`, including in a workspace whose root `.gitignore` predates
     this entry; outside a workspace nothing is recorded;
  4. doctor reports the lock absent/held/stale as ok/info/warn without ever turning the workspace
     unhealthy, and warns with a remedy when telemetry is tracked.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **The primitive is `link(2)` from a staged temp file, not `O_EXCL` or `mkdir`.** All three are
    plain-filesystem and cold-start-safe; link-from-staged is the one where the lock appears **with
    its holder content in a single atomic step** — an `O_EXCL` create-then-write has a window where
    the lock exists but cannot say who holds it, which fails the legibility clause at exactly the
    moment it matters (a crash inside that window leaves an anonymous lock). It also mirrors the
    store's own write-temp-plus-rename idiom (ADR 0005), so the mechanism follows the same
    discipline as the documents it guards.
  - **Never steal from a live writer; age out only the unknowable.** A same-host holder is judged by
    its pid: dead → taken over immediately (no arbitrary wait for a provable fact), alive → waited
    on and, past the bound, refused with the holder named — a slow-but-alive writer being stolen
    from is how two writers end up in one critical section, the exact corruption the lock exists to
    prevent. Age (30 s, generous against sub-second critical sections) applies only where liveness
    cannot be checked: another host (recorded for honesty; workspaces are local and personal, so
    this is an edge) or unreadable content (judged by mtime).
  - **Takeover is rename-park-verify-restore.** Rename the judged-stale lock to a unique parked path
    (atomicity makes one winner; losers rejoin the wait), verify the parked bytes are exactly what
    was judged stale, and only then discard. A mismatch means the lock changed hands between judging
    and breaking — the parked file is someone's **live** lock, restored atomically with `link(2)`.
    The one unrestorable corner (the slot was retaken during the mistake) refuses loudly rather than
    piling a third writer onto a race: it cannot repair what it can no longer prove, and an honest
    refusal beats silent corruption (§20). Repeating a takeover at any step is safe (§6): every path
    re-enters the acquire loop.
  - **The critical section is the mutate-and-commit span — allocation scan included, slow work
    excluded.** The scan must be inside (two opens reading the same free code **is** the lost
    update); the git commit must be inside because it is the store's durability step and the raw
    collision surface (`index.lock`, `cannot lock ref`). Fetches, clones, forge probes, and
    `git worktree add` stay outside: they can take seconds-to-minutes, would break the "few and
    brief" sizing clause, and their failure modes are already legible. Two consequences carried
    deliberately: `task close` re-resolves the task under the lock (a concurrent double close loses
    with the existing "no open task" refusal instead of half-applying), and `repo add` re-checks
    registration under the lock (a concurrent same-name add converges to `satisfied` instead of
    double-committing).
  - **The lock is not reentrant, by construction.** No locked operation calls another locked
    operation (verified across the workspace modules); supporting nesting would require
    per-acquisition context tracking that the real load does not justify. In-process concurrency
    works because acquisition attempts are synchronous and the waits are `await`ed sleeps.
  - **Telemetry is a process exit handler at the CLI layer, not a call in each verb.** One
    registration covers every path out — normal completion, `WardError` exits, optique's own
    help/usage exits — and is the only place the outcome (exit code) and duration are knowable. It
    also keeps the cost profile honest: nothing is written while the command works.
  - **The row records verb words, never arguments.** Arguments carry free text (`--purpose`, slugs)
    that would bloat rows and add nothing the analysis loop needs; the verb path is resolved against
    a static copy of the command tree, and an unknown first word is recorded as itself (bounded),
    never guessed. No `workspace` field: the row lives **in** the workspace it describes — storing
    it would be a stored roll-up of the file's own location (§17's derive-don't-store, in
    miniature).
  - **The row records the resolved scope, not just the raw cwd** (amended 2026-08-12, at the
    workspace owner's direction). The first build recorded only `cwd`, judging "scope" to have no
    runtime referent (the original SF-001) — but the 0006 resolver is exactly that referent: the
    working directory already resolves to the anchors the records claim. The deciding argument is
    that the derivation is **moment-bound**: worktrees are torn down at close and task codes are
    **reused**, so a `cwd` recorded in January resolves to nothing — or to the wrong task — in
    March. §17 forbids storing what _stays_ derivable; this does not stay derivable, so the row
    records it (the same reason session logs record their handle). Values are anchor-shaped
    (`task:tN` / `repo:<name>` / `workspace`) — the vocabulary grows when the full scope model
    arrives, rather than pre-claiming it. Resolution runs **eagerly at invocation** — the honest
    moment (the command may tear down the very anchor it stands in), and the exit handler cannot
    await — cached for the exit row, omitted with honesty if the command exits first. Persona stays
    unrecorded entirely: absence over `null` or a fabricated `"default"` is the codebase-wide
    convention (`reviewDecision`, `mergeCommit`, `baseRefName`), and every row carries `ward`, so
    absence is never era-ambiguous.
  - **Appends need no lock.** That is why append-over-rewrite sits below serialization in the
    ladder: one small `O_APPEND` write per invocation interleaves as whole lines between concurrent
    writers on a local filesystem, and the theoretical torn line harms one telemetry row, never the
    record — which is also why read verbs stay lock-free even though they now write telemetry.
  - **Untracked twice over, warned once.** The root `.gitignore` learns the two lines (create
    converges old workspaces; doctor's existing ignore-policy check names the gap), and the
    telemetry directory carries its own catch-all `.gitignore` so §4 never depends on the workspace
    having converged. Doctor's `telemetry` warning covers the remaining hole a human can force
    (`git add -f`), with the exact untrack remedy.
  - **Doctor's lock finding is never an error.** A held lock is normal operation; a stale one is
    self-healing (the next write takes it over). Error would flip the workspace unhealthy over a
    condition that blocks nothing — the §20 posture is to name precisely, not to alarm.
- **Layout:** `src/store/lock.ts` (the primitive: acquire/inspect/describe, break protocol —
  store-owned because serialization is the store contract's clause); `src/cli/telemetry.ts` (the
  usage signal is the human-shell's, so it lives at the CLI layer); `withStoreLock` wraps in
  `src/workspace/{projects,tasks,sessions,worktrees,repos,create}.ts`; `src/workspace/layout.ts`
  (the two ignore lines); `src/workspace/doctor.ts` (the two findings); `src/workspace/templates.ts`
  (AGENTS.md lesson, `.ward/` README); `src/cli/index.ts` (one `recordInvocation` call at startup).
  Tests: `test/store/lock.test.ts`, `test/workspace/concurrency.test.ts`,
  `test/cli/telemetry.test.ts`, plus the lesson pin in `test/workspace/create.test.ts`.
- **Mechanisms:** _acquire:_ loop { link-with-content → held? inspect → stale? break (rename →
  verify → discard | restore) → deadline? refuse-naming-holder → backoff-sleep }; _release:_ unlink
  only if the lock's nonce is still ours; _inspect:_ one shared reader (`inspectStoreLock`) feeds
  the acquire loop, the refusal text, and doctor, so they can never disagree about the same file;
  _telemetry:_ startup captures argv + clock and fires the scope resolution (0006 resolver, then
  registered-checkout prefix match, then `workspace`), exit handler discovers the workspace from
  cwd, ensures the self-ignoring directory, appends one row, swallows every failure.

## Build log

### 2026-08-11 — Lock, telemetry, doctor findings, and the concurrency proof, end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Built `src/store/lock.ts`
(link-with-content acquire, the stale verdicts, the rename-park-verify-restore break, the shared
inspector) and `src/cli/telemetry.ts` (verb-path table, the exit-handler append, the self-ignoring
directory); wrapped the mutate-and-commit spans across the six workspace modules; grew
`IGNORE_LINES`, the two doctor findings, the AGENTS.md concurrency lesson, and the `.ward/` README.
Tests: `test/store/lock.test.ts` (seven protocol cases), `test/workspace/concurrency.test.ts` (the
spawned-CLI race, the in-process race, takeover, contention, lock-free reads, doctor's lock states),
`test/cli/telemetry.test.ts` (eight cases: rows both callers, verb table, failure isolation,
git-status invisibility including the pre-0013 workspace, outside-workspace no-op, doctor's boundary
guard).

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `181 pass, 0 fail, 621 expect() calls` across 22 files (from
  `160 pass / 515
  expect() / 19 files` at entry start). The race test is real concurrency: five
  `Bun.spawn`ed CLI processes (`task open race-{a..e}`) started together and awaited together,
  asserting all five exit 0, codes are exactly `t1`–`t5`, `git rev-list --count HEAD` = 6 (initial +
  one per open), no merge commits, `git status --porcelain` empty, no lock left, and no stderr ever
  containing `index.lock`; plus four concurrent module-level `openTask` promises in one process
  asserting `t1`–`t4` and a 5-commit history.
- `mise run check` → exit 0, green end to end (Biome + dprint + `tsc --noEmit` + bun test + lychee).
- **The counter-proof — the deferred load really did arrive:** the identical five-way race against
  the 0012 build (`git archive 276936d` into a scratch dir, same scratch workspace recipe) → four of
  five exit 1, duplicate codes (`t2` and `t3` each allocated twice, five task directories for three
  codes), `fatal: Unable to create '….git/index.lock': File exists` and
  `fatal: cannot lock ref 'HEAD'` on the losers, and only one commit landed — every failure mode
  this entry's Scope names, reproduced on demand.
- Dogfood smoke in a scratch workspace (`bun src/cli/index.ts`, never the live workspace): the same
  five-way race → five exits 0, `t1`–`t5`, linear log, clean porcelain; a planted stale lock (dead
  pid) → doctor `! store lock — stale — left by pid … (ward task open crashed, agent) …`, next write
  prints `ward: took over a stale store lock left by pid … — opened task t6`; a planted live lock →
  `task open` exits 1 with
  `error: the store is write-locked by pid … (ward session
  open demo-1, human, held 2s) — gave up after 2s…`
  while `task list` answers instantly under the same lock; `.ward/telemetry/usage-2026-08.jsonl`
  shows human rows (`"caller":"human"`) and the declared-agent row
  (`"caller":"agent","agent":"smoke-session-1"`), and doctor ends `✓ store lock`, `✓ telemetry`,
  `healthy`.

**Decisions** (entry-local, found while building): recorded under Design → Decisions; two found
mid-build worth naming — Bun's `toMatchObject` with `expect.stringContaining` mutates the received
object's matched property (a later `toContain` on the same field then fails with a type error), so
the doctor assertions read the finding once into locals; and the acquire path is synchronous
end-to-end (no `await` between staging and `link`) so in-process contenders sharing the event loop
cannot interleave inside an acquisition attempt.

**Next.** Natural follow-ons, in dogfood-priority order: drop the orchestrator's run-one-at-a-time
discipline in real multi-task delivery and watch the lock's contention profile; the telemetry
analysis loop when intent settles its open question (which also owns retention); canonical-checkout
serialization if real contention ever shows there.

### 2026-08-12 — The row learns its scope (review amendment)

**Goal.** Record the invocation's scope, per the workspace owner's review of the original SF-001:
the 0006 resolver is scope's runtime referent as far as it exists, and the derivation from `cwd` is
moment-bound (torn-down worktrees, reused codes), so the row must capture it at the only moment it
can. **What was done.** `src/cli/telemetry.ts` resolves scope eagerly at invocation (0006's
`scopeFromCwd`, then a registered-checkout prefix match, then `workspace`) and the exit row carries
it; the decision, SF-001, and the mechanisms line above updated to match.

**What works now — with the commands that prove it:** `bun test` →
`195 pass, 0 fail, 668 expect() calls` across 23 files (the baseline moved twice: this entry's first
build ended at 181/621/22, the rebase onto a main that now includes 0014 brought it to 194/660/23,
and this amendment adds one case with 8 expects): the new `test/cli/telemetry.test.ts` case drives
the spawned CLI from the workspace root, a claimed worktree (and a subdirectory of it), and a
canonical checkout, asserting `workspace`, `task:t1`, `task:t1`, `repo:demo` in turn.
`mise run check` → exit 0.

## Spec-feedback

- **SF-001** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _Record command usage
  as local telemetry_. _Friction:_ the constraint enumerates the per-invocation fields as "persona,
  scope, working directory, and human-or-agent," but persona does not exist in the implementation
  (personas are unbuilt), and the first build judged scope absent too — the workspace owner's review
  corrected that (the 0006 resolver **is** scope's runtime referent, as far as it exists), and the
  row now records it anchor-shaped (amended 2026-08-12; the decision above). The _Left to
  implementation_ note ("the telemetry storage format, fields") already treats fields as open.
  _Assumption to keep moving:_ the enumerated fields are the ambition, recorded **as they exist**,
  not a gate; the invariant part is per-invocation + local + never remote. The row records verb,
  working directory, scope (anchor-shaped today), human-or-agent, the declared agent value, outcome,
  and duration; persona is omitted entirely (absence over `null`/`"default"`) until it exists.
  _Proposed revision:_ "per invocation: the caller's context as it exists — working directory, scope
  as far as it resolves, and human-or-agent today; persona as it comes to exist."
- **SF-002** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), the same bullet read
  with the Not-list ("not telemetry that ever leaves the workspace"). _Friction:_ "record usage
  **per invocation**" is unqualified, but some invocations run outside any workspace (`ward doctor`
  on a bare machine, `ward workspace create` from a neutral directory) — telemetry that never leaves
  the workspace has nowhere to live for them, and a machine-level home would quietly create the
  machine-scoped state the workspace-lifecycle slice treats as an open question. _Assumption to keep
  moving:_ telemetry is workspace-scoped; outside a workspace, nothing is recorded and nothing is
  created. _Proposed revision:_ append to the bullet: "recorded in the enclosing workspace; an
  invocation outside any workspace records nothing." _(Assumption confirmed by the workspace owner
  in review, 2026-08-12, with the sharper why: telemetry exists to feed reflection that improves the
  workspace itself — outside one there is no reflection to be had.)_ One near-candidate not filed:
  the store contract's "contention is legible … in the workspace itself" does not say whether the
  _mechanism's_ transient files (the lock) belong to the tracked record or the ignored mechanics —
  adjudicated here as ignored mechanics (the lock lives and dies within a command; tracking it would
  commit churn with no reader), consistent with the contract's own `.gitignore`-policy latitude.
