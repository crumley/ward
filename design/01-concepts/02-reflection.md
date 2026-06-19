# Design: Reflection (chunking, cursor, triggers)

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/01-concepts/06-reflection.md` — the goal-directed / map-reduce / cursor /
async-proposal **constraints**, and the version-stamp / update-vs-migrate / reconciliation rules.

## Realization (to fill)

- **Reflection routines** — the default set of reflection goals and how a new one is added (encoded
  as workspace-owned, evolvable routines — the opinionated-but-evolvable pattern).
- **Map-reduce** — chunk boundary heuristics; the distillation prompt/shape; the roll-up procedure;
  how cross-chunk themes are preserved.
- **Cursor** — the concrete per-(scope, goal) form (timestamp, commit, artifact id).
- **Triggers** — cadence and scope-boundary triggers (time-, event-, or human-based).
- **Proposals** — how proposals are recorded and surfaced for adoption.

## Blanks to settle

- See `../blanks-register.md` (default goals; chunk heuristics; cursor form; triggers).
