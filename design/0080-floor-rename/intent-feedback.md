# 0080 — Intent feedback

> Intent frictions found while building `Renaming a floor`.

## IF-001 — A project's slug is a name it can change, not half of its identity

- **Slice:** [`domain-model`](../../intent/01-concepts/00-domain-model.md), Identity:
  human-memorable, scope-relative when that is enough.
- **Friction:** the slice gives everything addressable an identity in two parts, a human-readable
  slug and a short code, and it says nothing about either part changing. For a floor, the code is
  the floor number. Every address composes from it (`f<floor>t<room>`), floor sessions and hand-offs
  record it, and numbers are never reused. The slug is used by no address. `ward project rename`
  changes the slug and leaves every address as it was, which the slice, read literally, treats as
  changing half of the floor's identity.
- **Assumption made to keep moving:** a floor's identity is its number. Its slug is a name it
  carries, used in its record directory, its view and its host's name, and that name may change.
  Nothing records the old slug and nothing resolves it after a rename.
- **Proposed revision:** add to the Identity section, after the hospital-metaphor bullet: "**A
  floor's number is its identity; its slug is its name.** The slug conveys what the floor is about
  and may change as the floor's work does (a rename). The number may not: every room's address
  composes with it, so it is never reused and a rename leaves every address as it was. **Why:** a
  floor outlives the work it opened for, and a name that can no longer change ends up misdescribing
  it wherever it shows."
- **Status:** pending.
