# 0027 — Agent configuration, hierarchical

> The `agent.*` settings an agent is started with — harness, model, effort, and extra launch flags —
> configured on two axes: a human's defaults in the global config, overridden **per key** by the
> workspace record. One resolution answers every key with the layer that answered it, and a key set
> nowhere resolves to **absent**, so the launch that follows passes no flag at all.
>
> **Status:** built — awaiting review · **Started:** 2026-08-21

The owner commissioned this entry in these words:

> "I think it'd be great for the configuration to be for the agent to be hierarchical and so users
> would put their defaults in the user level, like say every session I want to have the Claude
> dangerously skip permissions. And I want my default model to be Fable and my effort to be High.
> And that'd be the default. and then in a specific workspace, I might want to override that and
> say, like in this workspace, the model is Sonnet. and so the configuration mechanism being at the
> user level and the workspace level would be really helpful."

> "let's say effort is omitted from the configuration, whether that be at the user level the
> workspace level or or anywhere else. else, we just wouldn't specify it to the underlying"

> "on agent.permissions, maybe we can can make this more generic and it's like extra flags or
> something to that effect where these are just extra things that are gonna get appended to the end
> of the agent command that runs it. Because if it's just dot permissions, then the user feels like
> it's limited to only permission related settings. but if we're simply appending it to the end,
> then it really could be anything so let's go ahead and make it more generic"

Three sentences, three design commitments: **two axes with the narrower winning**, **omitted means
omitted**, and **a generic tail of extra arguments instead of a permissions knob**. Everything below
is those three, made structural.

[0024](../0024-global-config-registry/README.md) built the global axis and left the second one
explicitly deferred — "workspace-local configuration (the other half of the intent clause) and
precedence between the two layers … answering it needs a second axis with real keys in it." This is
that second axis, and these are the real keys.

**On the entry number.** This entry was commissioned as `0026`, which
[`0026-shell-staleness-doctor/`](../0026-shell-staleness-doctor/README.md) had already taken on the
main line by the time the work started — the same collision
[0024](../0024-global-config-registry/README.md) hit from the other direction. It is `0027`, and the
launch entry it is stacked under is therefore **0028**; every reference in code, tests, and prose
here says so.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _Opinionated configuration, global
  and workspace-local_: the **workspace-local axis**, built, and with it the precedence rule between
  the two that the clause names but never states (SF-003). _A self-diagnosis command_ is where the
  resolution becomes visible: doctor reports the resolved configuration with per-key provenance, for
  both audiences.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — _Accept an externally-chosen
  model and thinking depth … this seam does not decide which model runs, only honors the decision._
  This entry builds the **externally-chosen** part: where the choice is written, how it resolves,
  and — the part the seam is silent about — what "unchosen" means (SF-002). Also _Be selectable per
  scope_: `agent.harness` exists with one legal value today so the seam is visible in configuration
  before there is a second adapter to make it urgent.
- [`model-selection`](../../intent/02-subsystems/04-model-selection.md) — _Model identifiers are
  configuration … never written into the concepts_: they are two optional strings in two documents,
  validated for nothing but non-emptiness. The slice's override hierarchy starts at the workspace
  and this entry adds a layer **above** it, which is the friction SF-001 records.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the **global-state
  boundary**: everything this entry puts in `~/.config/ward/config.md` is a preference, and deleting
  the file costs a default, never a recovery. The workspace half lives in the workspace record,
  where the workspace's own configuration belongs.
- [`principles`](../../intent/00-foundation/01-principles.md) — §5 (the harness key exists so the
  seam is configurable, and no model name is baked in anywhere); §6 (one deterministic resolution
  order, the same answer for the same two files); §8 (one resolution, two renderings — a doctor line
  for the human, keyed structure under `--json` for an agent); §20 (an unreadable config degrades to
  "nothing configured" at the point of use and is named precisely by doctor).
- [`store-stack`](../decisions/0005-store-stack.md) (ADR) — both layers are ordinary store
  documents: YAML front matter, zod-validated, written by staging and renaming.

## Scope

