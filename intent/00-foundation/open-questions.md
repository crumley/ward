# Open Questions — cross-cutting

> **Layer:** intent · foundation (global). A reference index — read out of order. **Status:**
> living.

Only the **genuinely cross-cutting** tensions live here — the ones that span slices. Each slice
carries its _own_ open questions inline (in its **Open questions** section); this file indexes those
so nothing is lost. It is _expected_ to be non-empty. As we build, answers get promoted into the
relevant slice (and reflected in tests and code).

## Cross-cutting tensions

- **Append vs. rewrite, against evolving context.** Principle §12 wants an append-only,
  deterministically ordered prefix so sessions share token caches; reflection and the teaching loop
  want context to _evolve_. Where evolving, rewritable context lives relative to the stable
  cacheable prefix is unresolved. Touches
  [`../01-concepts/05-context-loading.md`](../01-concepts/05-context-loading.md),
  [`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md),
  and [`../02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md).
- **What/why-vs-how boundary drift.** As [`../../design/`](../../design/) fills in, watch both
  directions: tool names creeping into `intent/`, and durable constraints stranded in `design/` that
  should be lifted up. Revisit at every scope boundary.
- **Intent-file granularity.** Is the current concept/subsystem split right, or will some slices
  want to split or merge as they grow?
- **Cross-chunk reflection learnings.** In the chunk → distill → roll-up flow, how are insights that
  emerge only in aggregate preserved? (Owned by
  [`../01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md);
  listed here because it recurs.)

## Index of per-slice open questions

- [`01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md) — when each level exists;
  artifact taxonomy; provenance depth; cross-task mutation; identity edges (task codes; floor-number
  uniqueness; whether a closed _floor_ number is reused — _session ids and room codes now settled_);
  the **dispatch-routing mechanism** (both paths now settled; the resolution mechanism is owned by
  the messaging seam).
- [`01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md) —
  persona↔scope cardinality; which fork mode ships first.
- [`01-concepts/02-sessions-and-lifecycle.md`](../01-concepts/02-sessions-and-lifecycle.md) —
  "enough metadata" to resume; wake across a reboot.
- [`01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md) — delegated authority
  for gated actions; hook validation; refresh/rebase cadence; policy-encoding home (_task states now
  settled_).
- [`01-concepts/04-reflection-and-evolution.md`](../01-concepts/04-reflection-and-evolution.md) —
  reflection-type taxonomy; cadence/boundary triggers; cross-chunk learnings; migration safety.
- [`01-concepts/05-context-loading.md`](../01-concepts/05-context-loading.md) — the
  append-vs-rewrite line (cross-cutting, above).
- [`02-subsystems/00-metadata-store.md`](../02-subsystems/00-metadata-store.md) — artifact taxonomy;
  the concurrency primitive.
- [`02-subsystems/01-session-multiplexer.md`](../02-subsystems/01-session-multiplexer.md) and
  [`02-subsystems/02-messaging-coordination.md`](../02-subsystems/02-messaging-coordination.md) —
  the messaging-vs-multiplexer split; wake re-arm on recovery; the dispatch-routing **mechanism**
  (the path — direct vs. via status persona — is settled; the resolution mechanism is open).
- [`02-subsystems/03-agent-harness.md`](../02-subsystems/03-agent-harness.md) — fork mode first.
- [`02-subsystems/07-human-shell.md`](../02-subsystems/07-human-shell.md) — caller-identity
  enforcement; whether the telemetry analysis loop is a reflection type.

## Recently resolved (kept briefly for context)

- **"Mission" is not a containment level** — if it returns, it is an _attribute of a project_.
- **Identity need not be globally unique** — prefer memorable codes sized to real cardinality, with
  time and context as further ambiguity-breakers; a project's code is a **floor number**, a room's
  is **floor number + room code** (`4A12`).
- **Workspace-wide coordinator** — a **house supervisor** persona holds workspace status; the human
  owns workspace direction; the charge nurse is per-project.
- **A session has one identity** — the harness's native run id is a recorded **handle**, not a
  second identity.
- **Dispatch routing has two paths** — **direct** identity-addressing when the sender knows the
  target, and **routing through the originating scope's status persona** (charge nurse / supervisor)
  when it does not, because a session knows its neighbors but not the whole workspace. Only the
  resolution _mechanism_ remains open (owned by the messaging seam).
- **Task states are settled** — stored `active | paused | closed`; `in-review` is **derived** from
  the open-PR set; `blocked` and `drafted` dropped (status is an attention-router, not a tracker).
  Container rollup: empty → active, mixed → active wins, precedence `active ▸ paused ▸ closed`.
- **Session ids are workspace-unique among open sessions** — a **bare id** addresses a session
  everywhere, so no operation threads a `(scope, id)` pair.
- **A room is a reusable resource** — opening a room **mints its first session**; when its last
  session closes the room is **freed** and its code reusable. `closed stays closed` is a _session_
  guarantee, not a room one.
- **Roles are a fixed vocabulary; personas evolve** — many personas may share one role; the closed
  role set is what makes outward role-redaction **exhaustive** (§4).
