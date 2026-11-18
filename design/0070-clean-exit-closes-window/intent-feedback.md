# 0070 — Intent feedback

> Intent frictions found while building `A clean exit closes its window`.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

Context for adjudicating without the entry open: [0070](README.md) changes what a detached host does
with a session's window when the run in it ends. Since
[0031](../0031-detached-session-hosting/README.md) every such window was kept, dead, until a resume
or a close cleared it. Now the host closes the window of a run that exits cleanly (status 0) by
itself, and keeps only the window of a run that failed or was killed. When the closed window was the
host's last, the host ends by its own rule, as it does after a close.

## IF-001 — the seam does not say what becomes of hosting whose run has ended by itself

- **Slice:** [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md),
  _Constraints_ ("Live state is torn down by the lifecycle, not by hygiene").
- **Friction:** the constraint names one act that tears down a session's live hosting — the
  deliberate close — and one thing every other pass must do with what it finds — report it. Its
  _why_ is about a live process: "killing a live session discards an agent's unrecorded working
  state". It is silent on the third case building keeps meeting: a run that ended by itself, leaving
  behind hosting that holds no process. Read strictly, that remainder is still "that session's own
  live hosting" and only a close may remove it — which is what 0031 built, and what made every
  finished conversation leave a dead window standing. Read by its _why_, the remainder is not live
  state at all, and removing it discards nothing.
- **Assumption made to keep moving:** the constraint protects running processes. What a run leaves
  when it exits is the host's to keep or drop by a rule fixed at the window's creation; dropping it
  for a clean exit is not a teardown and spends no authority, because nothing is ended that had not
  already ended itself. No pass of Ward's removes it — the host does, at the moment of the exit.
- **Proposed revision:** add one sentence to the constraint: "What a run leaves behind when it ends
  by itself is not live state: a host may keep it to show how the run ended or let it go, by a rule
  set when the session was placed, and letting it go is not a teardown." This holds for any host
  technique, and keeps the constraint's force where its _why_ puts it — on anything still running.
- **Status:** pending.
