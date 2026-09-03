# 0035 — Spec-feedback

> Intent frictions found while building the agent command — how the harness is invoked on this
> machine.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — the seam distinguishes harnesses, not invocations

- **Slice:**
  [`intent/02-subsystems/03-agent-harness.md`](../../intent/02-subsystems/03-agent-harness.md),
  "Constraints any design must honor" (_Be selectable per scope_) and "Left to implementation" (_how
  start/resume are invoked per harness_).
- **Friction:** the seam knows one axis of variation — _which_ harness — and leaves "how
  start/resume are invoked per harness" to implementation as if it varied only by harness. Building
  the launched open on a second machine showed it varies by **machine** too: the same harness,
  Claude Code, is `claude` on one machine and `npx claude` (or a wrapper that takes the tool's name)
  on another, and a `claude:` handle must be read by the same adapter whatever launcher started the
  run. Nothing in the seam permits or forbids a machine-level invocation setting distinct from
  harness selection, so a design following it literally would either fold the launcher into the
  harness enum (making "which adapter" and "which command line" one value) or hardcode the program,
  which is what 0029 did.
- **Assumption made to keep moving:** harness selection and harness invocation are **separate
  facts**: the harness names the adapter (handle format, argv shape, history location) and is
  selectable per scope as the seam says; the invocation — the program and its leading words — is
  configuration on the human-shell's two axes, defaulting to the adapter's own name, and never
  changes which adapter reads the handle.
- **Proposed revision:** one clause under _Be selectable per scope_ — "**The harness's invocation is
  configuration, not identity.** How a chosen harness is started on a given machine (the program and
  any leading words) is configured beside the model and the extra flags and defaults to the
  adapter's own; it never changes which adapter owns the handle." — and a matching phrase in _Left
  to implementation_: "how start/resume are invoked per harness **and per machine**".
- **Status:** adjudicated — [#75](https://github.com/crumley/ward/pull/75) (owner's ruling:
  invocation is distinct from harness identity; the harness is `claude` whatever command reaches
  it).

## SF-002 — a workspace-level command is a machine fact in a record that travels

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  "What may live outside the workspace" (the global-state boundary), with
  [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) §3.
- **Friction:** the boundary says global state holds preferences only, so nothing the resumption of
  work depends on lives outside the workspace — and the global `agent.command` honours that (delete
  it, and the default runs). The friction is on the other side: the **workspace** layer of the same
  key puts a machine-shaped fact — where this machine's launcher is — into the self-sufficient
  record. A workspace whose `workspace.md` says `command: [/opt/corp/launcher, claude]` and is then
  cloned onto a laptop carries an invocation that laptop cannot run. The hierarchy asks for the
  workspace override (the same shape every other agent key has, and the shape the two-workspaces,
  two-machines use case names), and the boundary does not say whether a workspace record may carry
  keys whose validity depends on the machine it stands on.
- **Assumption made to keep moving:** the workspace layer accepts the key like every other agent
  key. The self-sufficiency cost is bounded, not hidden: the record still resumes on any machine
  with the same harness (the handle and transcript are machine-independent), what breaks is one
  preference that doctor names precisely with the remedy, and a relocated workspace already
  re-validates its machine preconditions through doctor.
- **Proposed revision:** a sentence in the boundary paragraph — "A workspace record may carry a
  configuration key that is only **valid on some machines** (how a harness is reached, say) when the
  key is a preference in the sense above: its failure costs a launch, never the understanding or
  resumption of the work, and `doctor` names it on the machine where it does not hold." — and a
  pointer from the human-shell configuration clause noting that a workspace-local key is workspace
  policy, not a promise about every machine the workspace will stand on.
- **Status:** adjudicated — [#76](https://github.com/crumley/ward/pull/76) (owner's ruling: the
  hierarchy already resolves it — set the key in the machine's own global configuration and leave it
  out of the workspace, so each machine carries what works for it).
