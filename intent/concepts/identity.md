# Identity

> **Layer:** intent · concept — design-independent. Names no tool; realizations live in
> `../../design/`. **Status:** placeholder skeleton

## Purpose

How addressable things are named so a human or agent can refer to them unambiguously _enough_ —
memorable over globally unique.

## Planned sections

- **Two parts** — a human-readable slug + a short code.
- **Not always globally unique, and need not be** — the goal is "hold it in your head, say it, type
  it," with an agent inferring from context.
- **Lean on memorable conventions, not entropy** — the hospital metaphor: a project is a **floor**
  (code = floor letter `A`, `B`…); its **rooms are numbered on the floor** (`A1`, `A2`…).
- **Size codes to real cardinality** — only as many digits/prefixes as in-flight reality needs.
- **Identity need not mirror containment** — a room is addressed by floor + number; its task and
  worktree are discoverable attributes, not part of its address.
- **What gets an identity** — the table (project, task, room, session, worktree, workspace,
  artifact), noting scope-relative where it suffices.

## Canonical home for

The slug+code model, the floor/room naming convention, and the "addressing ≠ containment" rule.

## Open questions

- **Task codes** — what convention gives tasks their codes; scope-relative to the project?
- **Floor-letter uniqueness** — unique within a workspace? what past 26 in-flight projects?
- **After close** — is a floor letter / room number reused, retired, or retained for history?
