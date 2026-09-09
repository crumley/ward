# 0044 — A second harness: the pi coding agent

> The pi coding agent joins Claude Code behind the agent-harness seam — a thin `pi` adapter and a
> registry that routes a launch by the configured harness and everything after by the recorded
> handle's prefix, so a workspace can run either and mix both.
>
> **Status:** built — awaiting review · **Started:** 2026-09-09

The agent-harness seam
([`intent/02-subsystems/03-agent-harness.md`](../../intent/02-subsystems/03-agent-harness.md)) was
drawn so a harness could be added "without touching the role model, the session model, or the
store", and [`0028`](../0028-agent-configuration/README.md) shipped `agent.harness` as a one-value
enum precisely so the seam would be visible in configuration before a second adapter existed. Until
now there was one adapter ([`0029`](../0029-launched-sessions/README.md),
[`0035`](../0035-agent-command/README.md)), and the seam's central claim — that everything
Ward-specific stays outside it — was asserted rather than demonstrated.

This entry adds the second adapter and, in doing so, turns the seam from a promise into a fact. The
pi coding agent is close enough to Claude Code that the shapes line up: it accepts an externally
supplied session id, resumes a saved run, takes a model and a thinking level, and keeps a run's
history on disk where a handle can find it. It differs in exactly the two places a seam exists to
absorb — it spells thinking depth `--thinking` rather than `--effort`, and it stores history in a
per-cwd directory named on its own scheme rather than a single computed transcript path — so
reaching parity is a matter of the adapter owning those two facts and nothing leaking upward.

The work also forces the one structural change a second adapter always would: the claude-specific
functions the launch, resume, locate, and status paths called by name become a small **adapter
interface**, and a **registry** answers the two selection questions — which adapter a launch uses
(the configured harness) and which adapter reads a given handle (its prefix). The second is what
keeps a `claude:` run resolvable in a workspace since reconfigured for pi.

## Serves intent

- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — _Integrate behind a thin
  adapter exposing start / handle / resume / locate, with everything Ward-specific staying in Ward_:
  the adapter interface is that surface made literal, and the second implementation proves a harness
  lands without touching the session model, the store, or the CLI. _Be selectable per scope_: the
  workspace/global axes now select between two real adapters. _Accept an externally-chosen model and
  thinking depth and pass them through_ and _pass an unmade choice through as unmade_: pi takes
  `--model`/`--thinking`, and an unset key omits its flag exactly as for claude. _Make the run's
  history locatable … whatever its format_ and _Locate distinguishes found from gone … per machine_:
  the pi adapter resolves a session id to pi's own per-cwd history, found or gone.
- [`model-selection`](../../intent/02-subsystems/04-model-selection.md) — _Model identifiers are
  configuration … passed through_ and thinking depth expressed per harness: pi's `provider/id`
  models and `off … max` thinking levels pass through unread, the same posture 0028 took for claude
  (see [`spec-feedback.md`](spec-feedback.md), SF-001, on the value's portability across harnesses).
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _Opinionated configuration_ and _A
  self-diagnosis command_: `agent.harness` gains a second value on the same two axes, and doctor's
  command finding names the resolved adapter's own default program and override variable.
- [`principles`](../../intent/00-foundation/01-principles.md) — §5 (Ward orchestrates harnesses
  without binding its concepts to one), §16 (record-then-launch is unchanged and now shared), §20 (a
  configured harness Ward has no adapter for is refused by name).

## Scope

- **In:**
  - **The vocabulary.** `agentHarnessSchema` becomes `z.enum(['claude', 'pi'])`; the default stays
    `claude` (`AGENT_DEFAULTS.harness`). Both files accept `pi`; every other value still degrades to
    defaults, loudly through doctor.
  - **The adapter interface and the shared machinery.** `src/harness/adapter.ts` holds the
    `HarnessAdapter` surface (name, default command, override-env name, retention note, handle /
    nativeId, startArgv / resumeArgv, locate) and the harness-agnostic helpers a launch needs
    regardless of harness — `harnessCommand` (override → configured → default), `locateProgram`, and
    `runHarness` (foreground spawn). These are the functions
    [`0035`](../0035-agent-command/README.md) had put in the claude adapter; they were never
    claude-specific.
  - **The registry.** `src/harness/index.ts` answers `adapterNamed(harness)` for a launch and
    `adapterForHandle(handle)` for a resume, a locate, or a status probe, the latter by the prefix
    each adapter mints and reads.
  - **The pi adapter.** `src/harness/pi.ts`: handle `pi:<id>`; start
    `--session-id ID [--model M] [--thinking E] …args`; resume `--session ID …args` (no model or
    thinking); locate reads the session directory for `<timestamp>_<id>.jsonl`, honouring
    `PI_CODING_AGENT_SESSION_DIR` then `PI_CODING_AGENT_DIR`; `WARD_PI_BIN` is the hermetic
    override, `['pi']` the default command.
  - **The claude adapter keeps its exports** and gains a `claudeAdapter` object; the launch, resume,
    locate, and status paths route through the registry rather than naming claude's functions.
  - **Doctor and the gone message speak for the resolved adapter.** The `agent command` finding
    names the resolved harness's default program, its override variable, and a matching remedy; the
    `session locate` gone line prints that adapter's own retention note (claude discards old
    transcripts; pi keeps a session until a human deletes it). `session locate --json` reports the
    handle's harness rather than a constant.
  - **The manifest and the README.** The installed `AGENTS.md` names `pi` beside `claude` and shows
    both handle prefixes; the outgoing default's fingerprint joins the lineage. The README documents
    `harness: pi` and the `--thinking` spelling.
  - **Tests.** The pi adapter's argv table, handle, session-dir scheme and env overrides, and locate
    found/gone; the registry's two selections and their independence; a pi launch / resume / locate
    / doctor pass end to end through the spawned CLI with a stub; the config file accepting `pi`;
    the lineage repin.
