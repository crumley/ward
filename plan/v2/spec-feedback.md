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

### SF-001 — Room occupancy is described as leaf-recorded state _and_ as a derivation from sessions

- **Slice / section:**
  [`01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) → "Status:
  recorded at the leaves, derived above" **and** the "Room" subsection.
- **Kind:** contradictory / ambiguous.
- **Friction:** "Status: recorded at the leaves" lists a room alongside task and session as a unit
  that **records its own state** ("a room is occupied or free") — i.e. a stored leaf field. But the
  Room subsection defines occupancy as a pure function of children: "occupied while one or more
  sessions work in it, and becomes free again when its last session closes." A room both **contains
  sessions** (it hosts them) and is claimed to **record its own** occupancy. Under §17
  (derive-don't-store: a container's status is a query over its children), a value that _is_ a
  function of child sessions should be derived — storing it would make every session open/close
  write the room record, the exact staleness + lost-update hazard §17 exists to remove.
- **Assumption (to keep moving):** v2 treats a room as a **container over its sessions** and
  **derives** occupancy — a room is _occupied_ iff it has ≥1 non-closed session, _free_ otherwise.
  No `occupied` field is stored on the room record; the record is written once at open and the
  room's freed-ness is derived (which also drives room-code reuse). Removed `occupied` from the room
  schema.
- **Proposed revision:** In "Status: recorded at the leaves, derived above", move the room out of
  the "records its own state" list and state explicitly that **room occupancy is derived from its
  sessions** (a room is the innermost _container_, sessions are its leaves); keep the Room
  subsection's wording, which already reads as a derivation. Leave `active|paused|closed` (task) and
  `open|closed` (session, see SF-002) as the genuinely leaf-recorded states.
- **Status:** proposed

### SF-002 — Session "running" is presented as a stored state, but it is a live/derived attribute

- **Slice / section:**
  [`02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md) → "Open
  vs. running" + "The lifecycle guarantees"; [`glossary`](../../intent/00-foundation/glossary.md) →
  "Open vs. running".
- **Kind:** ambiguous / contradictory with §16.
- **Friction:** the lifecycle reads as three peer states open → running → closed, and it is natural
  to store `state ∈ {open, running, closed}` on the session record. But the glossary defines
  _running_ as "an active process attached **on this machine right now**", and §16 says live state
  is a **cache over the record**, never the source of truth. A persisted `running` is therefore
  stale the instant the machine reboots (the record says running; no process is attached) — and
  recovery already filters on "open and **not closed**", never on "running". So _running_ is a
  live/derived overlay, not a durable leaf state — the same shape as `in-review` for tasks (derived,
  not stored).
- **Assumption (to keep moving):** v2 stores `session.state ∈ {open, closed}` only. _Running_ is
  derived from live attachment (the multiplexer, stubbed in v2). `resume` re-attaches the live run
  (idempotent) and does **not** mutate the durable record; `close` is the only transition off
  `open`. Recovery keeps the `open` sessions. This makes "closed stays closed" and "open ≠ running"
  fall out cleanly.
- **Proposed revision:** In sessions-and-lifecycle and the glossary, state that **stored** session
  state is `open | closed`, and **running is a derived live overlay** (a process attached now),
  paralleling `in-review`. Keep "resume turns open into running" but frame _running_ as the live
  attachment resume establishes, not a persisted field.
- **Status:** proposed
