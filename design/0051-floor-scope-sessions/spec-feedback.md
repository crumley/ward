# 0051 — Spec-feedback

> Intent frictions found while building floor-scope sessions.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — whether a project-scope session may do a task's work itself is unstated

- **Slice:**
  [`intent/01-concepts/01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md)
  — _Attending physician_ ("Delegates and evaluates; does not do the hands-on work") and _Why senior
  roles delegate rather than do_; read against
  [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Levels
  are elided, not faked_ ("A single agent doing both is an elided session acting directly").

- **Friction:** this entry makes a project-scope session recordable: one session responsible for a
  floor's outcome. A session like that, holding a floor, decides task by task what to do with the
  work: open a task and a separate session for it, hand it to a harness subagent inside its own run,
  or, when the work is small, just do it. The scopes slice says the project-scope role never does
  the hands-on work. The domain model's elision rule says the opposite one level down: a session
  that both directs and does is an **elided** level, legitimate when the level does not earn its
  keep. Read together, the two slices cannot say whether a floor session that fixes a one-line
  config itself has broken the role or correctly elided a task session. Delegation exists to protect
  the senior context (§2, the 80%-context failure mode). A five-minute change that costs more to
  brief than to do protects nothing, and the slice gives no test for when delegating earns its keep.

- **Assumption made to keep moving:** the build records scope and nothing about behavior. A floor
  session is a floor session whatever it chooses to do, and no persona or rule is enforced (personas
  are not built). The installed manifest describes a floor session by what it is responsible for,
  never by whether it may do work itself.

- **Proposed revision:** in `01-scopes-and-personas.md`, _Why senior roles delegate rather than do_,
  state that delegation is the **default** and that elision applies to sessions the way it applies
  to levels. A senior scope may act directly on work whose briefing would cost more context than
  doing it, and the test is the same one the domain model applies to rooms: separate directing from
  doing when the separation earns its keep. Soften _Attending physician_'s "does not do the hands-on
  work" to link that rule rather than state an absolute. Delegation is how senior context is kept
  free, and a cheap act done directly spends less of it than a brief would.

- **Status:** pending.
