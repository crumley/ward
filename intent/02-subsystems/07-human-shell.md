# Subsystem: Human Shell / Interaction Layer

> **Layer:** intent · subsystem (seam). The contract any design must honor; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

## Responsibility

The thin convenience layer through which a human **drives Ward interactively**, plus the **usage
signal** it produces — and the shape of the structured CLI underneath it. Serves the two-audiences
principle (§8) and feeds the compounding loop
([`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md)).

## Constraints any design must honor

- **All real logic lives in the Ward tool;** this layer only plumbs to it and presents results.
  _Why:_ keeping it thin keeps the core testable and portable across shells.
- **The structured CLI is organized around nouns and verbs** — nouns are the domain concepts
  (workspace, project, task, worktree, room, session, repo), verbs are the operations (create, list,
  open, close, resume, dispatch…). _Why:_ a noun/verb structure is discoverable and predictable for
  both audiences and stays coherent as it grows.
- **The interactive layer adds mnemonic shorthands** for common operations — thin plumbing,
  **evolvable** as telemetry reveals real usage.
- **Resolve missing or ambiguous arguments interactively — and make it delightful.** When an
  interactive (human) caller invokes a verb that needs a noun they did not supply — or supplied
  ambiguously (a command that needs a **room** but none was named) — the shell does **not** fail
  with "missing argument." It **prompts the human to quickly pick what they meant** from the valid
  candidates, and **autocompletes** partially-typed nouns, verbs, and identities. Candidates are
  shown with the cues the human already holds — identity handle plus **accent color and type glyph**
  ([`05-visual-theming.md`](05-visual-theming.md)) — so "the blue 🗂️ one" is selectable, not just
  `4A12`. _Why:_ the prime directive is to spend the human's attention only where a real decision is
  needed ([`../00-foundation/00-vision.md`](../00-foundation/00-vision.md)); making them recall an
  exact handle, or re-run a command with the right flag, is precisely the friction Ward exists to
  remove. This is a **quality bar, not just a feature** — fast, low-ceremony interactive resolution
  is the difference between a tool people fight and one they reach for. _Asymmetry (§8):_ this is a
  **human-audience** affordance; an **agent** caller (which declares itself, below) passes explicit
  context and gets **deterministic** handling — never a blocking interactive prompt.
- **The human is the default caller; agents identify themselves.** A human typing in their own shell
  declares nothing. An agent caller carries its context — persona, scope, working directory — via an
  **ambient signal Ward sets when it starts an agent** (an environment variable and fields
  propagated to subprocesses); when that signal is present Ward **requires** the context, when
  absent it requires nothing. _Why:_ remove ceremony from the common interactive case while still
  capturing rich provenance from the side that can afford to be explicit.
- **Record command usage as local telemetry** — per invocation: persona, scope, working directory,
  and human-or-agent. It is **local and personal** (§4) and **never** surfaced to remote artifacts.
  _Why:_ over time it is analyzed (a natural reflection type) to decide what needs a new alias,
  which flows are clumsy, which tooling is missing — how the interaction layer compounds.

## What this is NOT

- **Not a requirement that humans authenticate or self-describe** — the **absence** of the agent
  signal _is_ "human," and nothing more is asked of them.
- **Not a fixed alias set** — aliases are expected to churn as telemetry reveals real usage.
- **Not interactive prompting of agent callers.** Pickers and autocomplete are for the **human**; a
  declared agent passes explicit arguments and receives a deterministic result or error, never a
  blocking prompt (§8). _Why:_ a hidden prompt would stall an autonomous agent and break
  determinism.
- **Not telemetry that ever leaves the workspace** — it is local, like everything personal.

## Canonical home for

- The **human-shell contract** (thin CLI plumbing), the **noun/verb CLI shape**, **interactive
  resolution and autocomplete of missing/ambiguous arguments** (a delightful, human-audience
  affordance), the **human-default caller identity** rule, and **local usage telemetry**.

## Left to implementation

- The exact command tree and naming; **the interactive picker and autocomplete UX — how candidates
  for a missing/ambiguous noun are sourced, scoped, and ranked, and how their visual cues (accent,
  glyph) are rendered in the prompt**; the specific environment-variable name and the set of context
  fields it carries (which required vs. inferred); the initial alias bindings; the telemetry storage
  format, fields, and analysis tooling. Planned in
  [`../../design/cli-and-telemetry.md`](../../design/cli-and-telemetry.md).

## Open questions

- **Caller-identity enforcement** — pin the exact ambient mechanism and what is _required_ vs.
  inferred.
- **Candidate scoping and ranking for interactive resolution.** When a noun is missing or a visual
  reference ("the blue one") is ambiguous, which candidates are offered and in what order — the
  visible/contextual set first, recency, scope proximity? (Pairs with the theming seam's
  ambiguous-visual-reference question, [`05-visual-theming.md`](05-visual-theming.md).)
- **Telemetry analysis loop** — is it a dedicated reflection type
  ([`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md))?
