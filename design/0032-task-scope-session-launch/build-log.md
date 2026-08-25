# 0032 — Build log

> The journal of building the task-scope session launch — what building forced or revealed, with the
> commands that prove what works. Newest iteration at the bottom; what was done lives in the
> commits.

### 2026-08-24 — The second launched scope

Two things changed shape while building. (1) `launchTaskSession` began as a transcription of the
workspace launcher and became an opener over a shared spine the moment the two bodies were
side-by-side: every line that differed was scope, every line that matched was invariant, and the
invariant is exactly what must not drift (the Design's _One spine, two openers_). (2) The directory
refusal moved ahead of the record — the first draft resolved worktrees inside the open and refused
after allocation, which would have spent an id and written nothing to explain it; settling the
directory first means a refusal manufactures nothing, which the tests pin (`readSessions` empty,
`runs()` empty).

**What works — with the exact commands that prove it** (Bun 1.3.14, Linux):

- **Dogfood, in a scratch workspace** with `WARD_CONFIG_DIR`, `CLAUDE_CONFIG_DIR`, and
  `WARD_CLAUDE_BIN` pinned at a stub that prints its argv, cwd, and environment. With a task `t1`
  and no worktree, `ward session open t1 --purpose "drive the feature"` refuses:
  `task 't1' has no worktree to stand the agent in`, naming both
  `ward worktree create t1 --repo NAME` and `--dir PATH` — and no session record exists. After
  `ward worktree create t1 --repo demo`, the same command prints
  `opened session feature-1 (task t1, handle claude:3c786ca7-…)` then
  `launching the agent in worktrees/t1-feature — WARD_AGENT is set`; the stub reports
  `--session-id 3c786ca7-…`, cwd `…/ws/worktrees/t1-feature`, `WARD_AGENT=feature-1`; on exit:
  `session feature-1 is still open — an exit is not a close`. The record at
  `tasks/t1-feature/sessions/feature-1.md` carries `scope: task`, `task: t1`,
  `workingDirectory: worktrees/t1-feature`, the handle, and the `opened` event.
- `ward session resume feature-1` → `--resume 3c786ca7-…`, cwd the worktree again, and the trail
  reads `opened`, `resumed`. `ward session locate feature-1` resolves against the **worktree's**
  munged path, exit 0.
- With a second worktree, `ward session open t1 --purpose …` refuses:
  `task 't1' has 2 worktrees — say where the agent stands with --dir PATH (one of:
  worktrees/t1-feature, worktrees/t1-second)`;
  adding `--dir worktrees/t1-second` records and launches exactly there. `--handle claude:abc`
  records without any spawn, and `ward status` shows the open session on its task's own row
  (`t1 feature [active] — sessions: feature-1`) — the indicator the entry decided not to duplicate
  at workspace level.
- `bun test test/agent` → `58 pass, 0 fail` (the launch suite grew from 15 to 21 cases); `bun test`
  → `550 pass, 0 fail, 2357 expect() calls` across 47 files, from `543 / 2313 / 47` at this branch's
  base. **Two existing cases changed, deliberately:** the scope suite's
  `session open TASK records the task session …` became
  `… launches at task scope, the sole worktree as its directory (0032)` (same record assertions, now
  through the stub harness), and the launch suite's no-handle resume fixture opens its handle-less
  session through the store API, since the CLI's handle-less path now launches.
- `mise run fmt` then `mise run check` → exit 0 (Biome + dprint + `tsc --noEmit` + `bun test` +
  lychee + actionlint). Both run as `env -u WARD_AGENT mise run check` on this machine: the build
  ran with a live `WARD_AGENT` in the environment, which leaks into the spawned-CLI suites and fails
  eight **pre-existing** cases that assert human-shaped output (verified against the untouched base:
  `bun test` → `8 fail`, `env -u WARD_AGENT bun test` → `543 pass`). The scaffolding hardening is a
  named deferral in the README's Scope.

**Next.** Project-scope launches (the third opener over the same spine, and the entry that owes
`status` its answer for sessions without a task row); the `WARD_AGENT`-hermetic test scaffolding;
rooms, when they have records to stand on.

### 2026-08-24 — The declared-agent guard

Review of the delivered change surfaced a hazard the first iteration had missed: the invocation this
entry turned into a launch (`session open TASK --purpose TEXT`, no `--handle`) is exactly the one
0029-era installed manifests teach an already-running agent to record itself with — and until each
workspace upgrades, that stale instruction would have spawned an interactive TUI inside the agent's
own shell. The launched path now refuses a declared caller at both scopes, before any work; the
reasoning, the alternative, and the cost are the README's Design decision (_The launched open is a
human's verb until detached hosting exists_), and covering the workspace scope is the entry's one
addition beyond its core scope, named there as one. The manifest bytes changed again before anything
shipped, so the lineage needed no new history entry — the 0029-era fingerprint already covers the
outgoing installed default, and the pinned current hash simply moved.

**What works — with the exact commands that prove it** (Bun 1.3.14, Linux):

- **Dogfood, in the scratch workspace above:** with `WARD_AGENT=sess-9`,
  `ward session open t1 --purpose x` →
  `error: a declared agent is not given the launched open — it starts an interactive run in this
  terminal. Record your own run instead: ward session open t1 --purpose TEXT --handle HANDLE —
  launching stays a human act until detached hosting exists`,
  exit 1, no record written, no process spawned; the bare `ward session open --purpose x` refuses
  the same way with the workspace-shaped fix; both `--handle` forms still record, declared, exit 0.
- `bun test test/agent/launch.test.ts` → `22 pass, 0 fail` — the new case pins both refusals
  (stderr, no record at either scope, `runs()` empty) and both `--handle` paths staying open to a
  declared caller.
- `bun test` → `551 pass, 0 fail, 2370 expect() calls` across 47 files; `mise run fmt` then
  `env -u WARD_AGENT mise run check` → exit 0.

**Next.** Unchanged from the first iteration.
