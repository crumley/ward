# 0035 — Agent command: how the harness is invoked here

> `agent.command` — the program and its leading words that start the harness on this machine,
> `[npx, claude]` where `claude` cannot be run directly — joins the hierarchical agent configuration
> of [0028](../0028-agent-configuration/README.md), is honoured by every launch and resume, and is
> checked by `ward doctor` before a `session open` can die on it.
>
> **Status:** built — awaiting review · **Started:** 2026-09-02

Since [0029](../0029-launched-sessions/README.md) the launched open runs an executable called
`claude`, spelled once in the adapter and overridable only by a test-time environment variable. That
is right on a machine where the CLI sits on PATH under that name, and wrong on the others: a machine
where the CLI is reached through a launcher — `npx claude`, a corporate wrapper that takes the
tool's name as an argument, a versioned shim — cannot start a session at all, and the failure
arrives as a spawn error from inside the launch rather than as something the configuration could
have said. Every other fact about how the agent is started (harness, model, effort, extra flags) is
already configuration on two axes; the one that varies most between machines was the one hardcoded.

This entry makes the invocation a key like the others. It is deliberately **not** a second harness:
which adapter reads the handle and shapes the argv (`agent.harness`) and how that adapter's CLI is
started on this machine (`agent.command`) are different questions, and a `[npx, claude]` is still
Claude Code with a `claude:` handle. The precedence, the replacement semantics, and the "absent
means the harness's own answer" rule are 0028's, unchanged; what is new is the key, the seam that
prepends it, and the diagnosis.

**On the entry number.** `0034` is taken by the workspace-session shorthand entry in flight on a
sibling branch, so this one is `0035` from the start rather than losing the race the way 0028 did
twice — the number is a timestamp, not a promise, and every reference here says 0035.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _Opinionated configuration, global
  and workspace-local_: one more key on the same two axes, per-key override, whole-list replacement;
  _A self-diagnosis command_: doctor reports the resolved command with its layer and says whether
  the program it names can be found.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — _Integrate behind a thin
  adapter_ with everything Ward-specific outside it: the adapter keeps owning its default program
  and now takes the configured command as an argument, so nothing about launchers enters the session
  model, the store, or the CLI; _how start/resume are invoked per harness_ (left to implementation)
  is where the machine-specific invocation lives (see [`spec-feedback.md`](spec-feedback.md),
  SF-001).
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the global-state
  boundary: the global `agent.command` is a preference, and deleting it costs a default. The
  workspace-level override brushes the boundary from the other side, which is SF-002.
- [`principles`](../../intent/00-foundation/01-principles.md) — §5 (Ward does not care how the CLI
  is reached, only that it is), §6 (the same two files give the same command on every run), §8 (one
  resolution, a doctor line for the human and keyed data under `--json`), §20 (a program that is not
  there is named by doctor with the key that fixes it, before the launch dies on it).

## Scope

- **In:**
  - **The key.** `agent.command`, in the shared `agentSettingsSchema` — so it is accepted in both
    `~/.config/ward/config.md` and `workspace.md` — as a list of one or more non-empty strings: the
    program, then any leading words. Resolved per key like the others, workspace over global; the
    whole list replaces, never appends. No Ward-side default: a key set nowhere resolves to
    `absent`, and the adapter's own default program (`claude`) runs — exactly what every existing
    configuration gets.
  - **The launch and the resume both honour it.** The spawned command line is
    `<command…> <Ward's flags> <agent.args…>`: on open
    `npx claude --session-id ID [--model M] [--effort E] …args`, on resume
    `npx claude --resume ID …args`. `startArgv`/`resumeArgv` stay "the argv without the command";
    the adapter prepends the command at spawn.
  - **`WARD_CLAUDE_BIN` stays, as the narrowest layer.** When set it is the whole command (one
    program), above the configuration — the hermetic seam every existing test already stands on,
    kept working unchanged.
  - **Doctor.** The `agent configuration` finding gains `command` with its layer. A new
    `agent command` finding, inside a workspace, reports the command the launch would actually run —
    override, configured, or default — with where the program was found, or **warns** naming the
    program, the layer that named it, and the remedy when it is on neither PATH nor disk. The
    unconfigured case is checked too, because "`claude` is not on PATH — set `agent.command`" is
    precisely the diagnosis the machine that needs the key is waiting for. `doctor --json` carries
    `command` as a resolved key like `args`; `ward schema doctor` follows.
  - **The manifest and the README.** The installed `AGENTS.md` Sessions paragraph names the key in
    one clause; the outgoing default's fingerprint joins the lineage so existing workspaces upgrade.
    The README documents the `agent:` block — which it never had — with the work-machine case.
  - **Tests.** The merge rows for the command (global alone, workspace replacing the list, the way
    back to the default); what the files accept (a list) and reject (one string, an empty list, an
    empty word); the adapter's command table and the program lookup; the launch and resume argv
    through the spawned CLI with a two-word command pointed at the stub; doctor's row, its `--json`,
    and the ok / warn findings for a found, a missing, and an unconfigured program.
