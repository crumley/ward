# 0051 — Build log

## 2026-10-16 — The whole entry in one iteration

**What building forced.** Three things the first sketch did not have:

- **The settled-work window would have hidden the session.** `settledProject` reads only the
  project's state and its tasks, so a floor whose tasks all closed more than a week ago would drop
  off `ward status` with its manager still open on it. That is the one moment the floor row is the
  only place the session shows up. The window now skips any floor that has an open session.
- **The stub harness could not see a floor record.** The test stub's record-then-launch probe
  (`writeFakeClaude` in `test/helpers.ts`) searched the root, `tasks/*`, and `projects/*/tasks/*`
  for its own session file. The first floor launch reported `recordSeen: false` even though the
  record had been written. `projects/*` is now one of the containers it searches.
- **A launch from inside a harness run is never what the caller means.** Adding a record-only floor
  path showed that the launch path had no answer for an agent already running. The ambient handle
  now decides record versus launch at both launching scopes, and the README's decision records why
  0045's deferral of exactly this is lifted.

**What works now — with the commands that prove it** (Bun 1.4.0, macOS). In a throwaway workspace
with `WARD_MACHINE=smoke`:

- `ward session open --floor 1 --handle claude:abc` printed
  `opened session f1-1@smoke (floor 1, in .)`. The record is at
  `projects/1-alpha/sessions/f1-1@smoke.md` with `scope: project`, `floor: 1`, and
  `purpose: Coordinating floor 1 · opened …Z`, and the journal commit is
  `Open session f1-1@smoke on floor 1`.
- `ward status` printed `floor 1 — alpha [active]` with the line `session f1-1@smoke — …` beneath
  it. The ground floor's `f0-1@smoke` sat under `floor 0`, and the workspace-level `sessions` block
  was empty.
- `ward session open f0t1 --floor 1` printed
  `error: a session has one scope — name the task … or the floor …, not both`.
- `ward doctor` on the same workspace raised no finding about the new directory.
- `bun test test/agent/floor-sessions.test.ts` → `11 pass, 0 fail`.
- `env -u WARD_AGENT mise run check` → exit 0, 810 pass, 0 fail across 69 files.

## 2026-11-04 — A no-TASK open launches again; only `--handle` records

**What changed.** The first iteration let the ambient harness run decide record versus launch at
workspace and floor scope. That was outside the brief, and it is reverted. The contract of
`ward session open` is back to the one before this entry, with `--floor` added:

- **TASK given:** record-only. The handle is `--handle`, else the run the caller stands in (0045).
- **No TASK, `--handle` given:** record-only, at workspace or floor scope.
- **No TASK, no `--handle`:** always the launched path, even from inside a harness run.

**Why.** An agent at workspace or floor scope that opens a session is starting a child agent. A
floor manager starting a worker is the motivating case, and the floor hosts and the parent link
being built next depend on it. With the ambient read, that agent could only ever record itself, so
no agent could launch at these scopes. Recording yourself stays possible, and explicit: pass
`--handle` with your run's id. The README's decision now records the revert, and 0045's deferral
stands.

**What else moved.** The installed manifest's record-only bullet says `--handle` is what records at
workspace and floor scope, and that an open without it launches even from inside a running agent.
The outgoing 0051 default (`119a4e28…`) joins the lineage, so an untouched manifest upgrades.

**What works now — with the commands that prove it** (Bun 1.4.0, macOS):

- `test/agent/floor-sessions.test.ts`: with `CLAUDE_CODE_SESSION_ID` set and no `--handle`, opens at
  `--floor 1` and at workspace scope both launch the stub, each with the record already written and
  a Ward-assigned handle that is not the ambient run's. With `--handle`, both scopes record only,
  and nothing launches.