- **In:**
  - **The `agent.*` subtree in global configuration** (`src/global/config.ts`), following the
    pattern 0024 established for `repo.refresh.stash` — a dotted key is its path through the front
    matter:
    - `agent.harness` — optional, `'claude'`, defaulting to `'claude'`.
    - `agent.model` — optional string, **no default**, passed to the harness verbatim.
    - `agent.effort` — optional string, **no default**, passed verbatim and deliberately not
      enum-validated (below).
    - `agent.args` — optional list of non-empty strings, default `[]`, appended verbatim to the end
      of the launch command.
  - **The same block in the workspace record** (`workspace.md` front matter, `src/store/types.ts`) —
    the workspace-local configuration home, overriding the global block **per key**. Additive: a
    record without an `agent` block is valid unchanged and needs no `ward workspace upgrade`.
  - **One resolution, with provenance** (`src/agent/settings.ts`): `resolveAgentConfig` takes the
    two layers and answers every key with `workspace`, `global`, `default`, or `absent` — and
    `absent` carries no value at all. `agent.args` **replaces** at the winning level; it never
    concatenates across them.
  - **Visibility in `ward doctor`**: inside a workspace, one `agent configuration` finding renders
    the resolved answer per key with the layer that gave it, and `doctor --json` carries the same
    resolution as keyed data (`agent`, null outside a workspace) — one read feeding both audiences.
  - **Tests**: the merge matrix (each key × the level that set it × set nowhere), args replacement
    and the empty-list escape hatch, what each file accepts and rejects, the additive record, and
    doctor's finding and JSON — all on the `WARD_CONFIG_DIR` hermeticity seam 0024 built.