- **Deferred:**
  - **Per-task and per-session harness selection.** The model-selection ladder reaches task and
    room; harness selection today stops at the workspace axis, as it did before this entry. Safe to
    defer because nothing regresses — the seam's _selectable per scope_ is served at the two axes
    that exist, and extending the ladder is its own change touching resolution, not this adapter.
  - **`sessionDir` from pi's own `settings.json`.** Locate honours the two environment overrides but
    not a session directory set only inside pi's settings file. Safe to defer because the env
    overrides cover the cases Ward creates and reads, and a run whose directory Ward cannot compute
    reports `gone` with the path it looked at — the honest, actionable answer the seam requires.
  - **Fork and usage reporting.** Both are optional in the seam and unbuilt for claude too; a second
    adapter does not change that, and adding them to one harness only would make the baseline
    differ.
  - **Recording the harness as its own session field.** The handle's prefix already carries it, and
    every path that needs the harness derives it from the handle. Safe to defer because a separate
    field would be a second source of the same truth, free to drift from the handle it duplicates.
- **Acceptance:**
  1. `bun test test/agent` — the pi adapter table, the registry selections, the config vocabulary,
     and the pi launch / resume / locate / doctor pass through the CLI.
  2. `bun test test/workspace/lineage.test.ts` — the outgoing `AGENTS.md` is in history and the new
     default is pinned.
  3. In a scratch workspace with `harness: pi` and `WARD_PI_BIN` pointed at a stub:
     `ward session
     open` mints a `pi:` handle and runs the stub under `--session-id`;
     `ward session locate` finds the fabricated history and names harness `pi`; `ward doctor` shows
     the pi command with its layer.
  4. `mise run check` green.

## Design

- **Decisions** (entry-local; no new ADRs):
  - **An adapter interface and a registry, not a `switch` on the harness string.** The alternative —
    each call site branching `if (harness === 'pi')` — was attractive because it touches fewer files
    and needs no new module. It lost because it would scatter the harness's knowledge across the
    launch, resume, locate, and status paths, exactly the coupling the seam exists to prevent, and a
    third harness would reopen every one of them. An interface plus a registry puts each harness's
    knowledge in one file and each selection question in one function; a third adapter is one new
    file and one array entry.
  - **`name` is both the config value and the handle prefix.** A separate `prefix` field was
    considered and rejected: one string means a configured harness and a recorded handle can never
    spell the same harness two ways, and the prefix test for routing IS "can this adapter extract a
    native id", which is asking whether the handle is its.
  - **Route a launch by name, everything after by handle prefix.** A launch has no handle yet, so
    the configured harness is the only thing that can select the adapter; a resume, a locate, or a
    status probe has a recorded handle, and a run must keep the harness it was born under — so a
    `claude:` session resolves through claude even in a workspace since reconfigured for pi. Routing
    a resume by today's configuration would hand a run to an adapter that cannot read its handle.
  - **`effort` maps to pi's `--thinking`, the value passed through unread.** Ward's key is `effort`
    (0028's word); pi's flag is `--thinking`. The adapter translates the flag NAME and leaves the
    VALUE alone, the same pass-through 0028 chose for model ids and effort levels — a Ward-side
    mapping of level names would be the stale table 0028's reasoning rejected. That the value is not
    portable across harnesses is a real friction, raised in [`spec-feedback.md`](spec-feedback.md)
    (SF-001) rather than papered over here.
  - **The shared machinery moves to `adapter.ts`, not stays in `claude.ts`.** `harnessCommand`,
    `locateProgram`, and `runHarness` were in the claude adapter but never used anything
    claude-specific; leaving them there would make the pi adapter import from claude, implying a
    dependency that is not real. They move to the seam file both adapters already import.
  - **The command's default stays the adapter's, not the registry's.** Each adapter names its own
    default program (`['claude']`, `['pi']`) and its own override variable (`WARD_CLAUDE_BIN`,
    `WARD_PI_BIN`), because that is the fact 0035 established as the adapter's — the registry knows
    which adapter, not how each is reached.
- **Layout:** `src/harness/` gains `adapter.ts` (the interface and shared helpers) and `index.ts`
  (the registry) beside `claude.ts` and the new `pi.ts`. `src/agent/run.ts` routes through the
  registry; `src/workspace/status.ts`, `src/workspace/doctor.ts`, `src/cli/index.ts`, and
  `src/cli/json.ts` select the adapter from the handle or the resolved harness rather than naming
  claude. The session model, the store, and the schema shapes are untouched — the seam held.
- **Mechanisms:** _select_ — `adapterNamed(resolvedHarness)` at launch, `adapterForHandle(handle)`
  everywhere after; _start_ — `adapter.startArgv({nativeId, model?, effort?, args})` prepended with
  `harnessCommand(adapter, configured, env).command`; _locate_ —
  `adapter.locate(nativeId, cwd,
  env)`, found or gone, per machine, per harness.
