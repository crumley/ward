# 0067 — Intent feedback

> Intent frictions found while building floor dispatch: handing a task to another floor.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

What was built, in one paragraph: `ward task dispatch SLUG --to FLOOR --brief FILE` opens a task on
the floor named, records its brief, and writes a hand-off record beside them (`dispatch.md`: the
task, the floor it went to, the sender's session and floor, when) in one journal commit. Where a
hand-off stands is derived, never stored: `pending` until a session is opened on the task,
`picked-up` from then, `closed` with the task's outcome. `ward task dispatches`, `ward status` and
`ward task show` show it. After the commit, Ward types a one-line notice naming the task into the
window of each open session responsible for the target floor, when that session's run is live in a
detached host on this machine; it reads the screen first, types, reads the line back, and presses
Enter only when the run's input line holds exactly that line. A floor with no running session is not
started. There are no wakes, no reports, and no routing by a status persona.

## IF-001 — dispatch is defined as downward; a hand-off between two floors is sideways

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md),
  _Messaging, dispatch, and waking_ ("a scope hands a unit of work (or context) _downward_ to
  something within it"), and
  [`intent/01-concepts/01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md),
  _Flow of work and information_.
- **Friction:** both slices define dispatch as a containing scope handing work to something inside
  it. The first hand-off a multi-floor workspace needs is between siblings: a session on one floor
  finds work that belongs on another. Read strictly, the slices send that through the workspace
  scope (report up, dispatch down), and the direct path in _How dispatch routes_ — "direct when the
  sender knows the target" — does not say whether the target may be a sibling.
- **Assumption made to keep moving:** a sender that knows the target floor dispatches to it
  directly, whether it stands above that floor (a workspace-scope session) or beside it (another
  floor's session, or a session of a task on another floor). The record says which, by carrying the
  sender's floor when it has one. A sender is refused only its own floor.
- **Proposed revision:** in _Messaging, dispatch, and waking_, say that dispatch is to an
  addressable target the sender knows — within it or beside it — and keep "downward" as the common
  case rather than the definition; or say the opposite, that sideways work must pass through the
  containing scope's status persona, in which case this verb is what that persona runs.
- **Status:** pending

## IF-002 — the seam's list of target identities has no floor in it

- **Slice:**
  [`intent/02-subsystems/02-messaging-coordination.md`](../../intent/02-subsystems/02-messaging-coordination.md),
  _Constraints any design must honor_ ("Deliver a message or dispatched unit of work to a target
  identity (a room, a task, a session)").
- **Friction:** the list names a room, a task and a session. A unit of work handed to a floor is
  addressed to a project: no task exists for it until the dispatch creates one, and no particular
  session is meant — whichever session is responsible for the floor, now or next, is the reader.
- **Assumption made to keep moving:** a floor is a target identity. Delivering to it means the work
  exists as a task on that floor with its brief, and the floor's own sessions (project scope, that
  floor) are who is told.
- **Proposed revision:** add the project to the identities a dispatch may address, and say what
  delivery to a container is: the work becomes a child of it, read by whoever is responsible for the
  container.
- **Status:** pending

## IF-003 — "delivered or still pending" does not say what delivered means for a target that is not running

- **Slice:**
  [`intent/02-subsystems/02-messaging-coordination.md`](../../intent/02-subsystems/02-messaging-coordination.md),
  _Observable and inspectable_ ("who sent what, to whom, when, and whether it was delivered or is
  still pending") and _Recorded-first_ ("a not-running target is served entirely from the record").
- **Friction:** three different moments could be called delivery: the record was written; a line was
  typed into a running session's window; the target acted on it. The first is true of every send, so
  it distinguishes nothing. The second is the live optimization the seam says is not the delivery,
  and it is unavailable to a target that is not running. Only the third answers the sender's
  question, and the seam does not name it.
- **Assumption made to keep moving:** a hand-off is `pending` until a session has been opened on its
  task and `picked-up` from then — derived from the session records, with no acknowledge verb and
  nothing stored. Whether a notice was typed is reported to the sender when it sends and is not part
  of where the hand-off stands.
- **Proposed revision:** in _Observable and inspectable_, replace "delivered" with the state the
  sender needs — that the target has taken the work up — and say it is derived from what the target
  recorded in doing so (§16, status at the leaves), never from the live delivery having been
  attempted.
- **Status:** pending

## IF-004 — nothing says what live delivery may do to a session someone else is using

- **Slice:**
  [`intent/02-subsystems/02-messaging-coordination.md`](../../intent/02-subsystems/02-messaging-coordination.md),
  _Recorded-first_ ("Live multiplexer delivery is an optimization for the running case") and _Open
  questions_ (multiplexer-vs-store split);
  [`intent/02-subsystems/01-session-multiplexer.md`](../../intent/02-subsystems/01-session-multiplexer.md)
  (attach joins the session's input);
  [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) §18.
- **Friction:** the seam permits live delivery and bounds it only by "recorded-first". Building it
  showed the bound that matters is a different one. Measured against the real harness: a run that is
  asking a permission question takes Enter as Yes, and a run at its startup trust question takes
  Enter as "No, exit". Keys sent to a session without reading its screen can therefore grant a
  permission the human had not granted, or end the run. A line typed while a human is half-way
  through a message is appended to theirs. §18 sorts actions into local-and-reversible and
  outward-or-irreversible and does not place "type into another session's input", which is local,
  not reversible once submitted, and can cause either kind of action.
- **Assumption made to keep moving:** Ward types only where it has read the screen and seen the
  run's input line; it submits only when that line holds exactly what it typed; it takes its text
  back when the line held someone's words; and what it types is a pointer to a record (the task and
  the verb that shows it), never an instruction, because the receiver cannot tell who typed it. A
  harness whose screen Ward cannot read is never typed to.
- **Proposed revision:** add a constraint to the messaging seam: live delivery **must not answer a
  question the target is being asked, must not merge with input someone is composing, and carries
  only a reference to the record**, with the reason (an unauthenticated line is obeyed as written).
  And add to the harness seam's surface what makes that checkable: a harness says whether a run is
  at its input, or offers a channel for a message that does not go through its keyboard.
- **Status:** pending

## IF-005 — "served entirely from the record" does not say when a target that was not running reads it

- **Slice:**
  [`intent/02-subsystems/02-messaging-coordination.md`](../../intent/02-subsystems/02-messaging-coordination.md),
  _Recorded-first_ and _Deliver_ ("let the target read what was sent").
- **Friction:** a record serves a target only when the target looks. A floor session that starts
  after a hand-off has no reason to look unless something tells it to, and the seam does not say
  what does: the launch, the status surface, or the session's own standing instructions.
- **Assumption made to keep moving:** three things, none of them a new mechanism. `ward status`
  shows a waiting hand-off on the floor's row. Whoever opens or resumes a floor's session is told,
  on stderr, how many wait and how to list them. The workspace manifest tells a floor's session to
  ask what waits when it starts or resumes. A launched agent is not handed the waiting hand-offs as
  starting text.
- **Proposed revision:** say in _Recorded-first_ that the record-served path includes the moment of
  reading — a target learns of what was sent to it while it was not running when it next starts or
  resumes — and leave the technique to design.
- **Status:** pending

## IF-006 — the glossary gives "nudge" to the wake, and this build needed the word for something else

- **Slice:** [`intent/00-foundation/glossary.md`](../../intent/00-foundation/glossary.md), _Wake /
  nudge_ ("Notifying a scope when a condition is met, so it can detach instead of blocking").
- **Friction:** the glossary treats nudge as a synonym of wake: a notification tied to a recorded
  condition, in one of two flavors. The line typed after a hand-off is neither flavor. It has no
  recorded condition, is not re-armed, and nobody waits on it; it is the live half of a delivery.
  The recovery rounds use "nudge" a third way, for a status persona prompting another.
- **Assumption made to keep moving:** the code and the design entry call the typed line a nudge and
  say plainly that it is not a wake.
- **Proposed revision:** separate the two in the glossary: a **wake** is the recorded condition and
  its firing; a **nudge** is any live prompt to a running session, which a wake may use to deliver
  itself and a dispatch may use to announce itself.
- **Status:** pending
