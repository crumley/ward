# AGENTS.md — working in the Ward repository

You are working in the repository where **Ward** is designed and built. This is the
harness-neutral guide for any agent operating here. Read it first.

Ward is a tool for operating structured human+agent workspaces; its full purpose is in
`intent/what/00-vision.md`. **This repo is about *building* Ward — it is not itself a Ward
workspace.**

## The shape of this repository

- `intent/` — the **design intent**, in two symmetric layers:
  - `intent/what/` — concepts, invariants, the domain model, and *why* (never names a tool).
  - `intent/how/` — durable design/technology choices, and *why* (one behind each subsystem seam,
    plus cross-cutting docs: context loading, lifecycle hooks, reflection).
  - `intent/what/07-subsystem-seams.md` is the hinge between the layers;
    `intent/what/08-open-questions.md` tracks what is unsettled; `intent/what/glossary.md` is the
    vocabulary.
- `intent/walkthrough.md` — one end-to-end scenario, naming the records written at each step.
- `intent/blanks-register.md` — every deferred decision, tagged settle-early vs. during-build.
- `plan/` — **how the implementation is carried out** (`plan/README.md`).

## The discipline (applies to every change here)

1. **What vs. how.** A statement belongs in `what/` only if it would survive swapping every tool.
   If it would change because we replaced the multiplexer, store, harness, or model, it is a
   *how*. Exact libraries, paths, fields, and flags belong in the plan and the code.
2. **Why, always.** Every concept and every choice carries its reasoning. A statement without its
   *why* is not done.
3. **The triangle.** Intent, tests, and code move together but not always atomically. When any one
   changes in a way that conflicts with another, resolve the conflict in a following step —
   divergence means we learned something (`intent/README.md`).
4. **Guardrails over recipes.** `how/` docs fix constraints and name where the implementer fills
   in the blanks; they do not script the work. Honor the guardrail; design within it.
5. **Two audiences.** Everything serves a human (readable) and an agent (parseable). Keep prose
   and structured fields each doing their job.

## If you are here to…

- **Understand Ward** → read `intent/what/` (00–08 + glossary), then `intent/how/`, then
  `intent/walkthrough.md`.
- **Implement Ward** → read the intent, then `intent/blanks-register.md` (settle the 🔴 spine
  first), then `plan/README.md`, and follow it. Trace every plan back to the intent it serves.
- **Change the design** → keep *what* and *how* separate; update `glossary.md` and
  `08-open-questions.md` alongside; preserve the *why*.

## Conventions

- Markdown with hard-wrapped prose (~95 columns), matching the surrounding files.
- Cross-reference by relative path; keep links live.
- `how/` docs follow a fixed shape: intro → choices (each with a **Why**) → **Guardrails — what
  this is, and what it is not** → **For the implementation plan — where to fill in the blanks**.
- Don't introduce a concept that isn't needed; never name a tool in `what/`.
