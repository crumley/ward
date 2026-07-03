# v2 — Spec Feedback

> Where **building revealed an intent problem** ([`../README.md`](../README.md)): ambiguous,
> under/over-specified, contradictory, hard to implement, or not serving its purpose. `intent/`
> governs — the build does **not** silently rewrite it. Each entry gets a **stable id** (`SF-001`,
> …), names the slice + section, states the **assumption** made to keep moving, and proposes a
> **concrete revision** for human review. (Exception the build _may_ take without an SF: append to a
> slice's own _Open questions_, or note it _resolved_ one — logged in `log.md`.)

## Status legend

`open` — recorded, building proceeds on the assumption · `proposed` — a concrete revision is drafted
· `resolved-in-build` — the build answered it (candidate to promote into the slice on the human's
pass).

## Entries

_None yet. The first entry lands when the build hits an intent friction it cannot resolve by a
local, faithful reading. Template below._

<!--
### SF-001 — <short title>

- **Slice / section:** `intent/…` → "<section heading>"
- **Kind:** ambiguous | under-specified | over-specified | contradictory | hard-to-implement |
  not-serving-purpose
- **Friction:** what building surfaced, concretely.
- **Assumption (to keep moving):** what v2 does in the meantime.
- **Proposed revision:** the specific change to the slice.
- **Status:** open
-->
