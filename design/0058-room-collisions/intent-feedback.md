# 0058 — Intent feedback

> Intent frictions found while building the address for a room two machines both handed out.

This file is the entry's adjudication surface and is read on its own. An adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

## IF-001 — a room's composed address is unique per allocator, and a workspace has one per machine

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_. The relevant passages are "Where global uniqueness genuinely is needed, it can be
  composed (e.g. floor number + room code)" and the closing contrast: "A **room** may reuse its code
  precisely because it is a slot that empties and refills, not a record". It is read against the
  same section's session rule, that "two machines sharing one are two allocators, each reading its
  own view".

- **Friction:** the slice sees that a travelling workspace has one allocator per machine, but draws
  the consequence only for sessions. For rooms it rules out only reuse over time. It never considers
  two machines filling the same slot at the same time, before their records meet. That happens: a
  laptop and an unattended VM sharing one workspace each opened a task on floor 5 while out of sync,
  three times, and after the sync `f5t45`, `f5t46`, and `f5t47` each named two open tasks. The
  composed floor + room address then fails to name either one, and the slice gives no rule for what
  names them instead. Two rules could follow from the slice: put the machine into the room, as
  sessions do, or accept the collision and break it with context. The slice's own principles
  (memorable, sized to cardinality, "time is another ambiguity-breaker") point at the second, but it
  does not say so.

- **Assumption made to keep moving:** rooms stay machine-free, and a collision is tolerated rather
  than prevented. When two open tasks hold one room, each is addressed by its room plus its slug
  (`f5t45-distill-2026-10-18`), which is derived from containment like the rest of the address. Ward
  surfaces the collision, in the ambiguity refusal and in doctor, and never resolves it by picking
  one. The collision clears when all but one holder closes.

- **Proposed revision:** after the room/session contrast in _Identity_, add: "Two machines can still
  fill one slot at once: each hands out the next room from its own view, and when their records
  meet, two open tasks hold the same room. Rooms do not buy uniqueness with the machine, because a
  slot is sized to the work in flight and almost every room has one holder. The collision is broken
  by context instead: the task's slug, already part of its record, qualifies the room for as long as
  the collision lasts. Ward names a collision wherever it speaks the room and never picks between
  the holders." Optionally, in the same slice, replace "(e.g. floor number + room code)" with "(e.g.
  floor number + room code, and the slug where two holders meet)".

- **Status:** pending
