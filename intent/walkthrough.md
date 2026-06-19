# End-to-End Walkthrough

> **Layer:** intent · cross-cutting narrative. **Status:** placeholder skeleton.

One concrete scenario threaded through the **concepts**, to make the model tangible and to surface
gaps. Illustrative, not normative: where it conflicts with a slice, the slice wins.

Per the decision to avoid duplication, this stays **intent-flavored** — it threads the concepts and
links to subsystems for mechanism. It deliberately avoids naming tools; a concrete,
record-and-tool-naming version lives in `design/` only if it later earns its keep.

## Planned scenario

A human on their personal workspace adds a small feature to a shared service — _"export meal plans
as CSV"_ — touching one repository. Thread it through:

0. Cold open — the workspace (`concepts/work-hierarchy.md`).
1. Open a project — floor A (`concepts/work-hierarchy.md`, `concepts/identity.md`,
   `concepts/roles.md`).
2. Open a task — local-only (`concepts/delivery.md`, `concepts/roles.md`).
3. Create a worktree — setup hooks fire (`concepts/delivery.md`, `subsystems/theming.md`).
4. Brief and open a room — A1; dispatch and arm a wake (`concepts/roles.md`,
   `concepts/artifacts.md`, `subsystems/messaging.md`).
5. Deep work in the room — specialized context (`concepts/sessions.md`).
6. Report up, evaluate, iterate (`concepts/roles.md`, `subsystems/messaging.md`).
7. Present to attending; open the PR — gated, privacy-translated (`concepts/delivery.md`,
   `subsystems/remote-provider.md`).
8. Drive the PR to merge; rebase to stay current (`concepts/delivery.md`).
9. Close the task — disposition artifacts, cleanup, scope-boundary reflection
   (`concepts/artifacts.md`, `concepts/reflection.md`).
10. Reboot test — does it all come back? (`concepts/sessions.md`, recovery.)

End with **what this exercises** — the checklist of concepts a future intent change must not break.
