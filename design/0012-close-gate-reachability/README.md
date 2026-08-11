# 0012 — Close-gate reachability: "merged" is not "reached the main line"

> The gated close stops trusting the forge's "merged" at face value: the probe carries each PR's
> merge commit (same single call), and a delivered close verifies that commit is reachable from
> `origin/<mainLine>` in the repository's canonical checkout — refusing, before any teardown, a PR
> that merged into a base that never reached the main line, and degrading to a named trust wherever
> the question cannot be answered honestly.
>
> **Status:** accepted · **Started:** 2026-08-11

The motivating incident is in this repository's own record, dated 2026-08-11. PR #24 (entry 0010)
was stacked on 0009's branch, and its base was never retargeted after 0009's PR #22 merged. When #24
was merged, it merged into the retired base branch `design/0009-live-forge-state` — the work never
reached main. The forge honestly reported `MERGED`, so ward's probe reported `merged` and
`needs you` offered the gated close; running that close would have resolved the PR set as delivered
and torn down the worktree, stranding the deliverable. The failure was caught by a human noticing a
missing doctor finding, and the entry was re-landed as PR #26. The lesson: on a forge, **"merged"
means "merged into its base," not "reached the main line"** — and the close gate is the one place
where that difference destroys work, because it is the moment the worktree holding the only other
copy is torn down. This entry teaches the gate the difference.

## Serves intent

- [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md) — _Completion_: "a task is
  complete only when its PR set is resolved: every PR **merged** — the **delivered** close" — read
  together with the cardinal rule ("work … reaches the main line **only through a pull request**"),
  _delivered_ can only mean the main line actually received the work; a merge into a dead base
  satisfies the forge's word but not the rule's meaning (the residue of that gap is SF-001).
  _Refresh and clean up_: teardown follows the close — which is exactly why the gate must answer
  before it.
- [`principles`](../../intent/00-foundation/01-principles.md) §20 — the close is the textbook
  low-frequency moment: "any low-frequency moment where the precise answer changes what the caller
  does next (a **gated act failing over a broken link** the clearest case)." Precision is a cost
  decision, and the gate can afford a fetch and a `merge-base` where the high-frequency glance
  cannot — so the check lives at close time only, and every unanswerable case degrades honestly: the
  stated outcome is trusted and the trust is **named**, never a guess, never a false "unreachable."
  §16 — the forge's `merged` is the **forge's** record about its own base branch, not a record about
  our main line; the main line's own history, read in the canonical checkout, is the authoritative
  record of what it received. §17 — reachability is derived from git at the moment of asking, never
  stored. §18 — the gated close is the act that destroys the local copy; this is the gate doing
  precisely the job §18 gives it. §6 — a refused close still mutates nothing; the refusal happens
  before the first write, so retrying is safe.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md) — the canonical checkout exists so
  any agent can "read the current main line locally at any moment"; the reachability question is
  asked exactly there, against `origin/<mainLine>`, freshened through the same machinery every other
  reader uses.
- [`remote-provider`](../../intent/02-subsystems/06-remote-provider.md) — "report PR status … so
  Ward can drive a task to completion" through a thin adapter: the merge commit joins the adapter's
  neutral vocabulary as one more field of the same single read, and the URL→repository mapping
  (which forge URL belongs to which recorded remote) lives in the adapter, where a second forge
  would supply its own URL shape.

## Scope

