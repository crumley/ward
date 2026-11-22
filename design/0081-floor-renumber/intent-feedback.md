# 0081 — Intent feedback

> Intent frictions found while building `Renumbering a floor`.

This file is the entry's adjudication surface and is read on its own. An adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

The build: `ward project renumber FLOOR N` gives a floor a number the record has never spent, once
in the floor's life. Every record that says the old number is rewritten in one commit, and the old
number is kept in the project record (`previousFloor`), where it counts as spent forever. Addresses
under the old number (`f7t49`, `--floor 7`) name nothing afterwards; there is no alias. A floor
session's id keeps the number it was minted with (`f7-1@dstar` stays the id of a session now on
floor 22), and new floor sessions there are `f22-N`.

## IF-001 — A floor number is retired by a renumber as well as by a close

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_: "A closed project's floor number is retired — retained for history", and the
  floor-`0` paragraph's "Moving an existing standing project onto floor `0` retires the number it
  vacated, like any other closed floor".
- **Friction:** the slice names two ways a number is retired: a floor closing, and the standing
  project moving to floor 0. A renumber is a third. It is the one where the floor itself carries on
  under another number, so every address recorded under the old one (`f7t49` in a brief, a log, a
  commit) now names nothing rather than a closed floor's room. The _why_ of never reusing a number
  holds in full: the old number stays spent, so those addresses never come to name another floor's
  rooms. What the slice does not say is that a live floor may change its number at all, that doing
  so leaves its old addresses dead rather than aliased, and that it may happen only once. 0077's
  [IF-001](../0077-floor-chosen-number/intent-feedback.md) (a chosen number) is pending on the same
  paragraph.
- **Assumption made to keep moving:** a floor may be renumbered once to a number never spent. The
  number it leaves is retired exactly as a closed floor's is, and its old addresses resolve nothing.
- **Proposed revision:** after "A closed project's floor number is retired — retained for history",
  add: "A floor may also be **renumbered**, once, to a number never spent: the number it leaves is
  retired the same way, and every address under it names nothing afterwards — no alias. **Why
  once:** the record keeps one vacated number per floor, and a floor that has been moved to the
  number a convention gives it has no reason to move again. **Why no alias:** an alias is a second
  record of the floor's identity, and it could drift from the first; a closed task is still found by
  its slug." In the floor-`0` paragraph, read "retires the number it vacated, like any other closed
  or renumbered floor".
- **Status:** pending.

## IF-002 — A floor session's id keeps a number its floor no longer holds

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md)
  — the recovery paragraph on bare ids ("session ids are **unique over the workspace's history,
  across the machines that share it**"), and
  [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md), the identity table's Session
  row.
- **Friction:** a floor session's id reads `f7-1@dstar`, with the floor half of a task address, so a
  human reads it as "floor 7". After floor 7 becomes 22, the id still says 7. Rewriting it would
  break the rule the slices do state: an id addresses one session for good, and every place that
  already recorded it (a hand-off's `fromSession`, a child's `parent`, `WARD_AGENT` in a running
  harness, the harness's own history) would lose it. Neither slice says what an id's readable parts
  promise once the thing they describe moves.
- **Assumption made to keep moving:** an id is minted once and never rewritten. Its readable parts
  describe the session when it was opened. The record's `floor` says where it stands now, and new
  floor sessions on the renumbered floor are minted `f22-N`.
- **Proposed revision:** in the Session row of the identity table, after "(a bare id addresses it)",
  add: "; an id is minted once and **never rewritten** — its readable parts say where the session
  was opened, and the record says where it stands now (a floor renumbered after the session opened
  keeps its old number in the id)".
- **Status:** pending.