- **Deferred:**
  - **Recording the command on the session.** 0029 records `model` and `effort` because they say
    what the run _was_; the command says how this _machine_ reaches the CLI, and a session resumed
    from another machine should use that machine's command, not the one recorded. Safe to defer
    because nothing is lost: the resume reads today's configuration, and the transcript the handle
    resolves to is the same either way.
  - **A one-string form (`command: npx claude`).** Safe to skip because it would need a quoting rule
    Ward does not own, and 0028 already refused the same sugar for `args` — a list is the shape a
    spawn takes, and the two keys should be written the same way.
  - **Probing the launcher's own arguments** (that `npx` can find `claude`). Safe to defer because
    only the program's existence is knowable without running it, and a launcher's failure still
    arrives as the launch's legible refusal with the record standing.
  - **A `WARD_CLAUDE_BIN` that carries leading words.** Safe to defer because it is a test seam and
    an emergency knob, and the configuration now carries the real answer; tests that want a
    multi-word command configure one, which is what the suite does.
- **Acceptance:**
  1. `bun test test/agent` — the merge rows, the file rules, the adapter table, the launch/resume
     argv through the CLI, and doctor's findings for the command.
  2. `bun test test/workspace/lineage.test.ts` — the outgoing manifest is a known default and the
     new one is pinned.
  3. In a scratch workspace with a fake launcher and `command: [<launcher>, claude]` in a scratch
     `WARD_CONFIG_DIR`: `ward session open` and `ward session resume` both invoke the launcher with
     `claude` as its first word and Ward's flags after it; `ward doctor` shows the command with its
     layer and warns when the program is replaced by one that does not exist.
  4. `mise run check` green.

## Design

- **Decisions** (entry-local; no new ADRs):
  - **`agent.command`, not `agent.exec`, `agent.bin`, or `agent.harness`.** `bin`/`binary` names a
    single file, and the motivating case is exactly not one; `exec` reads as the syscall and
    suggests replacing the process. `command` is the head of a command line — program plus leading
    words — and pairs with the key it mirrors: `command` is the head, Ward's flags the middle,
    `args` the tail. Folding it into `harness` (say, `harness: npx claude`) lost because the harness
    enum is Ward's list of adapters — a `claude:` handle must still be read by the claude adapter
    whatever wrapper started it — and a value that is both an enum and a command line is neither.
  - **The adapter keeps the default; settings has none.** `resolveAgentConfig` answers `absent` for
    an unset command, and `claudeCommand()` in the adapter supplies `['claude']`. The alternative —
    `AGENT_DEFAULTS.command = ['claude']`, resolved like `harness` — was attractive for the doctor
    line ("command claude (ward's default)"), and lost because settings knows no adapter: the day a
    second harness lands, its default program is its adapter's to state, and a settings-level
    default would have to become a per-harness table. The cost is a doctor line that says
    `command
    not set` beside an `agent command` finding that says what runs instead.
  - **The environment override sits above the configuration.** `WARD_CLAUDE_BIN` wins over
    `agent.command` because it is the narrowest layer — one invocation — and narrower wins on every
    axis this configuration has. The reverse order would have silently ignored the test seam
    whenever a scratch config set a command. Cost: the override is one program, never a multi-word
    command; a test wanting one configures it.
  - **At least one word; no empty escape hatch.** `args: []` means "none of them here" and is the
    way to un-say a global flag. `command: []` would mean "run nothing", so it is invalid, and the
    way back to the default in one workspace is to name it: `command: [claude]`. Honest, and one
    fewer special value.
  - **Doctor checks the unconfigured case too.** The commissioned check was "when set"; the entry
    checks whichever command would run, because the machine that needs the key is the one where
    `claude` is not on PATH and nothing is set yet. Warn, never error — a machine that cannot start
    its harness is still a healthy record. The probe reads the same `claudeCommand` the launch
    spawns (the `gh`/`WARD_GH` idiom of [0010](../0010-doctor-forge-auth/README.md)), so doctor and
    the launch never describe different programs.
  - **Not recorded on the session.** See Deferred: the command is the machine's fact, not the run's.
- **Layout:** the key lands in `src/agent/settings.ts` beside its siblings; the command's default,
  precedence with the override, and the program lookup live in `src/harness/claude.ts`, where the
  adapter already owned the hardcoded name — the configuration is threaded through as a `RunRequest`
  field, so `src/agent/run.ts` changes by one line per launch path and stays out of the way of the
  task-scope launch being built on it. Doctor's finding sits beside the configuration finding it
  extends; the JSON shape and schema gain one key.
- **Mechanisms:** _resolve_ — per key, workspace over global, `absent` when neither; _spawn_ —
  `[...claudeCommand(configured, env).command, ...argv]`, where `claudeCommand` is override →
  configured → `['claude']`; _diagnose_ — `Bun.which(program, {cwd: root, PATH})`, a bare name
  searched on PATH, a path checked as a path from where a workspace session would stand.
