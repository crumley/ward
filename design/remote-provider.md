# Design: Remote Work-Item Provider & the Privacy Gate

> **Serves intent:** [remote-provider seam](../intent/02-subsystems/06-remote-provider.md);
> [§4](../intent/00-foundation/01-principles.md) (local↔remote boundary);
> [§18](../intent/00-foundation/01-principles.md) (gated outward actions);
> [work-lifecycle](../intent/01-concepts/03-work-lifecycle.md) (PR set → merge → close).

## The privacy gate is the load-bearing piece (`src/seams/privacy.ts`)

The seam's highest-stakes requirement: privacy translation enforced **upstream, at a single gate,
strictly outward, fail-closed**. `translate(content, ctx)`:

1. drops front matter (internal machinery),
2. redacts local paths (workspace root, home, and `/{Users,home,private,tmp,var/folders}/…`),
3. neutralizes **persona names** and **role words** ("Riley", "the resident" → "the team"),
4. strips theme **glyphs**,
5. then runs an **independent verifier** (`assertClean`) and **throws** if any forbidden token
   survives — so the gate can never emit leaking content (fail-closed).

`assertClean` is exported so the (downstream, stub) forge adapter can re-assert at its boundary and
so tests prove the fail-closed behavior. Over-stripping is acceptable; the boundary guards
**outward** only (status flows in freely).

## Remote orchestration (`src/domain/remote.ts`)

- **attachRemote** — records `task.remote = {provider, id, url, state}` (an attribute, not
  identity). Local bookkeeping; not gated (nothing crosses).
- **openPr** — **GATED** (`authorized` required, §18). Routes the body through the privacy gate (the
  single outward crossing), writes the sanitized body as a `pr-body` **artifact**, sets the task
  `in-review` and the remote `open`. Without authority it refuses before any translation.
- **reviewPr** — records **incoming** forge status (`open|changes-requested|approved|merged`). Not
  gated — status flows in.
- **mergePr** — **GATED** and only when `approved` (never-merge-to-main, §18). Sets remote `merged`.

The "forge" is a **stub** in v1: PR state lives on `task.remote`; the sanitized body is a local
artifact. A real forge adapter (GitHub, etc.) swaps in at the `openPr`/`mergePr` boundary and, per
the seam, **receives already-sanitized input** — it adds no leak surface because enforcement is
upstream in the gate.

## Authority (the gate vs. the lock)

Translation governs **what** crosses; the gate (`--authorize`, representing explicit human
authority) governs **whether** it crosses now. v1 models authority as a CLI flag standing in for the
human's grant; **delegated** authority (a scope the human empowered) is the deferred representation
([work-lifecycle open question](../intent/01-concepts/03-work-lifecycle.md)).

## Open / deferred

- The real forge + its adapter API; how PR/CI status is polled or received.
- `in-review` as a **derived** state ("has ≥1 open PR") rather than stored — see
  [SF-001](../build/spec-feedback.md).
- The role-word substitution is intentionally blunt (can leave awkward grammar like "the the team");
  a real re-authoring is a compose step a human/agent reviews before posting — v1 proves the strip.
