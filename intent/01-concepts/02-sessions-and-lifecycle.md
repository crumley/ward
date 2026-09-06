# Sessions & Lifecycle

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

A **session** is one bounded episode of an agent working at a scope, with a persona, from a working
directory. Sessions are **agent** episodes: the human opens them, attaches to them, and directs them
(`01-scopes-and-personas.md`, the human), but is not one. Sessions are the unit Ward records so work
survives a pause, a reboot, or weeks of absence. This file defines the lifecycle and the guarantees
around it.

## Why sessions are recorded

The motivating scenario: a machine running a dozen-plus agent sessions reboots. Ward must look at
what is recorded and, for each thread, determine its **harness handle** (which harness, which native
run) and what state it was in — and bring the right ones back to life, without the human remembering
anything, without re-running finished work, and without burning tokens restarting things that
already completed. **Why this is possible at all:** every session is recorded with enough metadata
to reconstruct it (`../00-foundation/01-principles.md` §16: recorded state is the source of truth).

### The harness handle

Each agent harness stores its own conversation history in its own format and location. For every
session, Ward records a **harness handle** — which **harness** produced it and that harness's
**native run id** — so the underlying run can always be located again, to **resume** it and to
**reflect** over it later (`04-reflection-and-evolution.md`). The handle is a recorded _attribute_
of the session, **not a second identity**: you address a session by its Ward identity and _use_ the
handle to re-attach, exactly as a task carries a remote-work-item link without that link being its
identity (`03-work-lifecycle.md`). **Why the indirection:** it lets Ward span a mix of harnesses
without assuming any one of them (`05-context-loading.md`).

Recording the handle does not wait on the run. Where a harness accepts an externally-supplied run
id, Ward **assigns** the handle and starts the run under it, so the record precedes the process;
only where a harness insists on minting its own is the handle written immediately after start
(`../02-subsystems/03-agent-harness.md`, which owns that ordering rule). **Why it matters here:** a
session recorded with no handle is a thread nothing can locate, resume, or reflect over — so the
minimum below is complete from the first moment there is anything live to be complete about.

## Open vs. running — a load-bearing distinction

**Open** and **running** are not the same:

- A thread is **open** when it is a live unit of work that has been started and not closed —
  regardless of whether any process is currently attached to it.
- A thread is **running** when, on _this_ machine, right now, there is an active agent process
  attached to it.

An open task or project does **not** imply a running agent. A reboot leaves many threads open but
none running; resume is what turns open-but-not-running back into running. **Why it matters:**
recovery reasons about what is _open_ from the record, not about what happens to be _running_ in
some terminal — so the lights going out never loses a thread.

**Running is per machine, and the record says which machine.** A thread is bound to the machine
holding its harness history (`../02-subsystems/03-agent-harness.md`, where locate is answered per
machine), so a session open in a workspace shared by two computers can be turned into a run on one
of them and not the other. The session's recorded **machine** (the minimum, below) is what makes
that answerable: without it, a resume on the wrong machine is attempted, fails at the harness, and
records an attempt that never had a chance.

It follows that only **open** and **closed** are ever **stored** on the session record. _Running_ is
a **derived live overlay** — a fact about a process attached right now, read from the live layer —
the same shape as `in-review` on a task (`00-domain-model.md`, a derived overlay, not a stored
state). **Why running is never stored:** a persisted "running" is stale the instant the machine
reboots — the record would claim _running_ while no process exists, violating
recorded-state-is-truth (`../00-foundation/01-principles.md` §16) — and recovery filters on **open
and not closed**, never on "running," so a stored running would be a field nothing could trust and
nothing needs.

## The lifecycle operations

### Open

Begin working on something. Opening records, for a given scope, persona, and working directory: that
work has started, with what identity, under which harness, with which model. Opening establishes the
thread everything else refers to.

### Close

Finish working on something. Closing records that the thread is **done** and is not a candidate for
resumption. **Why it is its own operation:** a closed session is never revived after a reboot — this
is precisely what prevents Ward from waking finished work and wasting tokens on it.

### Resume

Return to a thread that is open but not closed, and continue it. Resume reads the recorded harness
handle and re-attaches to the underlying run where it left off. Resume turns _open_ into _running_
by **(re-)establishing the live attachment** — it does not change the durable record's state, which
stays _open_ until close (running is derived, never stored; _Open vs. running_, above).

