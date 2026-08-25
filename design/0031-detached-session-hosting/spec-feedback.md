# 0031 — Spec-feedback

> Intent frictions found while designing detached session hosting — six, all pending.

Context for adjudicating without the entry open: [0031](README.md) designs the
[session-multiplexer](../../intent/02-subsystems/01-session-multiplexer.md) seam's **added
technique** — Ward-launched agent sessions hosted detached in tmux, beside the foreground baseline
[0029](../0029-launched-sessions/README.md) built. The record stays the only source of truth; the
live host is a cache; `attach`, `observe`, `resume`, and `close` are the verbs over it. The design
is proposed and unbuilt: SF-001..004 surfaced while drawing its boundaries, SF-005..006 while
testing it against a prior-art survey of eleven comparable systems ([`prior-art/`](prior-art/) holds
the evidence the later SFs cite).

- **SF-001** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("map a recorded session reference … back to a live session **for resume**, and
  re-create it when not running"). _Friction:_ with a real host, the constraint's wording conflates
  two acts the lifecycle slice itself insists on keeping distinct: **attaching** to a run that is
  alive (joining a process, costing nothing) and **resuming** one that is not (re-establishing a
  live attachment). The seam's "for resume" reads as though mapping exists to serve resume, when in
  the hosted world the mapped-to live session is precisely the case where resume must _refuse_ (this
  design's resume gate) and attach is the true verb — the same different-act-different-word rule the
  lifecycle slice already applies to fresh-run-vs-resume. _Assumption to keep moving:_ the
  constraint means "map the record to the live session so a caller can reach it — attach when live,
  re-create (resume) when not," and this design builds that reading. _Proposed revision:_ reword the
  constraint to name both acts: "Map a recorded session reference back to a live session — to
  **attach** when it is running, and to **re-create it** (a resume into the host) when it is not."
  _Why it belongs in intent:_ the two-verb distinction holds for any host technique, and a design
  following the current wording literally could build resume-as-attach — the exact conflation 0029's
  routing note already had to apologize for.
- **SF-002** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md) /
  [`messaging-coordination`](../../intent/02-subsystems/02-messaging-coordination.md), the shared
  open question (_multiplexer-vs-store split_). _Friction:_ both slices track "how much of
  dispatch/wake rides on the multiplexer" as open, and this design had to take a position to draw
  its own boundary: a live host makes injecting into a pane trivially available, and nothing in
  either slice says whether the hosting arc may start using it. _Assumption to keep moving:_ the
  host carries **hosting only** — no delivery, no wake, no nudge rides on it in this arc; every
  coordination flow stays recorded-first in the store, and live delivery over the host remains the
  messaging arc's optimization to design against its own contract (idempotent, recorded-first,
  re-armed on recovery — properties a raw pane injection has none of). _Proposed revision:_ note
  under both slices' open question that the split has a provisional floor: the multiplexer's
  responsibility ends at hosting; anything message-shaped that later rides on it is the messaging
  seam's design, built on the record. _Why it belongs in intent:_ it keeps a future hosting change
  from quietly becoming an unrecorded delivery channel — the leak the messaging seam calls out as
  the reason it is opinionated.
- **SF-003** — [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md), _Open questions_
  (fork mode first) with
  [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md). _Friction:_ the
  fork-mode-first question is tracked as if some arc must resolve it before adjacent work can
  proceed, and this arc sits adjacent (the harness's `--fork-session` is the exact-clone mechanism,
  and a fork of a hosted session must live somewhere). Nothing says whether hosting may land first.
  _Assumption to keep moving:_ hosting is **neutral** to fork mode and lands first — an exact-clone
  fork, whenever it ships, produces a _new session_ with its own identity and handle (the harness
  seam already says so), and a new session is hosted by this design like any other open; the
  distilled-brief fork is just an open with a brief for a purpose. Neither mode needs anything from
  the host beyond what every session gets. _Proposed revision:_ one sentence under the open question
  recording that hosting does not gate on it: a fork in either mode arrives at the multiplexer as an
  ordinary new session, so the question stays open without blocking (or being reopened by) hosting
  work. _Why it belongs in intent:_ the question's answer will come from fork-arc evidence, and
  marking its non-dependency keeps a future builder from re-deriving this entry's neutrality
  argument — or worse, assuming hosting prejudged the mode.
