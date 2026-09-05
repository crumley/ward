# 0036 — Spec-feedback

> Intent frictions found while building the floor-addressed task, the room sequence, and the
> settled-work window.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — the task's identity rule reads as "bare code only", and reuse-on-close is what broke

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md),
  _Identity_ — the paragraph beginning "A **task follows the same rule, for the same reason**", the
  identity table's Task row ("unique among open tasks workspace-wide (a bare code addresses it)"),
  and the summary bullet under _Canonical home for_ ("bare workspace-unique codes for open sessions
  **and open tasks**"). Echoed in
  [`intent/00-foundation/open-questions.md`](../../intent/00-foundation/open-questions.md)
  ("Identity edges closed"), the glossary's _Identity (slug + code)_ row, and
  [`intent/04-walkthrough-delivering-work.md`](../../intent/04-walkthrough-delivering-work.md)
  ("unique among the workspace's open tasks"; "bare workspace-unique task codes").

- **Friction, in two parts.**

  1. **The rule as written cannot hold, and the record shows where it broke.** "Unique among the
     open tasks in the workspace" is a constraint on allocation, and allocation honours it — but
     nothing in the slice says the code is _re-usable the instant a task closes_, and that is how
     every implementation of "unique among open tasks" naturally reads. In this repository's own
     workspace it produced a code that changed hands seconds after a close: a sweep aimed at a
     delivered `t18` closed a freshly opened `t18` created moments earlier. The slice already knows
     the failure mode — it says elsewhere that _time is another ambiguity-breaker_ ("the resident in
     `4A12` on Tuesday") — but that ambiguity-breaker only works if a code stays put long enough for
     time to separate two holders. Reuse-on-close removes exactly that margin, so the identity
     becomes untrustworthy on the record (§11, §16) at the one moment the record is being read most:
     right after a close.
  2. **The rule forbids the composition the neighbouring noun is given.** The slice grants rooms a
     composed address (`4A12`) for a stated reason — high in-flight cardinality, per-floor sequences
     keeping the code tiny — and denies tasks the same on the argument that a task is _operated on_
     constantly, so "threading a `(floor, task)` pair through every call is the same model smell the
     session rule closed". That argument is about the **call surface**, not about the **address**:
     it is satisfied entirely by the bare form remaining accepted. Read as it stands, though, it
     forecloses composition altogether, and so leaves the workspace with `t1` naming five live tasks
     across five floors with no spelling that distinguishes them.

- **Assumption made to keep moving:** that the intent's real requirement is (a) a task must have a
  spelling that is unambiguous among open tasks, and (b) the spelling a human usually types must be
  short — and that a **composed address with the bare room as a shorthand** satisfies both, exactly
  as the room's `4A12` does. So this entry addresses a task on a floor as `f<floor>t<room>`, keeps
  `t<room>` as a shorthand accepted while it is unique among open tasks (and refused, naming its
  candidates, when it is not), and allocates rooms in **opening order round the floor** so a room
  comes back only after the container has spent every other one. Nothing is stored: the record keeps
  carrying the room as `code`, and the address is derived from it and containment.

- **Proposed revision:** in _Identity_, replace the task paragraph so that a task's address
  **composes floor + room** exactly as a room's does, state that the **bare room number is a
  shorthand accepted while it is unique among open tasks**, and say that **rooms on a floor run as a
  sequence in opening order, sized to two digits, coming round only after the floor's rooms are
  used** — naming reuse-on-close as the failure that motivated it (an address that changes hands
  seconds after a close is an address the record cannot trust). Update the identity table's Task row
  and the _What gets an identity_ / _Canonical home for_ wording to match, and carry the same
  correction into the open-questions "Identity edges closed" bullet, the glossary's identity row,
  and the delivering-work walkthrough's two "workspace-unique" phrases.

- **Status:** pending.

## SF-002 — the attention surface has no rule for forgetting, and none for which spelling to speak

- **Slice:**
  [`intent/02-subsystems/07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md) — the
  _"What needs me?" is a first-class query_ constraint ("one glanceable, deduplicated answer"), and
  the _Supply nouns by recognition, never by recall_ constraint.

- **Friction:** both constraints are stated over what the surface must **contain** and never over
  what it must **leave out** or **which of several valid spellings it should use**. Two consequences
  showed up as soon as this entry touched the surface.

  1. **Nothing bounds the listing.** "One glanceable answer" is a quality the surface must have, but
     the slice gives no ground on which a design may drop anything — so a listing that grows without
     bound is not, on the words as written, out of contract. In practice it stops being glanceable
     long before it stops being complete: this repository's own workspace prints seventy task lines,
     sixty-eight of them closed. A design that filters is doing the right thing and cannot point at
     a sentence that says so; a design that does not filter is equally defensible.
  2. **Nothing says which spelling Ward speaks.** Once a noun has both a full address and an
     accepted shorthand, "supply nouns by recognition" governs what the human may _type_ but not
     what Ward should _print_. Printing the shorthand back is the friendlier-looking choice and is
     wrong: a shorthand that is unique today is ambiguous the moment a second floor opens the same
     room, and a human who copied it out of a status line has copied something that will stop
     working.

- **Assumption made to keep moving:** that the glanceable-answer constraint implies a bounded
  surface, and that the bound may be **time since the work settled**, provided the surface **says
  what it hid and how to see it** and the record itself is untouched. So `ward status`,
  `ward task list`, and `ward project list` omit work closed more than seven days ago, print a
  footer naming the counts and `--all`, and carry a `hidden` summary in `--json` so a machine reader
  can never mistake a windowed listing for a complete one. And that Ward should **prefer the full
  address** whenever it names a task to a human, accepting the shorthand on input — so what a human
  copies off a line always keeps working.

- **Proposed revision:** add one clause to the attention-surface constraint — **settled work leaves
  the glanceable surface** after a stated window and stays retrievable on request, with the surface
  saying what it left out — and one clause under noun resolution: Ward **prefers the full address**
  when it speaks to a human, and **accepts a shorthand while it is unique**, refusing with the
  candidates named when it is not.

- **Status:** pending.
