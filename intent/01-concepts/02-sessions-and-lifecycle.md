# Sessions & Lifecycle

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

A **session** is one bounded episode of an agent working at a scope, with a persona, from a working
directory. Sessions are the unit Ward records so work survives a pause, a reboot, or weeks of
absence. This file defines the lifecycle and the guarantees around it.

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
handle and re-attaches to the underlying run where it left off. Resume turns _open_ into _running_.

### Wake / nudge

Bring attention back to a scope when a condition is met — e.g. a resident asks to be woken when its
room finishes, instead of sitting blocked. **Why:** it realizes the asynchronous,
delegate-and-return pattern (`01-scopes-and-personas.md`) without senior scopes wasting context on
busy-waiting (mechanism: `../02-subsystems/02-messaging-coordination.md`).

## Guarantees

These are the point of the lifecycle; an implementation that violated them would be wrong however
clean it looked.

- **Resume is idempotent.** Resuming a thread already resumed must not create a second, conflicting
  session or otherwise break the rules. Forgetting you resumed something thirty minutes ago and
  resuming it again is harmless.
- **Closed stays closed.** No reboot or sweep ever revives a closed session.
- **Open ≠ running.** A session can be open without a process attached; resume is what
  (re-)attaches. The record, not the process, is authoritative.
- **The record is kept current.** When a session's state changes — opened, closed, resumed — the
  record updates promptly, so recovery reflects reality and not a stale snapshot.

## Recording per scope

Each scope keeps a **session log**: an append-only record of the sessions that have run at that
scope, with enough metadata per entry to support recovery, resumption, and reflection. At minimum an
entry captures: the identity, the persona (name + role), the working directory, the **harness
handle**, the model, when it opened/closed, and its current state. Sub-scopes nest within their
parents, so reading a scope's record also reveals the threads beneath it. (Store is a _how_ —
`../02-subsystems/00-metadata-store.md`.)

## Dispatch and waiting, as session operations

- **Dispatch** opens (or routes work into) a session at a target scope and records where it went, so
  the dispatcher can later find it by identity.
- **Wait** lets one session block on another's completion; **wake** lets a session detach and be
  notified later. Both are expressed against session identity, so they survive the indirection of
  pause and resume. (Mechanism: `../02-subsystems/02-messaging-coordination.md`.)

## Recovery: bringing a workspace back to life

After a cold start, Ward reconstructs the working state from the record. Recovery is an
**orchestration of the per-seam mechanisms**, in order:

1. Enumerate sessions across all scopes.
2. Filter to those that are **open and not closed** — the live threads.
3. For each, read its harness handle and re-attach (resume).
4. **Re-arm pending wakes.** A "wake me when X" condition recorded before the reboot is re-armed
   from the record, so detached waiters are still notified
   (`../02-subsystems/02-messaging-coordination.md`).
5. **Validate idempotent setup.** Where a thread depends on setup that may have half-run, the
   lifecycle hooks are re-validated and converge to done-or-not without repeating work
   (`03-work-lifecycle.md`, `../../design/lifecycle-hooks.md`).
6. Leave closed sessions alone.

The result: a human returns from a reboot to a workspace that has restored the threads genuinely in
flight — their sessions, their waits, and their setup — and nothing else.

## Canonical home for

- **The session lifecycle** — open / close / resume / wake — and the **open ≠ running** distinction.
- **The lifecycle guarantees** — resume is idempotent, closed stays closed, the record (not the
  process) is authoritative, and the record is kept current.
- **The per-scope session log** (append-only; "enough metadata" to recover).
- **Recovery** — the cold-start orchestration that restores the in-flight threads.

The **harness handle** is defined here as a recorded _attribute_; the contract a harness must
satisfy to expose and resolve it lives in
[`../02-subsystems/03-agent-harness.md`](../02-subsystems/03-agent-harness.md).

## Open questions

- **"Enough metadata" to resume.** This file lists a minimum; validate it against a real
  reboot-recovery scenario before treating it as settled.
- **Wake across a reboot.** How a "wake me when X" request survives a reboot and is re-armed during
  recovery (mechanism in
  [`../02-subsystems/02-messaging-coordination.md`](../02-subsystems/02-messaging-coordination.md)).
