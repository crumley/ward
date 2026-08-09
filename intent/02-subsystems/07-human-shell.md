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
- **"What needs me?" is a first-class query.** What the surface presents is **everything waiting on
  the human**, from two springs: the requests **addressed** to them — gated actions awaiting
  authority (§18), toil the machinery surfaced (what is blocked, conflicted, ready —
  [`../01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md)), wakes the human
  asked for — recorded by the messaging seam
  ([`02-messaging-coordination.md`](02-messaging-coordination.md)) — and the conditions
  **derivable** from the record and the world's live state (a task's PR set fully merged and
  awaiting the gated close, changes requested awaiting action, version skew), which are presented
  directly and **never stored as requests just to be presentable** (§17). This layer's job is to
  present both as **one glanceable, deduplicated answer**, and to make acting on each — grant,
  decline, jump to the session — one step; which items are recorded and which derived is the
  implementation's business, invisible at the surface. _Why:_ the human's attention is the scarcest
  context in the system
  ([`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md), the
  human); a workspace that can restore a dozen threads but cannot say which one is waiting on its
  human has managed everyone's context but theirs — and an answer scoped to what happened to be
  recorded would be exactly such a workspace, silent about the waiting it could have derived.
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
- **Workspace- and scope-aware from any working directory.** Invoked anywhere **inside** an
  initialized workspace — at the root or deep in a subdirectory — Ward **discovers the workspace
  itself**, with no flag and no "which workspace?" prompt. It goes further: when the working
  directory sits inside a known structure (a worktree → room → task → project), Ward **derives the
  scope from the location** and does not make the human restate what the directory already implies.
  _Why:_ the prime directive is to spend the human's attention only where a real decision is needed
  ([`../00-foundation/00-vision.md`](../00-foundation/00-vision.md)); making someone name the
  workspace or scope they are standing in is exactly the friction Ward exists to remove. _Asymmetry
  (§8):_ this is a **human-audience** affordance — an **agent** caller may still be **required** to
  pass scope explicitly, since it is cheap for an agent to be precise and explicitness keeps its
  calls deterministic. _The boundary:_ the locations that imply scope are the **occupied work
  locations** — the anchors a caller works in (a worktree, a workdir, a room's working directory) —
  **never the record tree** that describes them: standing among a task's records is browsing the
  ledger, not doing the work. _Why:_ occupation is a deliberate act that names its purpose; a browse
  location that silently targeted a write would spend exactly the attention this constraint exists
  to save, on the least recoverable kind of mistake.
- **Long free-text arguments accept a file, not only an inline string.** Any argument that can carry
  substantial text — a brief's title or body the clearest case
  ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md), Briefs) — must accept a
  **file** as well as an inline value. _Why:_ long inline text is where **agents** struggle most
  (shell escaping, newlines, quoting), and a malformed brief corrupts the handoff; a file argument
  removes the failure mode, and helping the agent here helps the human downstream (§8).
- **A self-diagnosis command.** Ward offers a **`doctor`-style** command that inspects the machine,
  the current working directory, and the workspace, reports what is healthy, and **recommends
  improvements** — including **optional external tools Ward can take advantage of when installed**.
  For such a tool, healthy means **capable, not merely present**: installed but unable to serve —
  unauthenticated, unreachable, expired — is a distinct finding with its remedy, because
  installed-but-broken is likelier a misconfiguration than a choice, and catching misconfiguration
  is what a diagnostic is _for_. The check set also closes the degradation loop (§20): **any
  "unavailable" another verb can honestly report must be a condition doctor can name and explain** —
  a surface that degrades pointing at a tool doctor then green-lights has spent the human's
  attention twice and answered nothing. _Why:_ a well-designed CLI guides the user to a good setup
  instead of failing cryptically when one is missing, and surfacing optional capabilities is how
  Ward stays opinionated without being brittle. (The exact verb — `doctor` or the prevailing
  convention — is a design choice; the **capability** is the constraint.) _What it checks_ — the
  machine **preconditions** and the **integrity** of the record against the world, plus the repair
  posture that decides what it may fix versus report — is
  [`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)'s; this
  layer owns only the surface. It must also work **outside** a workspace, where only the machine can
  be checked. _Why:_ the first run happens before any workspace exists.
- **Version skew is surfaced, not nagged.** When the CLI and the workspace are different generations
  ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)), that
  fact reaches the human through the **"what needs me?"** surface above, and reaches a declared
  **agent** caller as a deterministic result it can act on — never as prose in output the agent must
  parse around (§8). _Why:_ a condition that blocks structural writes is exactly a request for the
  human's attention, and repeating it as chatter on every invocation trains both audiences to ignore
  it.
- **Opinionated configuration, global and workspace-local.** Ward's configuration follows the
  conventions of well-designed CLIs on **both** axes: **global** behavior that holds regardless of
  working directory, and **workspace-local** behavior that takes effect once the working directory
  is inside an initialized workspace. _Why:_ a delightful, predictable developer experience is a
  stated **quality bar**, not a nicety — a tool people reach for configures itself the way the best
  CLIs do, and a location-blind or surprising configuration model is friction the prime directive
  rejects.
- **A guided setup, runnable at any time.** Ward offers a **guided, interactive setup** that walks
  the human through inspecting and changing that configuration — the **global** axis always, the
  **workspace-local** axis additionally when invoked inside a workspace — and the workspace choices
  Ward installed as defaults (the persona cast the clearest case;
  [`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)). It is
  **not a first-run wizard**: it is re-runnable whenever something should change, presents current
  values rather than blank prompts — and, where a choice depends on an external capability, that
  capability's **live health** (the same precise findings doctor reports, §20), so the human enacts
  change against reality rather than assumption — and **converges** — a run changes only what the
  human chooses, the same idempotency creation inherits (§6). _Why:_ configuration reachable only by
  knowing which file or flag to edit makes discovery the human's job; a guided pass over what is
  configurable is the interactive-resolution quality bar (above) applied to configuration.
  _Boundaries:_ it does **not** create a workspace as a side effect — creation stays a deliberate,
  located act
  ([`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)) — and
  `doctor` stays the diagnoser: doctor **reports and recommends**, setup is where the human
  **enacts** change, guided. _Asymmetry (§8):_ a human-audience affordance; an agent changes
  configuration through the structured noun/verb surface and is never routed into a guided flow.
  (The exact verb — `setup` or the prevailing convention — is a design choice; the capability is the
  constraint.)
- **Verbs read true to the operation.** A CLI verb matches what it does: the per-thread open→running
  operation is **`resume`**; the workspace-wide cold start that re-attaches every in-flight thread
  reads as **`attach`** (or "resume the workspace"), **not** `recover`
  ([`../01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md),
  Recovery). _Why:_ the verb is a primary discoverability surface; a name that mismatches the act
  makes both audiences guess.

