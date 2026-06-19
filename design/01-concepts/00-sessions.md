# Design: Sessions (context loading & recovery)

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/01-concepts/04-sessions.md` — the session, context-loading, and recovery
**constraints** (harness-neutral, working-dir-keyed, deterministic/append; resume idempotent; closed
stays closed).

## Realization (to fill)

- **Context loading** — the `AGENTS.md` hierarchy keyed to the working directory; each `AGENTS.md`
  as the manifest for its level; the **exact deterministic ordering algorithm** for the cacheable
  prefix and where the mutable tail begins; how skills are referenced/resolved.
- **Harness handle** — the per-harness handle format and where each harness stores history (the
  resolvable-back-to-the-run mechanism). _(Shared with `02-subsystems/01-harness.md`.)_
- **Recovery** — the concrete orchestration of enumerate → filter → re-attach → re-arm → validate →
  leave-closed, and the "enough metadata to resume" set validated against a real reboot.

## Blanks to settle

- See `../blanks-register.md` (ordering algorithm; mutable-tail boundary; handle formats).
