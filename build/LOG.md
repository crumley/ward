# Build Log

Append-only journal of the Ward build. Newest entries go at the **bottom**. Each iteration adds one
entry; never rewrite past entries (correct them with a later one). This is the build's cold-start
memory: a new session re-orients by reading [`v1-scope.md`](v1-scope.md), the tail of this file, and
the open items in [`spec-feedback.md`](spec-feedback.md).

**Entry format**

- **Goal** — what this iteration set out to do.
- **Did** — what actually happened.
- **Works now** — what is demonstrably working, each with the **exact command** that proves it (and
  its observed result). No "works" claim without a command.
- **Decisions** — links to any ADRs added/changed in [`decisions/`](decisions/).
- **Spec feedback** — links to any entries added in [`spec-feedback.md`](spec-feedback.md).
- **Next** — the next bounded chunk.

---

## Iteration 0 — scaffolding (2026-06-22)

- **Goal** — stand up the `build/` journal so the first real iteration starts oriented.
- **Did** — created [`build/README.md`](README.md), this log, [`v1-scope.md`](v1-scope.md) (a
  template to fill), [`spec-feedback.md`](spec-feedback.md) (a template), and
  [`decisions/0000-template.md`](decisions/0000-template.md). Added a pointer to `build/` from the
  root `AGENTS.md`. No Ward code yet; no stack chosen yet.
- **Works now** — nothing executable yet (scaffolding only).
- **Decisions** — none yet. The first real iteration's first act is choosing the stack and writing
  its ADRs in [`decisions/`](decisions/).
- **Spec feedback** — none yet.
- **Next** — read the intent in full (start at [`../AGENTS.md`](../AGENTS.md) →
  [`../intent/README.md`](../intent/README.md)), then write [`v1-scope.md`](v1-scope.md), then
  choose the toolchain and record the stack ADRs before writing significant code.
