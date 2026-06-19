# Roles & Coordination

> **Layer:** intent · concept — design-independent. Names no tool; realizations live in
> `../../design/`. **Status:** placeholder skeleton

## Purpose

Who operates at each scope, how an agent is shaped to its job, and how work, information, and
learning flow between scopes. (Kept together by decision: the cast and the flows are one coherent
concept — "how scopes relate and communicate.")

## Planned sections

- **Two axes + persona** — a session is bound by **scope** (_what_ it is responsible for) and
  **working directory** (_where_ it operates), chosen independently; the **persona** shapes how it
  attends within those bounds (not a third axis).
- **Personas have names** — name + role; internal to the workspace, never leak outward.
- **The role cast** — house supervisor (workspace status/routing), attending (project outcome,
  teacher), charge nurse (project status/routing, teacher), resident (task outcome, teacher), room +
  medical students (worktree, deep work, learners).
- **Why senior roles delegate rather than do** — preserve judgment by delegating detail and
  evaluating what returns.
- **Teaching and learning flow both ways** — the teaching loop; learning feeds reflection.
- **Flow of work and information** — **dispatch** (down), **report** (up), **wake/return**.
- **Multiple personas at one scope** — normal, not exceptional.
- **Forking for side quests** — inherit context, resolve elsewhere (possibly a different
  scope/persona), return a clean result; modes are _exact-clone_ (harness-dependent) or _distilled
  brief_ (harness-neutral baseline).
- **Per-scope configuration** — persona, model/depth, harness, working directory (narrower overrides
  broader).

## Canonical home for

The two axes (scope + working directory); the persona concept and the role cast; the **teaching
loop**; the **dispatch / report / wake** flows (as role communication); **forking**. Other slices
link here: `04-sessions.md` references the axes and the wake-as-lifecycle-op;
`02-subsystems/03-messaging.md` realizes the flows; `02-subsystems/01-harness.md` realizes fork
modes.

## Open questions

- **Persona ↔ scope cardinality** — does exactly one persona "own" a shared scope while others
  assist, or is it flat?
- **Fork mode first** — distilled brief (universal) or exact-clone (where supported), and how
  exact-clone interacts with a session's identity and harness handle.