- **In:**
  - **The probe carries the merge commit.** The single per-URL call grows to
    `gh pr view URL --json state,reviewDecision,mergeCommit`; `PrForgeState` gains an optional
    `mergeCommit` (the oid). Same one call per URL — no added forge cost, no added latency. A
    missing or null oid stays absent: it degrades, it is never guessed.
  - **The delivered close verifies reachability.** After the PR set resolves as all-merged,
    `resolvePrSet` verifies each merged PR: map its URL to a repository record (host + repository
    path against the recorded remote), refresh that repository's canonical checkout (once per
    repository per close, through `refreshRepositories` — 0011's refresh-first), and ask
    `git merge-base --is-ancestor <oid> origin/<mainLine>`. Reachable → the close report carries a
    `reachability` step naming the commit and the ref. **Not reachable, verified against a freshly
    refreshed tip → the close is refused** with the situation named precisely (§20): which PR, which
    commit, that it merged into a base branch that never reached the main line, and the remedy
    (re-land from the surviving branch onto the main line, as this repository did with #26). The
    refusal is thrown before any session close, worktree removal, or record write — the same exit
    posture as an open PR today.
  - **Honest degradation on every unanswerable case**, each a `reachability` step that names the
    trust — the existing posture for a forge that cannot answer, extended: the forge reports no
    merge commit; no registered repository matches the PR's remote; the refresh cannot run (dirty
    checkout, missing checkout, failed fetch) _and_ the answer is not locally provable.
  - **A positive answer survives a failed refresh.** The main line only gains history, so a commit
    reachable from the last-fetched tip is reachable from the current one; only a **negative**
    against a stale tip is unusable. Fresh negative → refuse; stale negative → named trust; any
    positive → verified.
  - **Adoption records the remote's identity, not its rewrite.** Found while building: git's
    `remote get-url` applies `url.*.insteadOf`, so `addRepository` now reads the raw configured
    `remote.origin.url` — the record should carry the remote's durable identity, not where this
    machine happens to fetch it from (also what makes the hermetic tests possible).
  - **Tests, hermetic throughout:** the fake `gh` answers `mergeCommit` in gh's own shape
    (`{"oid": …}` or null); a new suite builds scratch workspaces over local bare remotes —
    registered under a forge-shaped URL that `url.<bare>.insteadOf` (via `GIT_CONFIG_*` env)
    rewrites to the bare path, so mapping and fetching both work offline — and replays the incident
    both ways, plus every degradation and the CLI surface.
- **Deferred:**
  - **Status-side reachability.** The overlay and `needs you` still read the forge's `merged` at
    face value, so the glance can still offer a close the gate will refuse. _Why safe:_ §20 says
    precision is a cost decision, not a verb identity — status is the high-frequency glance and
    cannot afford a fetch per repository per render, while the close is the low-frequency gated act
    where the answer changes what happens next; the incident's damage happens only at the gate, and
    the gate now refuses with the full diagnosis and remedy. The offer costs an attempted close; the
    wrong close cost the deliverable.
  - **Surfacing `mergeCommit` in `--json` / status output.** The oid serves the close gate, not the
    glance; the explicit builders (0005) already keep it out of every emitted shape, so the schema
    registry is untouched. _Why safe:_ evolution is additive — if a future verb needs the oid, it
    joins `prForgeShape` as one more optional field, exactly how `reviewDecision` arrived.
  - **Catching the stale base before the merge.** A doctor finding or PR-watch warning ("this PR's
    base is another task's branch / a retired branch") would surface the incident's cause while it
    is still cheap to fix — retarget before merging, instead of re-landing after. _Why safe:_ the
    close gate is now the backstop at the only point the mistake destroys work; an earlier warning
    is additive attention-routing on the same probe data (plus a `baseRefName` field riding the same
    call).
  - **Reachability on the abandoned close.** Abandoning states its own authority (§18) and delivers
    nothing, so there is no main-line claim to verify. _Why safe:_ the abandoned path is unchanged;
    the gate guards exactly the claim the delivered close records.
  - **Other forges.** As since 0004. _Why safe:_ the mapping and the oid live in the adapter's
    neutral vocabulary; a second forge supplies its own URL shape and merge-commit read behind the
    same types.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. **the incident replay**: a PR merged into a base branch that never reached main refuses the
     delivered close — message asserted (PR URL, short oid, `origin/main`, the dead-base diagnosis,
     the re-land remedy) — and the refusal precedes all teardown: worktree still on disk, session
     still open, task still active;
  2. a merge commit that did reach the main line closes, verified against a canonical checkout that
     was stale until the gate's own refresh — proving refresh-first;
  3. each unanswerable case — no merge commit reported, no repository mapping, a refresh that cannot
     run — closes on the named trust, and a positive answer survives a failed refresh;
  4. the refusal reaches the spawned CLI as exit 1 with the message on stderr, and a delivering
     close renders its `reachability` step;
  5. the probe translates `mergeCommit` alongside state and review decision, and the URL→remote
     mapping holds across https/scp/ssh remote forms, rejects mismatches, and maps nothing to a
     local-path remote.

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **The oid rides the same call.** `mergeCommit` is one more field in the single `gh pr view` the
    probe already makes — zero extra processes, zero extra latency, so the high-frequency surfaces
    pay nothing for the gate's new precision. Its absence is represented by absence (never null,
    never guessed), the same convention as `reviewDecision`.
  - **Verification is close-time-only.** Status and `needs you` keep trusting `merged` at a glance.
    §20 makes this a cost argument, not a shrug: the glance answers in a probe deadline (3 s) and
    cannot afford a per-repository fetch; the close can, and the close is where the answer changes
    the act. The worst case left open — the glance invites a close the gate then refuses — spends
    seconds; the case this entry closes spent the deliverable.
  - **One `reachability` step per merged PR, and trust is always named.** The close report gains a
    step per verification so the human sees, PR by PR, either the proof — merge commit abc1234
    reaches origin/main in demo — or exactly which trust they are extending and why: no merge commit
    reported, no registered repository matches, cannot refresh. This extends 0004/0009's posture —
    an unverifiable set is trusted _aloud_ — rather than inventing a new one. The step is separate
    from `pr set` because they answer different questions: what the forge says, versus whether what
    it says reached the main line.
  - **Only a fresh negative refuses.** Reachability from a ref that only moves forward is monotone:
    a positive against any tip is sound forever, while a negative proves nothing unless the tip is
    current. So the gate refreshes first (through `refreshRepositories`, cached once per repository
    per close — 0011's refresh-first, same machinery, same fail-safes), refuses only on a
    post-refresh negative, and turns a stale negative into a named trust. A false "unreachable"
    would block a legitimate close on a network blip — §20's wrong answer, just with the sign
    flipped.
  - **Mapping is by host + repository path against the recorded remote.** The PR URL contributes
    everything before its `/pull/` segment (the forge's URL shape is the adapter's knowledge, like
    its state vocabulary); the remote is normalized across https, `ssh://`, and scp-like
    `git@host:path` forms, compared case-insensitively, `.git` stripped. Why not the task's worktree
    as the hint: a worktree names a repository only for PRs that happen to have one — a task's PR
    can live in a repository the task never made a worktree in, and identity should not depend on
    which anchors exist. A local-path remote names no forge host, so nothing maps to it and the gate
    trusts aloud — correct for the degenerate case where the "forge" is a directory.
  - **Adoption reads the raw configured URL.** `git remote get-url` resolves `url.*.insteadOf`
    rewrites — a transport-level, per-machine redirection — so `originOf` now reads
    `git config --get remote.origin.url`. The record carries the remote's durable identity; where
    this machine fetches it from is the machine's business. (Found because the hermetic tests use
    `insteadOf` to keep forge-shaped remotes offline — the record was silently absorbing the
    rewrite.)
  - **The refusal is one precise error, thrown before the first write.** It names the PR, the short
    oid, the ref (`origin/<mainLine>`), the repository, what happened (merged into a base branch
    that never reached the main line), the stake (a delivered close would tear down the worktree and
    strand the work), and the remedy (re-land: open a PR onto the main line from the surviving
    branch and merge that). `closeTask`'s ordering guarantee is untouched — every gate still runs
    before any mutation, so the refused close leaves the task exactly as found (§6).
  - **No schema change.** `PrForgeState.mergeCommit` stays internal: the explicit builders in
    `json.ts` never serialize internals, so nothing leaks, and `ward schema` is unchanged. The oid
    is the gate's input, not glance data (§17: derived surfaces carry what their caller acts on);
    surfacing it later is additive.
