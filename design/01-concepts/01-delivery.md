# Design: Delivery (hooks, workflow policy, refresh/rebase)

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/01-concepts/05-delivery.md` — the delivery, privacy-boundary, never-merge-to-main,
lifecycle-hook, and workflow-policy **constraints**; and
`../../intent/00-foundation/01-principles.md` (opinionated-but-evolvable).

## Realization (to fill)

- **Lifecycle hooks** — the exact set of transition points; the hook definition format and where it
  lives in the workspace; how a hook **declares its satisfied-check** (exit code, marker artifact,
  declared probe); ordering when multiple attach; failure surfacing.
- **Workflow policy** — encoded as a **workspace-owned skill** (vs. a config document — open); the
  default policy content; divergence detection (hashes, version stamps, semantic diff); the
  reconciliation UX. _(The reconcile-not-clobber pattern is general — see `02-reflection.md` and the
  principle.)_
- **Refresh/rebase** — the automation and cadence; how rebase conflicts are surfaced.

## Blanks to settle

- See `../blanks-register.md` (transition set; satisfied-check; policy encoding; reconciliation UX;
  refresh/rebase cadence).
