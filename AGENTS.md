# AGENTS.md — working in the Ward repository

You are in the repository where **Ward** is designed and built. This is the harness-neutral
guide for any agent working here; read it first. Ward's full purpose is in
`intent/what/00-vision.md`. **This repo *builds* Ward — it is not itself a Ward workspace.**

## The shape of this repository

- `intent/` — the **design intent**, in two layers: `intent/what/` (concepts, invariants, and
  *why*; never names a tool) and `intent/how/` (durable technology choices and *why*, one
  behind each subsystem seam plus cross-cutting docs). Start at `intent/README.md`.
- `intent/walkthrough.md` — one end-to-end scenario; `intent/blanks-register.md` — every
  deferred decision, tagged; `plan/` — how the implementation is carried out.

## The discipline (every change here honors it)

1. **What vs. how.** A statement belongs in `what/` only if it survives swapping every tool;
   otherwise it is a *how* or an implementation detail (`intent/README.md`).
2. **Why, always.** Every concept and choice carries its reasoning. A statement without its
   *why* is not done.
3. **The triangle.** Intent, tests, and code move together but not always atomically; when one
   diverges, reconcile it in a following step (`intent/README.md`).
4. **Guardrails over recipes.** `how/` docs fix constraints and name where the implementer
   fills in the blanks; they do not script the work.
5. **Two audiences.** Everything serves a human (readable) and an agent (parseable). Keep
   prose and structured fields each doing their job.

## If you are here to…

Follow the reading order in `intent/README.md`: `intent/what/` (00–08 + glossary) →
`intent/how/` → `intent/walkthrough.md`. To build Ward, then read `intent/blanks-register.md`
(settle the 🔴 spine first) and `plan/README.md`, tracing every plan back to the intent it
serves. To change the design, keep *what* and *how* separate and preserve the *why*.

## Conventions

- Markdown, hard-wrapped ~95 columns, matching the surrounding files.
- Cross-reference by relative path; keep links live.
- `how/` docs follow a fixed shape: intro → choices (each with a **Why**) → **Guardrails —
  what this is, and what it is not** → **For the implementation plan**.
- Don't introduce a concept that isn't needed; never name a tool in `what/`.
