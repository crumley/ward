# 0050 — Compact `--json` for every caller but a human at a terminal

> A `--json` document is indented only when a human is reading it at a terminal; to a pipe, a file,
> or a declared agent it is one compact line, so the callers that parse it stop paying for
> whitespace that carries no meaning.
>
> **Status:** built — awaiting review · **Started:** 2026-10-03

Every `--json` document leaves through one function, and until now that function indented it by two
spaces for every caller ([`0005`](../0005-agent-audience/README.md)). Indentation is a reading aid:
it helps exactly one caller, a human looking at a terminal. A program reading a pipe, a file on
disk, and an agent loading the document into its context all parse it, and to them the whitespace is
pure cost. Measured on a working workspace with dozens of tasks, `task list --all
--json` is 107,805
bytes indented and 83,181 compact, so 23% of the document is whitespace. `ward schema` is 70,672
indented and 32,266 compact, so 54% of it is whitespace, because the shapes nest deeply.

The agent is the main consumer of `--json`, and for an agent bytes are tokens
([§12](../../intent/00-foundation/01-principles.md)). The shell already decides color and the live
refresh display from who is calling and where stdout goes
([`0023`](../0023-refresh-concurrency-ux/README.md)). This entry applies the same decision to the
document's spacing.

## Serves intent

- [`principles`](../../intent/00-foundation/01-principles.md): §8, because indentation is treated as
  a human-audience cue offered where a human reads, exactly like color. §12, because the callers
  that pay per token stop paying for layout. §6, because the spacing is a pure function of the
  caller, so the same state yields byte-identical output for the same mode.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): the declared-agent signal decides
  agent-facing form, and a human who has not declared anything still gets the readable default at
  their terminal.

## Scope

- **In:**
  - **The spacing rule.** Spacing is two-space indented when stdout is a terminal and the caller has
    not declared itself an agent. In every other case it is compact: a pipe or a file from any
    caller, and a declared agent even at a terminal. The document is newline-terminated either way,
    and its keys, order, and values do not change.
  - **Every `--json` verb and `ward schema`**, because all of them already emit through `printJson`.
    No JSON reaches stdout any other way. The two remaining `JSON.stringify` calls write the
    telemetry log and the store lock holder, which are files Ward owns and which are already
    compact.
- **Deferred:**
  - **An override (a flag or an environment variable forcing either form).** Safe to defer because
    both directions already have a one-word answer outside Ward. A human who wants indentation from
    a pipe has `jq`, which re-indents anyway. A human who wants compact output at a terminal can
    pipe through `cat`. A flag would also add a surface to all thirty-odd `--json` verbs, and their
    help text, to serve a preference rather than a need. If a real caller turns up that can neither
    declare itself nor pipe, the switch can be added then without changing either form.
  - **The installed manifest.** It says what `--json` contains, not how the document is laid out, so
    it stays as it is and its lineage does not move.
- **Acceptance:**
  1. `bun test test/cli/json-spacing.test.ts`: the decision table (terminal or not, by declared or
     not) gives indented only for an undeclared terminal caller. Piped `ward schema` from both a
     human and a declared agent is one newline-terminated line equal to `JSON.stringify` of itself.
     Compact output is byte-identical across runs and across callers.
  2. The existing `--json` suites, which spawn the CLI with stdout piped and parse what it prints,
     pass unchanged against compact output.
  3. `env -u WARD_AGENT mise run check` is clean.

## Design

- **Decisions:**
  - **A declared agent gets compact output even at a terminal.** _Alternative:_ decide on the
    terminal alone, as most CLIs do. _Attractive_ because it is the familiar rule and needs no
    caller signal. _Lost_ because some agent harnesses run their commands under a pseudo-terminal,
    so stdout claims to be a terminal while the reader is still an agent loading the document into
    context. `WARD_AGENT` is the shell's one declaration of which audience is reading
    ([`0005`](../0005-agent-audience/README.md)), and it already turns off color under the same
    reasoning. _Cost:_ a human who exports `WARD_AGENT` in their own shell sees compact JSON. That
    is consistent with what the declaration already does to them, since color is gone as well.
  - **Decide on stdout, not on stdin or both.** _Alternative:_ require both streams to be terminals,
    as the session-exit prompt does. _Attractive_ for symmetry. _Lost_ because the prompt needs a
    human who can answer, while indentation only needs a human who can see. Stdout alone says where
    the document goes. _Cost:_ none found.
- **Layout:** `jsonSpacing(isTTY, isAgent)` sits beside `printJson` in `src/cli/json.ts` and returns
  `0` or `2`. It is pure, and its defaults are read from the process, so the terminal path is tested
  by injection without allocating a terminal. `printJson` is the only caller.
- **Mechanisms:** only the spacing argument to `JSON.stringify` changes. The builders in `json.ts`
  still pin the key order, so both forms parse to the same value and each is byte-deterministic
  within its mode.