- **Layout:** `src/forge/gh.ts` (the `mergeCommit` field and its parse; `prBelongsToRemote` and the
  locator normalization — adapter knowledge stays in the adapter); `src/workspace/tasks.ts`
  (`resolvePrSet` returns steps and, for a delivered close, runs `verifyMainLine` →
  `verifyReachability` per merged PR with the per-close refresh cache); `src/workspace/repos.ts`
  (`originOf` reads the raw config). Tests: `test/workspace/close-reachability.test.ts` (the
  incident replay and every degradation, module calls plus one spawned-CLI refusal),
  `test/forge/gh.test.ts` (the grown translation table; the mapping table),
  `test/cli/forge-state.test.ts` (the delivering close renders its trust), `test/helpers.ts` (fake
  gh answers `mergeCommit` in gh's own shape).
- **Mechanisms:** on a delivered close, after the PR set resolves all-merged — per PR, in set order:
  oid present? → map URL to a repository record (`prBelongsToRemote` against each recorded remote) →
  refresh that repository once per close (`refreshRepositories`, failures captured, never thrown) →
  `git merge-base --is-ancestor <oid> origin/<mainLine>` in `repos/<name>` → reachable → verified
  step; unreachable + fresh refresh → `WardError` (the close aborts, nothing has mutated); any
  earlier exit (no oid, no mapping, stale negative) → named-trust step. The abandoned close and the
  non-delivered paths are untouched.

## Build log

### 2026-08-11 — The gate built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Grew `src/forge/gh.ts`: the
probe's single call asks for `mergeCommit` too, `PrForgeState.mergeCommit` carries the oid when the
forge reports one, and `prBelongsToRemote` (with locator normalization for https/ssh/scp remote
forms) gives the close gate its URL→repository mapping. Reworked `resolvePrSet` in
`src/workspace/tasks.ts` to return steps and, on a delivered close, verify each merged PR's merge
commit against `origin/<mainLine>` in the repository's canonical checkout — refresh-first through
`refreshRepositories` (cached once per repository per close), refusing only a fresh negative and
naming the trust on every unanswerable case. Fixed `originOf` in `src/workspace/repos.ts` to read
the raw configured URL (`git remote get-url` resolves `insteadOf` rewrites; the record should not).
Tests: `test/workspace/close-reachability.test.ts` (seven cases over local bare remotes with the
`GIT_CONFIG_*` `insteadOf` seam), the grown translation and mapping tables in
`test/forge/gh.test.ts`, the delivering close's named trust in `test/cli/forge-state.test.ts`, and
`writeFakeGh` answering `mergeCommit` as gh does (`{"oid": …}` or null) in `test/helpers.ts`.

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `160 pass, 0 fail, 515 expect() calls` across 19 files (from 152/474/18 at entry
  start) — all five acceptance scenarios, including the incident replay (a PR merged into
  `dead-base` refuses the close with the worktree, session, and task record asserted untouched), the
  refresh-first delivery against a deliberately stale canonical checkout, the three named trusts,
  the monotone positive under a dirty-checkout refresh failure, and the spawned-CLI refusal at
  exit 1.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Dogfood smoke (scratch workspace via `bun src/cli/index.ts`, local bare remote registered as
  `https://forge.example/demo` through the `insteadOf` seam, fake `gh`): replaying the incident —
  branch merged into `design/0009-live-forge-state`, forge reporting `MERGED` — the close exits 1
  with "error: https://forge.example/demo/pull/24 is merged, but its merge commit 8560f3f is not
  reachable from origin/main in repos/demo — it merged into a base branch that never reached the
  main line, so a delivered close would tear down the worktree and strand the work. Re-land it
  first: …"; after merging the surviving branch to main (the #26 move) the same close delivers, its
  report carrying `✓ reachability (…/pull/24 — merge commit 3867af2 reaches origin/main in demo)`.

**Decisions** (entry-local, found while building): all recorded under Design → Decisions; the one
found mid-build worth naming — `originOf` was recording the `insteadOf`-resolved URL, discovered
when the hermetic mapping tests could not match a remote the record had silently rewritten to a
local path; the fix (read the raw config) is also the honest behavior for a human whose machine
mirrors its forges.

**Next.** Natural follow-ons, in dogfood-priority order: the earlier warning (a doctor finding or
PR-watch item when a PR's base is not the main line — `baseRefName` rides the same probe call);
checks (CI) status joining `prForgeShape` when something reads it (deferred since 0009); the
messaging-seam successors to `needs you` (SF-001 of 0009).

## Spec-feedback

- **SF-001** — [`work-lifecycle`](../../intent/01-concepts/03-work-lifecycle.md), _Completion_
  (item 4) and _Task states_. _Friction:_ completion is defined as "every PR **merged** — the
  **delivered** close," but on a forge "merged" is a statement about the PR's base branch, not about
  the main line — a PR merged into a retired base satisfies the sentence as written while violating
  what the cardinal rule ("work reaches the main line only through a pull request") plainly intends,
  and this repository's own PR #24 proved the gap destroys work at close time. As written, a
  faithful build could trust the forge's word and tear down the worktree. _Assumption to keep
  moving:_ "merged" in the completion rule means "merged **and the merge reached the repository's
  main line**"; the delivered close verifies main-line arrival where it can and trusts aloud where
  it cannot, mirroring the existing unreadable-set posture. _Proposed revision:_ in _Completion_
  item 4, "every PR **merged**" → "every PR **merged and its merge reached the repository's main
  line** (a forge's 'merged' names the PR's base, which may itself never land)"; optionally add the
  incident's lesson to _The cardinal rule_'s why. One near-candidate not filed: the
  [`remote-provider`](../../intent/02-subsystems/06-remote-provider.md) contract's "report PR
  status" does not name the merge commit among what the adapter reports — adjudicated as adapter
  detail under the existing "PR status" clause, the same way `reviewDecision` needed no contract
  change in 0009.
