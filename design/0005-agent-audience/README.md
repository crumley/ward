# 0005 — The agent audience

> The agent side of the two-audiences principle, made real on the verbs that exist: `--json` on
> every read verb, the declared agent caller (`WARD_AGENT`), a workspace `AGENTS.md` that teaches an
> agent to drive `ward`, and installed-artifact baselines so a future upgrade can tell customized
> from untouched.
>
> **Status:** accepted · **Started:** 2026-08-08

The first entry after the bootstrap arc
([`0002`](../0002-store-and-workspace/README.md)–[`0004`](../0004-work-spine/README.md)), and the
first delivered **as a Ward task in the bootstrap workspace** — the loop 0004 closed, exercised for
real (task `t1`, session `agent-audience-1`). Still under the arc's governing constraint: Ward
records and plumbs git; the human orchestrates. What changes here is who can _read_ the record
through the CLI: until now every verb answered only the human, and the agents the human runs by hand
had to scrape prose. This entry gives them deterministic output, a way to declare themselves,
instructions at the workspace root, and — looking one arc ahead — the install-time fingerprints that
upgrade detection cannot retrofit later.

## Serves intent

- [`principles`](../../intent/00-foundation/01-principles.md) §8 (two audiences) — the core of this
  entry: every read surface gains its agent-facing form, with the human the default caller and the
  agent declaring itself; §6 — deterministic inspection, byte-identical for the same state.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the **declared agent caller**: the
  ambient environment signal, deterministic handling for a declared agent, never an interactive
  affordance (none exist yet; the branch point is now structural); the noun/verb tree grows a
  uniform `--json` on its read verbs.
- [`context-loading`](../../intent/01-concepts/05-context-loading.md) — the workspace `AGENTS.md` as
  the manifest for its level: an agent standing at the root or in a worktree beneath it walks up to
  guidance that says how to operate here, harness-neutrally.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — "divergence must be
  detectable, so Ward records what it installed": the installed baseline, recorded at the only
  moment it can be (install time), read by doctor under the report-only posture.
- [`metadata-store`](../../intent/02-subsystems/00-metadata-store.md) — one new Ward-owned record
  type (the baselines document), typed and validated like every other.

## Scope

- **In:**
  - **`--json` on the six read verbs** — `status`, `project list`, `task list`, `worktree list`,
    `repo list`, `doctor`. Each emits exactly **one JSON document, alone on stdout**, in the
    documented shapes below; empty sets are `[]`, never prose; exit codes are unchanged (doctor
    still exits non-zero on findings); the human rendering is untouched.
  - **The declared agent caller** — the ambient signal from the human-shell contract, minimally: the
    `WARD_AGENT` environment variable; any non-empty value declares the caller an agent. A declared
    agent gets deterministic output — ANSI off no matter what the terminal, `CI`, or `FORCE_COLOR`
    would negotiate — and every interactive affordance the shell ever grows must branch on the same
    predicate and never block an agent caller.
  - **The workspace `AGENTS.md` grows a "driving ward as an agent" section** — declare yourself,
    read state with `--json`, record your session with `session open --handle`, work only in the
    task's worktree, link PRs with `task pr`, closing is gated, never merge or push to a main line.
  - **Installed baselines** — at workspace creation, a content hash (sha256) per installed artifact
    (`.ward/README.md`, `catalog.md`, `AGENTS.md`) recorded in a new Ward-owned document at
    `.ward/baselines.md`. Re-running create converges (a re-installed artifact replaces its entry;
    an untouched record is left byte-identical); doctor reads it — untouched `ok`, customized `info`
    (the yours-tier working as intended), missing `warn` — and stays report-only.