## What this is NOT

- **Not a requirement that humans authenticate or self-describe** — the **absence** of the agent
  signal _is_ "human," and nothing more is asked of them.
- **Not a fixed alias set** — aliases are expected to churn as telemetry reveals real usage.
- **Not interactive prompting of agent callers.** Pickers and autocomplete are for the **human**; a
  declared agent passes explicit arguments and receives a deterministic result or error, never a
  blocking prompt (§8). _Why:_ a hidden prompt would stall an autonomous agent and break
  determinism.
- **Not telemetry that ever leaves the workspace** — it is local, like everything personal.
- **Not location-blind.** Inside a workspace, Ward does not ask the human which workspace or scope
  they are in when the working directory already determines it; "which workspace?" is never a
  prompt.

## Canonical home for

- The **human-shell contract** (thin CLI plumbing), the **noun/verb CLI shape**, **interactive
  resolution and autocomplete of missing/ambiguous arguments** (a delightful, human-audience
  affordance), the **"what needs me?" attention surface** (one glanceable, deduplicated answer over
  the recorded requests to the human), **workspace/scope-awareness from any working directory**,
  **file inputs for long free-text arguments**, the **`doctor` self-diagnosis** capability (its
  _surface_ — what it checks is
  [`../01-concepts/06-workspace-lifecycle.md`](../01-concepts/06-workspace-lifecycle.md)'s),
  **surfacing version skew through the attention surface rather than as output chatter**,
  **opinionated global + workspace-local configuration**, the **guided setup** capability (any-time,
  convergent, current-values-first, human-audience; never a side-effect workspace creator), **verbs
  that read true to the operation**, the **human-default caller identity** rule, and **local usage
  telemetry**.

## Left to implementation

- The exact command tree and naming; **the interactive picker and autocomplete UX — how candidates
  for a missing/ambiguous noun are sourced, scoped, and ranked, and how their visual cues (accent,
  glyph) are rendered in the prompt**; the guided setup's step set and which configuration and
  installed choices it walks through; the specific environment-variable name and the set of context
  fields it carries (which required vs. inferred); the initial alias bindings; the telemetry storage
  format, fields, and analysis tooling; **how the workspace root and the enclosing scope are
  discovered from the working directory** (the marker file and walk-up mechanism); the **`doctor`
  check set** and which optional external tools it knows about; and the **file-argument
  conventions** (which arguments accept a file path, `-`/stdin, or an `@file` form). Planned in
  [`design/`](../../design/).

## Open questions

- **Caller-identity enforcement** — pin the exact ambient mechanism and what is _required_ vs.
  inferred.
- **Candidate scoping and ranking for interactive resolution.** When a noun is missing or a visual
  reference ("the blue one") is ambiguous, which candidates are offered and in what order — the
  visible/contextual set first, recency, scope proximity? (Pairs with the theming seam's
  ambiguous-visual-reference question, [`05-visual-theming.md`](05-visual-theming.md).)
- **Telemetry analysis loop** — is it a dedicated reflection type
  ([`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md))?
