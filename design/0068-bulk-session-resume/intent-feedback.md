# 0068 — Intent feedback

> Intent frictions found while building the bulk session resume.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

What was built, in one paragraph: `ward session resume --all` reads every open session whose latest
run was hosted detached and prints a plan, floor by floor, coordinator first — each session marked
`resume`, `live`, `gone` (its harness history is not on this machine, where it ran), `elsewhere`
(another machine's) or `unknown` — and starts nothing. `--go` enacts the plan: each `resume` session
is resumed detached, one after another, through the same path as `ward session resume ID`. The
per-session `resumed` and `resume-failed` events are the only record; the command prints, and under
`--json` emits, the outcome per thread.

## IF-001 — the cold-start verb is named `attach`, and `attach` already means joining one window

- **Slice:**
  [`intent/02-subsystems/07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md), _Verbs
  read true to the operation_ ("the workspace-wide cold start that re-attaches every in-flight
  thread reads as `attach` (or 'resume the workspace')");
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  the Recovery row of the four-operations table and the _Canonical home for_ list ("its CLI verb
  reads as `attach`");
  [`intent/04-walkthrough-delivering-work.md`](../../intent/04-walkthrough-delivering-work.md), §8
  ("recovery — the `attach` verb").
- **Friction:** since the detached host was built, `ward session attach ID` joins a terminal to one
  session's live window, and the session-multiplexer slice uses "attach" for exactly that. A
  top-level `ward attach` beside it would give one word two acts: joining a window you then type
  into, and starting many runs you do not join. The slice's own rule — a verb matches what it does —
  argues against its own example. The slice also offers "resume the workspace", and the per-thread
  operation it names is `resume`.
- **Assumption made to keep moving:** the bulk form is the per-thread verb said of all threads:
  `ward session resume --all` (the human's ruling, 2026-11-16). No top-level `attach` exists.
- **Proposed revision:** in all three places, say that the cold start reads as **resuming** — the
  per-thread verb applied to every open thread — and keep `attach` for joining a live window, as the
  session-multiplexer slice already uses it. Keep the rule's negative: not `recover`.
- **Status:** pending

## IF-002 — the recovery episode record is not written; the per-session events are the record

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Recovery_ ("An unresumable thread is recorded on the recovery episode with its cause");
  [`intent/00-foundation/glossary.md`](../../intent/00-foundation/glossary.md), _Recovery record_;
  [`intent/01-concepts/04-reflection-and-evolution.md`](../../intent/01-concepts/04-reflection-and-evolution.md),
  _Recovery reflection_ (it reads the recovery record).
- **Friction:** the slices describe recovery as writing a durable episode about itself — when it
  ran, per-thread outcomes, wakes, the rounds' conclusions. This build is the re-attach step alone:
  there are no wakes or rounds to record, and an episode holding only what the session events
  already hold would be a second copy of them. But without it, nothing durable says that five
  `resumed` events a second apart were one act, and a thread found `gone` leaves no trace of having
  been looked at (IF-003).
- **Assumption made to keep moving:** no episode record in this slice (the human's ruling,
  2026-11-16). Each attempt is on its session as `resumed` or `resume-failed` with its cause; the
  command's report, human and `--json`, is the per-thread outcome for whoever ran it and is not
  kept.
- **Proposed revision:** none to the target. Note in _Recovery_ that the episode record arrives with
  the steps that give it something only it can hold (wakes re-armed, rounds), and that until then
  the session events are the record of the re-attach step.
- **Status:** pending

## IF-003 — recovery is described as attempting every open thread; an unresumable one is better found by looking

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Recovery_, the three outcomes ("recorded on the recovery episode with its cause, beside the
  session's own resume-failed event") and _Why it is surfaced rather than retried quietly_ ("a
  growing set of doomed re-attachments every recovery repeats").
- **Friction:** the slice has recovery attempt each open thread and learn it is unresumable from the
  failure, which appends `resume-failed` to it. It then names the cost itself: every later recovery
  repeats the doomed attempt. With a recovery a human may run several times in a morning, and a plan
  that must be free to ask repeatedly, that is one more failure event per look on a thread whose
  state has not changed — and the trail stops distinguishing "tried and failed" from "looked again".
  Whether the history exists is answerable without an attempt: locate distinguishes found from gone.
- **Assumption made to keep moving:** the plan decides by locating. A thread whose history is gone
  is marked `gone`, surfaced to the human with what to do, never attempted, and gains no event —
  from the plan or from the enacted run. `resume-failed` is written only when a run was actually
  attempted and did not start. A single `ward session resume ID` of such a thread still records the
  failure, as before.
- **Proposed revision:** say that recovery **determines** an unresumable thread from the handle
  (locate) before attempting anything, surfaces it, and does not attempt it; and that
  `resume-failed` records an attempt that was made. If "recovery looked and found it gone" should
  itself be durable, that belongs on the episode record (IF-002), where it is one line per recovery,
  not an ever-growing trail on the session.
- **Status:** pending

## IF-004 — "re-attach every open session" covers runs Ward did not start and cannot see

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Recovery_, steps 2 and 3 ("Filter to those that are open and not closed — the live threads. For
  each, read its harness handle and re-attach").
- **Friction:** two kinds of open session are not ones a recovery can safely start. A session that
  **recorded itself** — an agent already running in someone's harness, which is how every task
  session is recorded today — has a handle, but Ward did not start it and resuming it would launch a
  run nobody placed. A session whose latest run was in the **foreground** stood in a terminal Ward
  cannot see into; the recovery command is not gated on a reboot having happened, so starting it
  could put a second process on a conversation still open in that terminal. The slice's filter
  admits both.
- **Assumption made to keep moving:** recovery brings back the sessions whose latest run Ward itself
  placed in the detached host. The others are counted in the plan and left alone. A session whose
  hosted run had ended before the reboot, and that was never closed, is in the plan: whether a run
  was going is never stored, and closing it is how a human keeps it out.
- **Proposed revision:** in step 2, say which open threads recovery re-attaches — those whose run
  Ward started and can account for — and that the rest are reported, not started. State beside it
  that an open thread whose run had already ended is re-attached like any other, because open is all
  the record says, and why.
- **Status:** pending

## IF-005 — recovery reads as one act; starting a dozen agents wants to be seen first

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Recovery_ (the numbered orchestration);
  [`intent/02-subsystems/07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md), _Verbs
  read true_.
- **Friction:** the slice describes recovery as a sequence that runs. Its re-attach step starts one
  agent run per open thread, which is spend (§12) committed at the moment the returning human knows
  least about what is open — and the open set includes threads that were already finished in all but
  the closing. The detached-hosting design declined a mass restart for that reason.
- **Assumption made to keep moving:** the command's default is a plan that reads and starts nothing;
  enacting takes an explicit flag, `--go` (the human's ruling, 2026-11-16). A plan may be asked any
  number of times and writes nothing.
- **Proposed revision:** say in _Recovery_ that the re-attach step is **shown before it is enacted**
  — the human sees which threads would come back and commits to it as a second act — and why: the
  cost is theirs, and open does not mean wanted.
- **Status:** pending