- **Deferred:**
  - **`--json` on the write verbs** (create/open/close reports). _Why safe:_ the read verbs are what
    an agent polls between actions; the shapes built now constrain nothing about mutation reports,
    and a later entry adds them additively to the same contract.
  - **Required agent context (persona, scope) and verification of the declared value.** The contract
    says a present signal lets Ward _require_ context; under the arc's constraint Ward starts no
    agents, so there is no persona or scope to require and nobody but the agent itself to set the
    variable. _Why safe:_ presence-only is forward-compatible — context fields can ride the same
    prefix (`WARD_AGENT_*`) and become required exactly when Ward becomes the setter; the records
    built here don't change shape when that lands.
  - **Local usage telemetry** (human-or-agent per invocation). _Why safe:_ a contract capability,
    not record semantics; the declaration now exists for telemetry to record when it is built, and
    nothing recorded today constrains its format.
  - **The upgrade/reconciliation machinery that consumes baselines.** _Why safe:_ detection only
    needs the fingerprint to have existed since install — recording is the part that cannot be
    retrofitted; comparison can arrive whenever update/migrate does
    ([`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md)).
  - **A version envelope on the JSON output.** _Why safe:_ the stability policy below (additive
    evolution) is the versioning; a breaking shape change would be its own design entry, and
    wrapping every document now taxes every caller against a case that may never come.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. each read verb under `--json` emits one parseable document in the documented shape,
     byte-identical across runs on the same state, `[]` for empty sets, human output unchanged,
     doctor's exit code preserved;
  2. with `WARD_AGENT` set non-empty, output carries no ANSI even under `FORCE_COLOR=1`; absent or
     empty, color negotiation is the human default (proven both ways through the spawned CLI);
  3. a fresh create fingerprints every installed artifact and records them in a validating
     `.ward/baselines.md`; re-run converges; doctor reports untouched/customized/missing as
     ok/info/warn without ever turning the workspace unhealthy;
  4. the installed `AGENTS.md` contains the driving lessons (declare, `--json`,
     `session open
     --handle`, `task pr`, gated close, never merge to main).

## Design

- **Decisions:** no new ADRs — the existing stack carries this entry. Entry-local:
  - **The ambient signal is `WARD_AGENT`, presence-only.** Any non-empty value declares; the
    recommended value is the caller's Ward session id, which this version records nowhere and
    verifies nowhere — it is a courtesy to future telemetry, not an identity check. _Why this
    shape:_ the contract's signal is "an environment variable Ward sets when it starts an agent,"
    and under the bootstrap constraint Ward starts none — so the setter today is the agent itself,
    following the installed `AGENTS.md`; when Ward grows dispatch it becomes the setter without
    changing the reader. This pins the _mechanism_ half of the human-shell open question
    (caller-identity enforcement) and deliberately leaves the required-vs-inferred half open until
    Ward is the one starting agents.
  - **Declaration changes affordances, never content.** A declared agent gets ANSI stripped and
    (when they exist) no interactive prompts — it does **not** implicitly switch output to JSON.
    _Why:_ `--json` stays an explicit, caller-chosen format usable by humans and pipelines alike; a
    signal that silently changed content would make two transcripts of the same command disagree,
    which is the guessing §8 exists to end.
  - **JSON shapes are built explicitly (`src/cli/json.ts`), never by serializing internals.** _Why:_
    the shape is a documented contract; building it field-by-field fixes key order (byte
    determinism) and lets the modules underneath refactor freely. **Stability policy — additive
    evolution:** fields keep their name and meaning; new fields may be added; optional fields are
    omitted when unrecorded, never `null`; one document per invocation, alone on stdout.
  - **Baselines live at `.ward/baselines.md`.** By the workspace-lifecycle membership test the
    baseline record is Ward's-tier — altering it breaks what divergence detection _means_ — so it
    sits with the store mechanics no human edits, not in the human-browsed record tree; it is still
    tracked in the workspace's git (only `.ward/tmp/` is ignored).
  - **Only what Ward itself wrote is fingerprinted.** An artifact that already existed when create
    ran has unknown provenance and gets no entry; a later comparison reads an absent baseline
    conservatively as "customized" (the safe direction — worst case a question is asked, never an
    overwrite). A re-installed artifact (deleted, then converged back) replaces its entry, since
    what stands is again exactly what Ward wrote.
- **Layout:** `src/cli/caller.ts` (the predicate), `src/cli/json.ts` (the shape builders),
  `src/workspace/baselines.ts` (the fingerprint); `src/store/types.ts` grows the baselines schema;
  `src/workspace/create.ts` collects what it installs and gains the tenth establishment step;
  `src/workspace/doctor.ts` grows the baseline checks; `src/workspace/templates.ts` carries the
  grown `AGENTS.md`; `src/cli/index.ts` wires `--json` and the color switch. Tests:
  `test/cli/json.test.ts`, `test/cli/agent-caller.test.ts`, `test/workspace/baselines.test.ts`, plus
  the grown create/workspace suites and a `runWardEnv` helper that makes color genuinely negotiable.
- **Mechanisms:**
  - _Caller identity:_ one predicate, `callerIsAgent()`, read once at CLI start; the color palette
    is constructed disabled for a declared agent (`picocolors.createColors(false)`) — color is
    decided at the construction point, not by mutating the environment.
  - _JSON rendering:_ each read verb computes its report exactly as before, then hands it to a shape
    builder; `--json` short-circuits the human renderer.
  - _Baselines:_ establishment steps append what they wrote to the run's installed set; the
    baselines step fingerprints that set from disk and upserts the document; doctor re-hashes and
    compares, read-only.

### The `--json` shapes

The task shape, shared by `task list` and `status` (in `status` it additionally carries
`openSessions`); optional fields (`floor`, `purpose`, `outcome`, `closedAt`) are omitted when
unrecorded:

```json
{
  "code": "t1", "slug": "json-output", "state": "active", "floor": 1,
  "purpose": "machine-readable output", "prs": ["https://…"], "inReview": true,
  "openedAt": "2026-08-08T…", "openSessions": ["json-output-1"]
}
```

- `ward status --json` →
  `{ "workspace": state, "projects": [{ "floor", "slug", "state",
  "derived", "tasks": [task] }], "bareTasks": [task] }`
  — `state` is stored, `derived` is the rollup.
- `ward project list --json` →
  `[{ "floor", "slug", "state", "derived", "taskCount", "openedAt",
  "closedAt"? }]`
- `ward task list --json` → `[task]` (without `openSessions`).
- `ward worktree list --json` →
  `[{ "task", "repo", "branch", "disposition", "path", "present",
  "createdAt" }]` — `present` is
  the record↔disk answer.
- `ward repo list --json` → `[{ "name", "remote", "mainLine", "registeredAt" }]`
- `ward doctor --json` →
  `{ "healthy", "workspaceRoot" (string | null), "machine": [finding],
  "workspace": [finding] }`
  with finding `{ "check", "severity": "ok" | "info" | "warn" |
  "error", "message" }`.

## Build log

### 2026-08-08 — The agent audience built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Built `src/cli/caller.ts`
(`callerIsAgent`, the `WARD_AGENT` predicate) and wired the CLI's palette through
`picocolors.createColors(false)` for declared agents; built `src/cli/json.ts` (explicit shape
builders + `printJson`) and added `--json` to the six read verbs; grew the workspace `AGENTS.md`
template with the driving-ward-as-an-agent section (and refreshed the `.ward/` description); added
the baselines schema and `.ward/baselines.md` document type, the create step that fingerprints what
the run installed (nine steps become ten), and doctor's read-only baseline checks. Deduplication
that fell out: `task list`'s human rendering now shares `inReview()` with `status` instead of
restating the rule. Tests: `test/cli/json.test.ts` (shapes, determinism, purity of stdout, empty
sets, human output unchanged), `test/cli/agent-caller.test.ts` (table-driven env rows through the
spawned CLI, color genuinely negotiable via the new `runWardEnv` helper),
`test/workspace/baselines.test.ts` (fingerprint/converge/replace + the doctor severities), and the
grown create/workspace suites.

**What works now — with the commands that prove it** (Bun 1.3.14, git 2.54.0, macOS):

- `bun test` → `68 pass, 0 fail, 207 expect() calls` across 10 files — covering all four acceptance
  scenarios: every `--json` verb parsed from a spawned CLI against a live spine (repo + project +
  task + worktree + session + linked PR) and byte-identical across runs; `WARD_AGENT` stripping ANSI
  under `FORCE_COLOR=1` with the human control row keeping it; the baselines arc (fresh create
  fingerprints `.ward/README.md`, `catalog.md`, `AGENTS.md`; converge satisfied; re-install
  replaces; doctor ok/info/warn, never unhealthy); the installed `AGENTS.md` lesson set.
- Dogfood smoke in a scratch workspace: `ward workspace create` reports ten steps including
  `installed baselines (.ward/baselines.md)`; `ward doctor --json` shows the three baseline checks
  `ok`; `ward status --json` and `ward task list --json` emit `[]`-clean documents.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- The entry itself is the bootstrap loop in use: delivered as Ward task `t1` in the bootstrap
  workspace, session `agent-audience-1` recorded via
  `ward session open t1 --purpose … --handle claude-code:…`.

**Decisions** (entry-local, found while building):

- **Color is decided at palette construction, not by mutating `NO_COLOR`.** picocolors reads the
  environment at import time, so flipping env vars after startup is a race the explicit
  `createColors(false)` avoids — and the test helper had to _clear_ `NO_COLOR`/`FORCE_COLOR`/`CI`
  before applying each row's env, or the 0001 pin (`NO_COLOR=1` everywhere in tests) would have made
  every row pass vacuously.
- **`doctor --json` keeps the exit contract.** The JSON path returns the same non-zero exit on an
  unhealthy report as the human path — an agent reads `healthy` from the document, a shell reads
  `$?`, and the two never disagree.
- **The baselines step orders after every installing step and before the commit**, so a single run's
  converge commit carries an artifact and its fingerprint together — a workspace history never shows
  an install without its baseline.

**Next.** Natural follow-ons, in dogfood-priority order: live PR state in `status` via `gh` (the
in-review overlay is still only "has linked PRs"), `--json` on the mutation reports, and local usage
telemetry now that callers are distinguishable.

## Spec-feedback

None this entry. One observation recorded rather than raised as friction: the human-shell contract
phrases the ambient signal as one "Ward sets when it starts an agent," and under the arc's governing
constraint Ward starts none — so this entry's setter is the agent itself, following the installed
guidance. The assumption made to keep moving: self-declaration serves the contract's purpose
(provenance from the side that can afford to be explicit) until Ward becomes the starter; the
mechanism (`WARD_AGENT`) pins half of the slice's "caller-identity enforcement" open question, and
the required-vs-inferred half stays genuinely open — nothing to propose yet.
