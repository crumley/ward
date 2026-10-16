# 0031 — Spec-feedback

> Intent frictions found while designing detached session hosting.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

Context for adjudicating without the entry open: [0031](README.md) designs the
[session-multiplexer](../../intent/02-subsystems/01-session-multiplexer.md) seam's **added
technique** — Ward-launched agent sessions hosted detached in tmux, beside the foreground baseline
[0029](../0029-launched-sessions/README.md) built. Each floor gets one **floor host** (a tmux
session) holding one window per Ward session, with floor 0's windows linked into every floor host; a
window's placement is derived from the record (its floor, or its recorded parent's). The record
stays the only source of truth; the live half is a cache; `attach`, `observe`, `resume`, and `close`
are the verbs over it. The design is proposed and unbuilt: SF-001..004 surfaced while drawing its
boundaries, SF-005..006 while testing it against a prior-art survey of eleven comparable systems
([`prior-art/`](prior-art/) holds the evidence the later SFs cite), and SF-007 when the design was
regrouped from one host per session to floor hosts.

## SF-001 — "map … for resume" conflates attaching a live run with re-creating a stopped one

- **Slice:** [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("map a recorded session reference … back to a live session **for resume**, and
  re-create it when not running").
- **Friction:** with a real host, the constraint's wording conflates two acts the lifecycle slice
  itself insists on keeping distinct: **attaching** to a run that is alive (joining a process,
  costing nothing) and **resuming** one that is not (re-establishing a live attachment). The seam's
  "for resume" reads as though mapping exists to serve resume, when in the hosted world the
  mapped-to live session is precisely the case where resume must _refuse_ (this design's resume
  gate) and attach is the true verb — the same different-act-different-word rule the lifecycle slice
  already applies to fresh-run-vs-resume.
- **Assumption made to keep moving:** the constraint means "map the record to the live session so a
  caller can reach it — attach when live, re-create (resume) when not," and this design builds that
  reading.
- **Proposed revision:** reword the constraint to name both acts: "Map a recorded session reference
  back to a live session — to **attach** when it is running, and to **re-create it** (a resume into
  the host) when it is not." The two-verb distinction holds for any host technique, and a design
  following the current wording literally could build resume-as-attach — the exact conflation 0029's
  routing note already had to apologize for.
- **Status:** pending.

## SF-002 — the multiplexer-vs-messaging split needs a provisional floor

- **Slice:** [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) /
  [`messaging-coordination`](../../intent/02-subsystems/02-messaging-coordination.md), the shared
  open question (_multiplexer-vs-store split_).
- **Friction:** both slices track "how much of dispatch/wake rides on the multiplexer" as open, and
  this design had to take a position to draw its own boundary: a live host makes injecting into a
  pane trivially available — and a floor host puts every session on a floor one `send-keys` away
  from the floor's coordinating session — and nothing in either slice says whether the hosting arc
  may start using it.
- **Assumption made to keep moving:** the host carries **hosting only** — no delivery, no wake, no
  nudge rides on it in this arc; every coordination flow stays recorded-first in the store, and live
  delivery over the host remains the messaging arc's optimization to design against its own contract
  (idempotent, recorded-first, re-armed on recovery — properties a raw pane injection has none of).
- **Proposed revision:** note under both slices' open question that the split has a provisional
  floor: the multiplexer's responsibility ends at hosting; anything message-shaped that later rides
  on it is the messaging seam's design, built on the record. It keeps a future hosting change from
  quietly becoming an unrecorded delivery channel — the leak the messaging seam calls out as the
  reason it is opinionated.
- **Status:** pending.

## SF-003 — hosting does not gate on the harness seam's fork-mode question

- **Slice:** [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md), _Open questions_
  (fork mode first) with
  [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md).
- **Friction:** the fork-mode-first question is tracked as if some arc must resolve it before
  adjacent work can proceed, and this arc sits adjacent (the harness's `--fork-session` is the
  exact-clone mechanism, and a fork of a hosted session must live somewhere). Nothing says whether
  hosting may land first.
- **Assumption made to keep moving:** hosting is **neutral** to fork mode and lands first — an
  exact-clone fork, whenever it ships, produces a _new session_ with its own identity and handle
  (the harness seam already says so), and a new session is placed and hosted by this design like any
  other open; the distilled-brief fork is just an open with a brief for a purpose. Neither mode
  needs anything from the host beyond what every session gets.
- **Proposed revision:** one sentence under the open question recording that hosting does not gate
  on it: a fork in either mode arrives at the multiplexer as an ordinary new session, so the
  question stays open without blocking (or being reopened by) hosting work. Marking the
  non-dependency keeps a future builder from re-deriving this entry's neutrality argument — or
  assuming hosting prejudged the mode.
- **Status:** pending.

## SF-004 — the seam is silent on who may destroy live state

- **Slice:** [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ (cache-over-record) with [`principles`](../../intent/00-foundation/01-principles.md)
  §18.
- **Friction:** the seam says the live host is a cache and never the truth, but is silent on **who
  may destroy live state and when** — and a cache full of processes is not a cache of bytes: killing
  a live pane discards an agent's un-recorded working state even though the durable record survives.
  This design needed the rule repeatedly (close's teardown of a window and, when emptied, its floor
  host; doctor's stray windows and hosts; the temptation to sweep) and found it nowhere.
- **Assumption made to keep moving:** teardown of a session's live half rides on that session's
  **deliberate close** (the actor closing has the authority the close itself required); stray live
  state — windows or hosts no open record explains — is **surfaced with a remedy and never swept**,
  the same never-on-the-session's-behalf shape as the unresumable-thread rule.
- **Proposed revision:** a clause in the seam: "**Live state is torn down by the lifecycle, not by
  hygiene.** Closing a session tears down its live hosting; anything live that no open record
  explains is surfaced to the human with its remedy, never reaped automatically." It holds for any
  host, and without it every future design re-litigates whether doctor may kill — with §18 arguing
  one way and "just a cache" arguing the other.
- **Status:** pending.

## SF-005 — attach multiplicity and write ownership are unstated

- **Slice:** [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("Let a human or agent **(re-)attach**, and **observe read-only**").
- **Friction:** the seam names two grains of access and is silent on **multiplicity and write
  ownership**: whether attach implies a single writer, what a second attacher gets, and whether
  reclaiming input from a client that went away is a distinct act. The prior art treats this as
  designed surface — [herdr](prior-art/herdr.md)'s complete triad is attach (one writable client) /
  observe (many readers) / takeover (an explicit steal), and [prime-agent](prior-art/prime-agent.md)
  separates observation from steering at the protocol — while tmux's native attach is
  **shared-write**: two attachers mirror keystrokes into one conversation. Floor hosts do not change
  this: attach goes through a per-client view so two humans on one floor keep their own current
  windows, but two views selecting the same window still share its one keyboard.
- **Assumption made to keep moving:** shared-write attach is admissible in this arc — attach is
  idempotent (two clients on one window is tmux's ordinary case), observe is the enforced read-only
  grain, and the common local case is one human on two terminals; no single-writer machinery is
  built, and the manifest says plainly that two attachers share one keyboard.
- **Proposed revision:** one sentence in the seam settling the stance: either "concurrent attach is
  shared by design; observe is the protected grain" or "a design must keep attach single-writer,
  with takeover an explicit act" — whichever the intent means. The answer holds for any host
  technique and changes what every design builds.
- **Status:** pending.

## SF-006 — mapping a record to a live session says nothing about verifying it belongs

- **Slice:** [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("Map a recorded session reference … back to a live session").
- **Friction:** the constraint speaks of **mapping** and is silent on **verification** — whether the
  live session the mapping reaches may be trusted on its address alone. The prior art is unanimous
  that found-by-address and belongs-to-the-record are different facts: [cmux](prior-art/cmux.md)
  bans name- and title-matching as binding outright, [pond](prior-art/pond.md) confirms a found
  session by an environment probe before trusting it, [agent-term](prior-art/agent-term.md) stamps
  generations so stale pointers invalidate at once, and
  [background-agents](prior-art/background-agents.md) rotates credentials so an orphan fences itself
  out. Any mapping through a shared namespace can be satisfied by a stranger — a tmux session name,
  and under floor hosts a window tag, equally.
- **Assumption made to keep moving:** the mapped-to live window is **confirmed to belong to the
  record** before it is attached to, killed, or reported as this session's — by evidence the launch
  placed in the live half (the window's session tag, its host's workspace stamp, and a generation
  stamp equal to the record's latest launch event), never by its name or position alone.
- **Proposed revision:** extend the constraint: "…and confirm the mapped-to live session belongs to
  the record — by evidence the launch placed in it, never by its name or address alone." It holds
  for any host technique (a socket path, a pid, a container id, a window id are all recyclable
  addresses), and a design following the current wording literally would attach a human to a
  stranger's pane wearing the right name.
- **Status:** pending.

## SF-007 — "group by the work they belong to (by scope)" vs grouping by lineage

- **Slice:** [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("**Group sessions by the work they belong to** (by scope) and **label them by
  identity**").
- **Friction:** the constraint's parenthesis makes scope the grouping key. Floor hosts honor it for
  every session started on its own — a task session sits in its task's floor host — but a session
  started by another session is placed in its **parent's** floor host, so the floor-3 coordinator's
  window and the floor-5 task session it started sit together in floor 3's host. That is the
  arrangement the work actually has (the coordinator watching what it dispatched), and it is
  grouping by **lineage**, which the parenthesis does not admit. Floor 0's windows, linked into
  every floor host, are a second departure: one session grouped with every floor at once.
- **Assumption made to keep moving:** "the work they belong to" is read as the work that **owns**
  the session — its scope when it was started on its own, its parent's placement when another
  session started it — with the ground floor's coordinating sessions belonging to every floor's
  view. Placement is derived from recorded facts only (scope, task floor, recorded parent), never
  from where a process happened to run, so the grouping is reproducible from the record after a
  reboot.
- **Proposed revision:** loosen the parenthesis to "(by the scope or the lineage that owns them —
  derived from the record, never from co-location)", or, if scope is meant strictly, say so — in
  which case a design must place a dispatched session in its own scope's group and reach its parent
  some other way.
- **Status:** pending.
