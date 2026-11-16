# 0061 — Intent feedback

## IF-001 — "the floor/room codes humans already hold in their heads" did not hold for floors

- **Slice:** [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md), the
  constraint to group sessions by their work and label them by identity.
- **Friction:** The constraint defines a label's identity as the floor/room codes, on the premise
  that a human already holds those codes in their head. In use the premise failed for floors: a
  window labelled by its codes alone (`f7-1`) was not recognizable, because what the human holds is
  the floor's name, not its number. A room code fared better only because it is rarely read without
  its slug beside it.
- **Assumption made to keep moving:** A label carries the code _and_ the slug it stands for, and
  drops the code where the surrounding host already states it — treating "identity" as whatever a
  human recognizes the work by, of which the code is one part.
- **Proposed revision:** Say that a label names the work as a human recognizes it — its name, with
  its code where the code disambiguates or is what a verb takes — rather than asserting that the
  codes are already held.
- **Status:** pending — ruled by Ryan 2026-11-15, awaiting the intent edit: accepted as proposed — a
  label names the work as a human recognizes it, with its code where the code tells two apart or is
  what a command takes (https://github.com/crumley/ward/pull/139)