- **Deferred:**
  - **Actually launching an agent** — entry 0028, stacked on this one. _Why safe:_ this entry's
    whole output is a resolved value with an explicit "absent", which is exactly what a launch needs
    and nothing it does not; building the two together would have mixed a configuration question
    with a process-spawning one and made both harder to review.
  - **A reader that resolves from a workspace root alone.** The resolution is pure and takes the two
    layers its caller already holds. _Why safe:_ the one caller today (doctor) has just validated
    the workspace record and read the global config, so a reader would have made it read both twice;
    0028 adds one the moment it has a caller that does not, and the precedence rule stays where it
    is.
  - **Any level narrower than the workspace** — per-project, per-task, per-room/session
    ([`model-selection`](../../intent/02-subsystems/04-model-selection.md)'s full hierarchy). _Why
    safe:_ the directive asks for two levels; the resolution is a fold over an ordered layer list,
    so a third layer is a row, not a redesign — and inventing scope-level configuration homes before
    a session verb exists to read them would guess at their shape.
  - **Recording the resolved model and effort on the session record.** _Why safe:_ nothing runs yet,
    so there is nothing to record; but it is the missing half of SF-001's answer and belongs with
    the launch that knows what it actually ran.
  - **A `ward config` read/write verb, and the guided `ward setup`.** _Why safe:_ 0024's posture,
    unchanged — the files are optional, hand-editable, and every key resolves without them; a second
    configuration-editing surface before the guided one is the drift the four-leg discipline warns
    about. Doctor already answers "what is set, and where did it come from?".
  - **Validating model names**, and gating effort levels. _Why safe:_ the underlying CLI owns both
    vocabularies and errors clearly on a value it does not know; see the decision below.
  - **Showing the agent configuration outside a workspace**, and in `ward status`. _Why safe:_ half
    a resolution is not an answer — outside a workspace the workspace layer is not merely unset, it
    is unknown — and `status` reports the state of the work, not the caller's preferences.
  - **A README section for the feature.** _Why safe:_ nothing consumes the configuration yet, and
    documenting a knob before the thing it turns would promise behavior that does not exist. It
    lands with 0028.
- **Acceptance:** `mise run check` green, and the two new suites proving: every key resolved from
  every level and from nowhere; args replaced rather than concatenated, and an explicit `[]` in a
  workspace erasing a global flag; an absent key carrying no value in-process and no `value` field
  in JSON; a pre-0027 workspace record still valid; an unknown harness rejected while an unknown
  effort passes through; doctor's finding text, its severities, and its `--json` block, including
  `null` outside a workspace.

## Design

- **Decisions:** no new ADRs — [ADR 0005](../decisions/0005-store-stack.md) already decides the
  document stack and this entry adds keys to two documents it governs. Entry-local:
  - **One schema, embedded in both documents.** `agentSettingsSchema` is defined once and reused by
    the global config and the workspace record, so a key cannot come to mean one thing in
    `~/.config/ward/config.md` and another in `workspace.md`, and a human who learns the block once
    can write it in either file. It is also what makes the merge total: both layers are the same
    shape, so "resolve per key" is a fold, not a case analysis.
  - **`src/agent/settings.ts`, not `src/global/agent.ts`.** The resolution spans both axes, so
    neither existing home is honest: a function in `src/global/` that reads workspace records would
    put the narrower layer inside the module about machine-level state, and one in `src/workspace/`
    would say the opposite. `src/agent/` is the subsystem this configuration is _about_ — and it is
    where 0028's harness adapter lands, so the seam and its settings sit together. The file imports
    nothing but zod, which is also what keeps the two document schemas free of an import cycle.
  - **The resolution is pure; the reads are the caller's.** `resolveAgentConfig` takes the two
    layers rather than a workspace root. That is what lets doctor resolve from the record it has
    just validated — one read, one error finding, no second complaint about the same broken file —
    and it makes the precedence rule testable as a table with no filesystem in it at all.
  - **Absent is a shape, not a sentinel.** `Resolved<T>` is a union: `{provenance: 'absent'}` has no
    `value` field. A consumer that forgets to branch does not compile, and the JSON document omits
    the field entirely rather than emitting `null` or an empty string — the omission _is_ the
    answer, and 0028's launch has nothing to pass. This is the directive's second quote made
    structural: Ward cannot accidentally invent a default for a key nobody set, because there is no
    place to put one.
  - **Ward states defaults only where it has an opinion.** `AGENT_DEFAULTS` holds `harness` (Ward
    must pick an adapter to run at all) and `args` (`[]` is the honest empty case) — and nothing
    else. The absence of `model` and `effort` from that object is the design, stated in one readable
    place instead of enforced by a comment.
  - **The global config does not resolve its own agent block.** `readConfig().agent` returns the
    block as written (`{}` when unset) rather than a defaulted structure, because defaulting there
    would make a global default beat a workspace value — precedence exactly backwards. Every other
    key in that file still resolves at read time; `agent` is the one subtree with a second layer
    above it, and the file says so.
  - **Ward validates the vocabulary it owns and passes through the vocabularies it does not.**
    `harness` is enum-validated because the harness set _is_ Ward's list of adapters — a value
    outside it names something Ward genuinely cannot run. `effort` is deliberately **not** validated
    against today's levels, and neither is `model`: those vocabularies belong to the harness CLI,
    which owns them, errors clearly on a value it does not know, and will grow new ones on its own
    schedule. A Ward-side enum would turn the day the harness adds a level into the day Ward rejects
    a valid configuration — gating a namespace we do not own buys no safety and breaks on someone
    else's release.
  - **`agent.args`, not `agent.permissions`.** The directive's third quote, taken literally: the
    mechanism is "these strings go on the end of the command", and naming it after the first use
    (`--dangerously-skip-permissions`) would have made every other use feel illegitimate. Entries
    must be non-empty strings — an empty argv word is a live hazard on a command line and never a
    thing anyone means.
  - **Args replace at the winning level; they never concatenate.** Concatenation is a one-way
    ratchet: a flag set globally could only ever be added to, never removed for one workspace, and
    the only escape would be editing the global file every other workspace depends on. Replacement
    makes the escape hatch obvious — `args: []` in a workspace record means "none of them here" —
    and keeps the resolved value something a human can read off a single file instead of assembling
    in their head. It also answers, for configuration, the lifecycle slice's open question
    _Deletion, not just shadowing_ (SF-003).
  - **`{}` overrides nothing.** A workspace that carries an `agent:` block with no keys in it
    resolves exactly like a workspace with no block: presence is not an override, only a value is.
    The test is `!== undefined` everywhere and never truthiness, which is also what lets an explicit
    `args: []` win.
  - **Doctor renders one finding, not four.** The global-config finding's idiom: one check, one
    line, the resolved values in the message. Four findings would quadruple the workspace section
    for a subject that is one thought. `info` when nothing is configured on either axis (and it
    names both files), `ok` when something is, `error` never — an unconfigured agent is the ordinary
    state, not a fault.
  - **The `--json` block is structure, not the finding's prose.** Doctor's findings are prose keyed
    by check; an agent reading `agent configuration — harness claude (ward's default) · …` would be
    parsing English. `doctorJson` carries the same resolution as keyed data, from the same single
    resolution the finding rendered, so the two audiences cannot be told different things. `null`
    outside a workspace, mirroring `workspaceRoot`.
  - **The asymmetry that does _not_ apply here.** 0024's global preferences answer for a **human**
    who omitted a flag while a declared agent is read from its arguments alone (§8), so an agent's
    invocation means the same thing on every machine. This configuration is deliberately **not**
    read that way: it configures the agent that is about to be _launched_, it is not a fallback for
    an argument the caller left off. Both audiences resolve it identically, and an agent asking
    "what would run here?" gets the same answer a human does — which is the point of reporting
    provenance rather than just a value.
- **Layout:** new `src/agent/settings.ts` (the schema, the defaults, `Resolved`, and
  `resolveAgentConfig`). Changed: `src/global/config.ts` (the `agent` subtree and its unresolved
  passthrough), `src/store/types.ts` (the workspace record's optional `agent` block),
  `src/workspace/doctor.ts` (the config read hoisted to one call in `runDoctor`, the workspace
  section returning its resolution alongside its findings, and the new finding),
  `src/cli/schema.ts` + `src/cli/json.ts` (the `agent` block of the doctor shape). Tests:
  `test/agent/config.test.ts` (the merge matrix and what the files accept) and
  `test/agent/doctor.test.ts` (the resolution where a caller can see it).
- **Mechanisms:**
  - _Write:_ a human edits either file by hand. Nothing in Ward writes an `agent` block; both are
    ordinary front matter, validated on read.
  - _Read:_ the global block comes back as written (`{}` when unset, `{}` again when the file will
    not parse — §20); the workspace block comes off the record the caller already read.
  - _Resolve:_ per key — workspace, else global, else the built-in default, else absent — with the
    layer recorded alongside the value.
  - _Report:_ `runDoctor` reads the global config once, hands it to the machine section (which names
    the file's state) and to the workspace section (which resolves against the record), and returns
    the resolution on the report so the finding and the JSON document are the same answer twice.

## Build log

### 2026-08-21 — The whole entry in one iteration

**Goal.** Everything in Scope. **What was done.** Read the governing intent and the entry this one
extends (0024) before designing; then, in order: the shared settings schema and the pure merge; the
`agent` subtree in the global config and the passthrough that keeps it unresolved; the workspace
record's optional block; doctor's single-read restructure, its finding, and the `--json` shape; the
two suites.

Three shapes changed hands more than once while building. (1) The merge started out as a method on a
"config reader" that took a workspace root — until doctor needed it and turned out to already hold
both layers, at which point reading them again was the only thing the design was buying. Pure merge,
caller's reads. (2) `Resolved<T>` started as `{value?: T; provenance}` and became a union the moment
the JSON builder had to answer "what does `value` mean when provenance is `absent`?" — with the
union, the question cannot be asked. (3) `readConfig` initially resolved `agent` against the
defaults like every other key, which quietly made the global layer beat the workspace one; the fix
is one line and the comment explaining it is longer than the code, deliberately.

**What works now — with the exact commands that prove it** (Bun 1.3.14, Linux):

- **Dogfood, in a scratch workspace** with `WARD_CONFIG_DIR` pinned. With
  `agent: {model: fable, effort: high, args: [--dangerously-skip-permissions]}` in the global config
  and nothing in the workspace, `ward doctor` reports:
  `✓ agent configuration — harness claude (ward's default) · model fable (global config) · effort
  high (global config) · args --dangerously-skip-permissions (global config)`.
  Adding `agent: {model: sonnet, args: []}` to `workspace.md` and re-running `ward doctor --json`
  gives `model {workspace, sonnet}`, `effort {global, high}`, `args {workspace, []}`,
  `harness {default, claude}` — the directive's case exactly: the model moved, the effort did not,
  and the empty list took the global flag off in this workspace alone.
- `ward schema doctor` emits the new `agent` block as JSON Schema, with `value` absent from
  `required` on every key — the "absent carries no value" contract, visible in the published
  contract rather than only in the code.
- `bun test test/agent` → `30 pass, 0 fail`.
- `bun test` → `466 pass, 0 fail, 1806 expect() calls` across 42 files, from `436 / 1758 / 40` at
  this branch's base. **No existing case changed:** all 30 new cases are this entry's two suites.
- `mise run check` → exit 0 (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).

**Shared surfaces this entry touches** — named because 0028 builds on the first two:
`src/global/config.ts` (the `agent` subtree), the workspace record schema in `src/store/types.ts`
(the `agent` block), and `src/workspace/doctor.ts` (the report shape gained a field and
`workspaceChecks` now returns a pair). Nothing else in the CLI changed.

**One incidental fix, called out because it is not this entry's subject.** The whole-contract case
in `test/cli/schema.test.ts` spawns the CLI once per registered verb — thirty processes inside a 5s
default deadline — and failed on this machine before any of this entry's code existed (the base run
above is `435 pass, 1 fail`, that case). It is spawn-bound, not assertion-bound: a timeout there
reports a shape mismatch that never happened. Its deadline is now pinned at 30s with the reasoning
in place. No assertion changed.

**Next.** Entry 0028: start an agent from this configuration — the harness adapter, the launch
command assembled with absent keys omitted, and the resolved model and effort recorded on the
session (SF-001's missing half). After that, the narrower scope levels if real use asks for them.

## Spec-feedback

- **SF-001** — [`model-selection`](../../intent/02-subsystems/04-model-selection.md), _Resolution
  through the scope hierarchy_ and _Model identifiers are configuration_. _Friction:_ the slice's
  hierarchy **begins at the workspace** ("a default at the workspace level, overridable at project,
  task, and room/session levels") and locates the identifiers themselves "in the workspace, never
  written into the concepts". This entry, on the owner's directive, adds a layer **above** the
  workspace — the user's machine — which the slice neither permits nor forbids, and which brushes
  against §3: two humans opening the same workspace would get different models from it, and nothing
  in the workspace says why. _Assumption to keep moving:_ a per-user layer is permitted **below the
  workspace default in precedence** (it only supplies what the workspace has not chosen), bounded by
  the global-state rule — nothing may depend on it, and deleting it costs a default and never a
  recovery. The workspace's self-sufficiency is preserved not by forbidding the layer but by
  **recording what actually ran on the session**, which is 0028's job and does not exist yet; until
  it does, this is the one place the assumption is genuinely thin. _Proposed revision:_ extend the
  hierarchy clause to name the full ladder — user/machine default, then workspace, project, task,
  room/session, narrower always winning — with the bound that the user layer may hold **only**
  preferences and that the resolved choice is recorded on the session, so reproduction reads the
  record rather than the machine.
- **SF-002** — [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md), _Accept an
  externally-chosen model and thinking depth … and pass them through_. _Friction:_ the seam says it
  honors a choice, and says nothing about what happens when **no choice was made** — which is the
  ordinary case and the directive's first quote. Two readings are available and they differ in
  behavior: Ward substitutes its own default (making Ward's opinion silently override the harness's,
  and changing what an unconfigured session does the day the harness changes its default), or Ward
  passes nothing and the harness's own default stands. _Assumption to keep moving:_ the second —
  **unchosen is passed through as unchosen**; Ward omits the flag entirely rather than inventing a
  value, which is why the resolved shape here distinguishes `absent` from every default and refuses
  to let a caller read a value that was never set. _Proposed revision:_ one clause in the seam:
  "**An unmade choice is passed through as unmade.** Where no model or thinking depth has been
  chosen at any level, Ward passes none and the harness's own default applies; Ward never
  substitutes a default for a choice the human did not make." _Why it belongs in intent:_ it holds
  no matter how the launch is built, and it is the difference between a harness-agnostic tool and
  one with opinions about somebody else's defaults (§5).
- **SF-003** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _Opinionated
  configuration, global and workspace-local_. _Friction:_ the clause names both axes and never says
  **which wins**, nor at what granularity. Two questions had to be settled to build anything: does a
  workspace value override the whole global block or only the key it sets, and does a
  collection-valued key **replace** or **merge**? The second is the sharper one — it is the
  lifecycle slice's own open question _Deletion, not just shadowing_ ("composition lets a human
  override by appending but never _un-say_ a default") arriving in configuration, where it has a
  clean answer that the composition case may not. _Assumption to keep moving:_ the workspace axis
  overrides the global one **per key**, and a collection-valued key **replaces** rather than merges,
  so a narrower layer can always un-say a broader one; an empty collection is a value and means
  "none". _Proposed revision:_ two sentences in the configuration clause — "the workspace-local axis
  overrides the global axis **per key**; a key set at neither level is unset, not defaulted by
  either" and "a collection-valued setting **replaces** at the level that sets it, so the narrower
  layer can remove what the broader one added" — and a pointer from the lifecycle slice's _Deletion,
  not just shadowing_ question noting that configuration has an answer even while context
  composition does not.
