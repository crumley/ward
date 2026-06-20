# Subsystem: Remote Work-Item Provider

> **Layer:** intent · subsystem (seam). The contract any design must honor; the *how* is planned in [`../../design/`](../../design/). **Status:** living.

## Responsibility

Be the **remote side of the local↔remote boundary** ([`../01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md)):
the shared system where work items and pull requests live — and the place the **privacy
translation** is enforced at the crossing. Ward is deliberately opinionated here because the
crossing is the one place local context can escape.

## Constraints any design must honor

- **Link a local task to a remote work item, and carry status both ways;** the link is an
  **attribute, not the task's identity**. A local-only task can be **attached** later, and a
  remote-started task **merged** with a duplicate local one — identity stays stable across both.
- **Report PR status** so Ward can drive a task to completion.
- **Receive only already-sanitized content.** The translation from *local view* to *remote view*
  happens **upstream of this seam**, as a deliberate **re-authoring, not a copy**. Direction is
  strictly **outward-guarding** (§4): local paths, private notes, provenance, and **persona names
  and roles** must never appear in a remote artifact. **Every outward path is a crossing** — a
  remote comment *and* an artifact committed into a worktree's files (which reaches the remote on
  merge). Enforced in **one** upstream place so the provider cannot become a leak path. *Why
  single-point:* a boundary enforced in many places leaks at the one place someone forgot;
  swapping the forge must not reopen the hole.
- **Posting outward is a gated action** (§18) — creating/commenting on a remote item and merging
  a PR require the human or explicitly delegated authority, never an autonomous assumption.
  *Why:* these are outward-facing and effectively irreversible. Translation governs *what*
  crosses; the gate governs *whether* it crosses now.
- **Integrated behind a thin, replaceable adapter** — the task model assumes no specific forge.

## What this is NOT

- **Not the place privacy is enforced.** Enforcement is **upstream**; the adapter assumes its
  input is already clean and adds no leak surface of its own.
- **Not a two-way merge of context.** The boundary guards **outward**: remote status flows in,
  local context does not flow out except by deliberate translation.
- **Not a commitment to one forge or its API shape.** The contract — link, status both ways, PR
  state, sanitized input — is what must hold.

## Canonical home for

- The **remote-provider contract**, and the constraint-level strategy it owns: **privacy
  translation is enforced upstream, at a single gate, strictly outward.** (The privacy *principle*
  is [`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §4; this seam owns
  its enforcement at the crossing.)

## Left to implementation

- Which forge and the exact adapter API; how a task records its remote link and reconciles
  attach/merge; **what the translation concretely strips and rewrites, and the single upstream
  place it runs** (the highest-stakes blank — design it first); how PR status is polled or
  received; how gated outward posts request authority. Planned in
  [`../../design/remote-provider.md`](../../design/remote-provider.md).

## Open questions

- None beyond pinning the **translation gate** — tracked as a settle-early item in
  [`../../design/README.md`](../../design/README.md).
