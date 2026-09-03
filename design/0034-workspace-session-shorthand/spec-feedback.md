# 0034 — Spec-feedback

> Intent frictions found while building the workspace session shorthand.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — the purpose minimum assumes every session is opened _for_ a goal

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  "Recording per scope" — the minimum's **purpose**: "a link to the brief or dispatch that opened
  it, or a one-line goal when neither exists."
- **Friction:** the three sources the slice names — a brief, a dispatch, a goal — all presuppose
  that a session is opened to _do_ something particular. The session a human opens to stand in a
  workspace and start firing work off is opened to **receive** goals: the tasks it opens and the
  sub-agents it dispatches carry the purposes, and its own is only "be the interactive session of
  this workspace". Read literally, the minimum makes the human invent a goal for it
  (`--purpose
  "start work"`), which fills the field without recording a fact — and a build that
  defaults the purpose, as this entry does, looks like it is skipping the minimum rather than
  meeting it.
- **Assumption made to keep moving:** a phrase naming the **kind** of session and the instant it was
  opened (`Coordinating work · opened <time>`) is a legitimate "one-line goal" for a session whose
  goal is to receive work; the record still always carries a purpose, and a human who has a real one
  supplies it. Task-scope sessions keep requiring one, since several episodes can run against one
  task and the purpose is what distinguishes them on the log.
- **Proposed revision:** in the minimum, say that purpose is "a link to the brief or dispatch that
  opened it, a one-line goal, **or — for a session opened to receive work rather than to perform a
  named piece of it — the kind of session it is**", and note the consequence: the purpose of such a
  session's work is read from the threads it opened, not from its own entry. That lets an
  interactive standing session be complete against the minimum without an invented goal, and keeps
  the field load-bearing where a goal genuinely exists.
- **Status:** pending. The owner's review (2026-09-03) affirmed both halves of the assumption — the
  workspace-scope default states the kind of session, and task scope keeps requiring a purpose — and
  set the default's wording; the intent edit that would settle the slice is not yet made.
