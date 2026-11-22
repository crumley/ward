# 0089 — Intent feedback

> Intent frictions found while building the floor's attending.

## IF-001 — A session named after the persona whose scope it holds, where persona names must not leak

- **Slice:** [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md), the role
  vocabulary and the rule that a persona's name and role are internal and never reach a commit, a
  PR, or an issue; the [glossary](../../intent/00-foundation/glossary.md) rows **Persona** and
  **Attending physician**.
- **Friction:** this entry calls a floor's one general session its **attending**: the word is
  printed by `ward status` and `ward session show`, carried as `attending` in their JSON, used in
  refusals, doctor findings, and the workspace `AGENTS.md`, and so it reaches the commits and pull
  requests that describe Ward's own work. Intent keeps a persona's name and role internal so that no
  output says "the attending did this". Read literally, the rule forbids the word this design rests
  on. Read as intended, it is about something else: an agent's configured persona, its name and its
  instructions, leaking into what that agent writes. Intent does not say which reading holds, nor
  whether the attending must do the charge nurse's status-and-dispatch work through a separate
  session.
- **Assumption made to keep moving:** the leak rule governs an agent's configured persona (its name,
  its instructions, attributions of work to it), and "attending" as the word for a floor's standing
  session is Ward's own vocabulary for a place in the workspace, like "coordinator" or "floor host".
  Nothing here attributes work to a persona or configures one. The attending may take the charge
  nurse's duties itself.
- **Proposed revision:** in _Scopes and personas_, scope the leak rule: "The rule is about an
  agent's configured persona — its name, its role as an attribution, its instructions — never
  appearing in what the agent writes ('the attending asked me to do this'). Ward's own words for
  places in a workspace are not personas: a floor's **attending** is its standing general session
  (the first window of its host; the coordinator is the ground floor's attending), and Ward names it
  in its own output." Under _Attending physician_ add: "The attending may track status across the
  floor's work and dispatch it itself, or hand that to a charge nurse; whether a floor runs a charge
  nurse is a cost choice, not a requirement." Add a glossary row **Attending (session)** pointing at
  the same slice.
- **Status:** pending.