- **SF-004** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ (cache-over-record) with
  [`../../intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) §18.
  _Friction:_ the seam says the live host is a cache and never the truth, but is silent on **who may
  destroy live state and when** — and a cache full of processes is not a cache of bytes: killing a
  live pane discards an agent's un-recorded working state even though the durable record survives.
  This design needed the rule three times (close's teardown, doctor's strays, the temptation to
  sweep) and found it nowhere. _Assumption to keep moving:_ teardown of a session's live half rides
  on that session's **deliberate close** (the actor closing has the authority the close itself
  required); stray live sessions — cache entries whose record is closed or missing — are **surfaced
  with a remedy and never swept**, the same never-on-the-session's-behalf shape as the
  unresumable-thread rule. _Proposed revision:_ a clause in the seam: "**Live state is torn down by
  the lifecycle, not by hygiene.** Closing a session tears down its live hosting; anything live that
  no open record explains is surfaced to the human with its remedy, never reaped automatically."
  _Why it belongs in intent:_ it holds for any host, and without it every future design re-litigates
  whether doctor may kill — with §18 arguing one way and "just a cache" arguing the other.
- **SF-005** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("Let a human or agent **(re-)attach**, and **observe read-only**"). _Friction:_ the
  seam names two grains of access and is silent on **multiplicity and write ownership**: whether
  attach implies a single writer, what a second attacher gets, and whether reclaiming input from a
  client that went away is a distinct act. The prior art treats this as designed surface —
  [herdr](prior-art/herdr.md)'s complete triad is attach (one writable client) / observe (many
  readers) / takeover (an explicit steal), and [prime-agent](prior-art/prime-agent.md) separates
  observation from steering at the protocol — while tmux's native attach is **shared-write**: two
  attachers mirror keystrokes into one conversation, which is less safe than either of that triad's
  poles. This design had to take a position with no constraint to lean on. _Assumption to keep
  moving:_ shared-write attach is admissible in this arc — attach is idempotent (two clients on one
  session is tmux's ordinary case), observe is the enforced read-only grain, and the common local
  case is one human on two terminals; no single-writer machinery is built, and the manifest says
  plainly that two attachers share one keyboard. _Proposed revision:_ one sentence in the seam
  settling the stance: either "concurrent attach is shared by design; observe is the protected
  grain" or "a design must keep attach single-writer, with takeover an explicit act" — whichever the
  intent means. _Why it belongs in intent:_ the answer holds for any host technique and changes what
  every design builds; a daemon-shaped technique would face the same question and could silently
  answer it the other way.
- **SF-006** — [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("Map a recorded session reference … back to a live session"). _Friction:_ the
  constraint speaks of **mapping** and is silent on **verification** — whether the live session the
  mapping reaches may be trusted on its address alone. The prior art is unanimous that found-by-name
  and belongs-to-the-record are different facts: [cmux](prior-art/cmux.md) bans name- and
  title-matching as binding outright, [pond](prior-art/pond.md) confirms a found session by an
  environment probe before trusting it, [agent-term](prior-art/agent-term.md) stamps generations so
  stale pointers invalidate at once, and [background-agents](prior-art/background-agents.md) rotates
  credentials so an orphan fences itself out. Any mapping through a shared namespace can be
  satisfied by a stranger. _Assumption to keep moving:_ the mapped-to live session is **confirmed to
  belong to the record** before it is attached to, killed, or reported as this session's — by
  evidence the launch placed inside it, never by its name alone — and this design builds that (the
  ownership token and epoch stamp). _Proposed revision:_ extend the constraint: "…and confirm the
  mapped-to live session belongs to the record — by evidence the launch placed in it, never by its
  name or address alone." _Why it belongs in intent:_ it holds for any host technique (a socket
  path, a pid, a container id are all recyclable addresses), and a design following the current
  wording literally would attach a human to a stranger's pane wearing the right name.
