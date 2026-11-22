# 0088 — Intent feedback

> Intent frictions found while letting every floor argument take the floor's slug as well as its
> number.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

What was built, in one paragraph: wherever a verb takes a floor (`--project`, `--floor`, `--to`,
`--from`, and the FLOOR argument of the `project` and `reflection` verbs), the caller may give the
floor's number or its exact slug. A value that is all digits is a number; anything else is matched
against every floor's slug, and refused when no floor or more than one wears it. A renamed floor's
old slug resolves to nothing. Every report still carries floor numbers.

## IF-001 — a floor is addressed by its number, and named by its slug

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md),
  _Identity_ ("a **project is a floor**, addressed by a **floor number**") and the identity table
  ("the **code is a floor number**").
- **Friction:** the slice says a floor is addressed by its number, which reads as the only way to
  name one. Callers that name a floor durably (skills, scripts) need the name that survives a
  renumbering, and identity elsewhere in the same slice is slug + code.
- **Assumption made to keep moving:** the number stays the floor's address in every record and
  report; a verb argument may also take the floor's exact slug, with all-digit input always read as
  a number.
- **Proposed revision:** after "addressed by a **floor number**", add: "— and, wherever a command
  takes a floor, by its slug as well, resolved exactly against the floors the record holds; a number
  is what the record and its reports carry."
- **Status:** pending