### Wake / nudge

Bring attention back to a scope when a condition is met — e.g. a resident asks to be woken when its
room **reports done** (a _milestone_ wake) or when it **completes** (a _completion_ wake; the two
flavors are the messaging seam's contract, `../02-subsystems/02-messaging-coordination.md`) —
instead of sitting blocked. **Why:** it realizes the asynchronous, delegate-and-return pattern
(`01-scopes-and-personas.md`) without senior scopes wasting context on busy-waiting.

## Guarantees

These are the point of the lifecycle; an implementation that violated them would be wrong however
clean it looked.

- **Resume is idempotent.** Resuming a thread already resumed must not create a second, conflicting
  session or otherwise break the rules. Forgetting you resumed something thirty minutes ago and
  resuming it again is harmless.
- **Closed stays closed — and closing stays deliberate.** No reboot or sweep ever revives a closed
  session, and nothing closes an open one on the session's behalf: a thread Ward can no longer
  resume stays **open and visible** (_Recovery_, the three outcomes) rather than being tidied away.
  Ward may, however, **ask**: when a run exits with its human demonstrably present — a foreground
  run they just left — the shell may ask whether the thread is done, stating what it found and
  proposing an answer. The answer, default included, is **the human's close, never Ward's**, and
  every caller who is not there to answer (an agent, a machine-readable invocation, anything without
  a terminal) keeps the session open. **Why the distinction holds:** what the guarantee forbids is
  machinery deciding a thread is finished; a question decides nothing — it spends the one moment the
  human's answer is free rather than accumulating threads only they can settle
  (`../02-subsystems/07-human-shell.md`, which owns when such a question may be asked).
- **Open ≠ running.** A session can be open without a process attached; resume is what
  (re-)attaches. Stored state is `open` or `closed` only — _running_ is derived from the live
  attachment, never persisted. The record, not the process, is authoritative.
- **The record is kept current.** When a session's state changes — opened, closed, resumed — the
  record updates promptly, so recovery reflects reality and not a stale snapshot.

## Recording per scope

Each scope keeps a **session log**: an append-only record of the sessions that have run at that
scope, with enough metadata per entry to support recovery, resumption, and reflection. At minimum an
entry captures: the identity, the working directory, the **harness handle**, the **machine** the
session ran on, the model, when it opened/closed, its current stored state (`open` or `closed`), and
its **purpose** — a link to the brief or dispatch that opened it, or a one-line goal when neither
exists. **Why the machine is part of the minimum:** the handle is machine-independent in form and
machine-bound in fact — the harness keeps the run's history on the computer that produced it — so a
record without it cannot say **where** a thread can be resumed, and recovery reading a workspace on
a second machine cannot tell a thread it may re-attach from one it cannot. **Why purpose is part of
the minimum:** "what was this thread trying to do" must be answerable from the record alone — the
harness history says it at length, but the record must not depend on a transcript that may no longer
resolve (`../02-subsystems/03-agent-harness.md`).

Two further fields belong to the minimum but are **conditioned on a source existing**: the
**persona** (name + role), once the workspace has a persona cast to name one from
(`01-scopes-and-personas.md`), and the **resources the session consumed** (tokens, cost), where the
harness exposes them. **Why usage is recorded:** token economy (`../00-foundation/01-principles.md`
§12) treats spend as a managed cost, and a cost is managed only where it is measured — recorded
usage is the evidence model-selection tuning reads (`../02-subsystems/04-model-selection.md`);
without it, fast-vs-deep routing is tuned on guesswork. It is best-effort by construction (an
optional harness capability, `../02-subsystems/03-agent-harness.md`) — nothing may depend on its
presence, and the same holds for the persona until a cast exists. **Why the conditions are stated
rather than assumed:** the minimum is a **target** every build is measured against, and a field
whose source does not exist yet reads as a contract the build silently fails instead of as the next
thing to reach. Naming the condition keeps both errors out — the field is never quietly dropped from
the target, and never invented out of nothing to satisfy it.

Sub-scopes nest within their parents, so reading a scope's record also reveals the threads beneath
it. (Store is a _how_ — `../02-subsystems/00-metadata-store.md`.)

The log records **lifecycle events, not just sessions**: per session, append-only entries for
opened, resumed, **resume-failed (with its cause)**, and closed. Events are not states — the stored
state stays `open | closed` — but they make failure a **recorded fact**: without a resume-failed
event, a session whose re-attach keeps failing is indistinguishable from one that is open and
healthy, and neither recovery rounds nor reflection can tell the two apart. **Why append-only
events:** appends don't collide (`../00-foundation/01-principles.md` §17), and the trail of attempts
is exactly what a later reflection reads to see where recovery struggled.

## Dispatch and waiting, as session operations

- **Dispatch** opens (or routes work into) a session at a target scope and records where it went, so
  the dispatcher can later find it by identity.
- **Wait** lets one session block on another's completion; **wake** lets a session detach and be
  notified later. Both are expressed against session identity, so they survive the indirection of
  pause and resume. (Mechanism: `../02-subsystems/02-messaging-coordination.md`.)

## Recovery: bringing a workspace back to life

After a cold start, Ward reconstructs the working state from the record. Recovery is an
**orchestration of the per-seam mechanisms**, in order — mechanics first, judgment last:

1. Enumerate sessions across all scopes.
2. Filter to those that are **open and not closed** — the live threads.
3. For each, read its harness handle and re-attach (resume) — with **three** possible outcomes per
   thread, not two (below).
4. **Re-arm pending wakes.** A "wake me when X" condition recorded before the reboot is re-armed
   from the record, so detached waiters are still notified
   (`../02-subsystems/02-messaging-coordination.md`).
5. **Validate idempotent setup — live anchors only.** Where a thread depends on setup that may have
   half-run, the lifecycle hooks are re-validated and converge to done-or-not without repeating work
   (`03-work-lifecycle.md`, `design/`). Re-validation runs **only for anchors whose directory still
   exists** (those belonging to non-closed work); an anchor — worktree or workdir
   (`00-domain-model.md`) — that was **torn down** when its task closed is **skipped**. **Why:**
   closing a task really removes its anchors (`03-work-lifecycle.md`), so re-applying a setup hook
   into a directory that no longer exists is a hard error — and closed work is, by definition, not a
   thread in flight. The anchor's **record** is retained for history but is inert for recovery.
6. Leave closed sessions alone.
7. **Make recovery rounds — judgment on top of mechanics.** Steps 1–6 restore everything the record
   can decide **deterministically**; they cannot decide what the world did while the lights were out
   — a report that landed just before the crash, a wake whose condition is now moot, a thread whose
   next step has changed. So recovery ends with **rounds**: top-down, one level at a time, the
   **status personas take stock of their own spans**. The house supervisor rounds over the projects
   and nudges each project's charge nurse; each charge nurse reviews its project's re-attached
   threads, outstanding waits, and pending dispatches, drives each back into a good state, and
   reports upward. **Why top-down, span-by-span:** routing knowledge already lives with the status
   personas by design (`01-scopes-and-personas.md`), and no single scope should need whole-workspace
   detail to recover — the same context discipline that governs normal operation governs recovery.
   **Why judgment at all:** the returning human may not know what state anything is in; rounds mean
   they do not have to — the workspace takes stock of itself and presents a coherent picture instead
   of merely rewiring sessions and hoping. Rounds run as **ordinary sessions** — recorded in the
   session log, harness handles and all — and their conclusions are **reports**, recorded like any
   other message. **Why:** the judgment that put the workspace back together must be as reflectable
   as the work itself. (How a nudge is issued and a condition evaluated is a _how_ —
   `../02-subsystems/02-messaging-coordination.md`, `design/`.)

**The three outcomes per thread.** Re-attaching an open thread does not always succeed, and the
failure is not an error to retry past. Beside **re-attached** and **skipped as closed**, a thread
may be **unresumable**: still open, but its **harness handle no longer resolves** — the harness
discarded the run's history, retention being the harness's and not Ward's
(`../02-subsystems/03-agent-harness.md`, locate distinguishes found from gone). An unresumable
thread is **recorded on the recovery episode with its cause**, beside the session's own
resume-failed event, and **surfaced to the human as something that needs them**
(`../02-subsystems/07-human-shell.md`, "what needs me?"). Ward **never closes it on the session's
behalf**.

**Why it is never swept:** _closed stays closed_ is a guarantee strong enough that only a human or
an agent doing the work may invoke it; a heuristic that closed threads for looking doomed would
spend that guarantee on a guess, and would erase exactly the evidence reflection reads
(`04-reflection-and-evolution.md`). **Why it is surfaced rather than retried quietly:** left
nameless, these threads become a growing set of doomed re-attachments every recovery repeats and
nobody reads — the honest accumulation of resume-failed events is only useful if something acts on
it, and the only thing that can decide is the human.

A session whose harness history is gone may still be continued **as a fresh run under a new handle**
— but that is a **different act and deserves a different word**: it starts an episode with none of
the old one's memory, and calling it _resume_ would quietly falsify what resume promises, that a
thread continues where it left off. (Which word, at the surface, is
`../02-subsystems/07-human-shell.md`'s — verbs read true to the operation.)

Recovery is itself a **recorded episode**, not an invisible pass. Every recovery writes its own
durable record as it runs: when it started, what it enumerated, the outcome per thread —
re-attached, **unresumable with its cause** (a stale handle, a missing worktree, a harness error),
or skipped as closed — the wakes re-armed and fired, and the conclusions the rounds reported.
**Why:** recorded-state-is-truth (`../00-foundation/01-principles.md` §16) applies to Ward's own
actions too — a recovery that struggles and leaves no trace can neither be debugged by the human nor
improved by reflection, and a struggling recovery is concentrated evidence of exactly the frictions
reflection exists to find (`04-reflection-and-evolution.md`, which treats a completed recovery as a
trigger). (The record's form is a _how_ — `../02-subsystems/00-metadata-store.md`.)

Because session ids are **unique over the workspace's history, across the machines that share it**
(`00-domain-model.md`, Identity), recovery addresses each session by its **bare id** — no scope
qualifier is needed to tell two threads apart, even when sibling scopes reuse a slug, and no id ever
addresses two sessions.

The result: a human returns from a reboot to a workspace that has restored the threads genuinely in
flight — their sessions, their waits, and their setup — and nothing else, and that has **already
taken stock of itself**: rounds mean the human is told where everything stands rather than having to
remember it.

## Canonical home for

- **The session lifecycle** — open / close / resume / wake — and the **open ≠ running** distinction
  (stored state is `open | closed`; _running_ is a derived live overlay, never persisted, and it is
  **per machine** — the record names the machine that can turn open into running).
- **The lifecycle guarantees** — resume is idempotent, closed stays closed and closing stays
  deliberate (the shell may **ask** a present human; it never decides), the record (not the process)
  is authoritative, and the record is kept current.
- **The per-scope session log** (append-only; "enough metadata" to recover, including each session's
  **purpose** and the **machine** it ran on, and — conditioned on a source existing — its
  **persona** once a cast exists and its **usage** where the harness exposes it; **lifecycle
  events** — opened / resumed / resume-failed with cause / closed — so failure is a recorded fact,
  never a silent retry).
- **Recovery** — the cold-start orchestration that restores the in-flight threads (re-validating
  setup for **live** anchors only; addressing sessions by their workspace-unique bare id) — itself a
  **recorded episode** (wakes re-armed/fired, the rounds' conclusions) — and its **three per-thread
  outcomes**: re-attached, **unresumable** (open but its handle no longer resolves — recorded with
  its cause, surfaced to the human, never auto-closed), or skipped as closed.
- **Recovery rounds** — the judgment pass that ends recovery: the status personas, top-down
  (supervisor → charge nurses), each taking stock of its own span and driving it back into good
  order. Mechanical re-arm restores what the record can decide; rounds decide the rest. Rounds run
  as ordinary, recorded sessions.

The **harness handle** is defined here as a recorded _attribute_; the contract a harness must
satisfy to expose and resolve it lives in
[`../02-subsystems/03-agent-harness.md`](../02-subsystems/03-agent-harness.md).

## Open questions

- **"Enough metadata" to resume.** This file lists a minimum; validate it against a real
  reboot-recovery scenario before treating it as settled.
