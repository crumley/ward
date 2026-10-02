# 0045 — Spec-feedback

> Intent frictions found while steering agents to read records through Ward.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — "a human or agent can read the state directly" invites agents past the read verbs

- **Slice:**
  [`intent/02-subsystems/00-metadata-store.md`](../../intent/02-subsystems/00-metadata-store.md),
  "Constraints any design must honor" (_Transparent and legible to both audiences_).
- **Friction:** the constraint says the filesystem realization lets "a human or agent … read the
  state directly", and the installed manifest carried that into an instruction to agents: "read them
  directly; that is what they are for". Agents followed it. They grepped record directories for
  answers that are partly derived rather than stored (the same slice's _aggregate status is
  derived_), and they coupled themselves to a layout the slice's _What this is NOT_ calls swappable.
  The constraint's purpose is transparency: nothing hidden, git-versionable, legible to whoever
  looks. Its wording reads as a recommended read path for agents, and that path is the one the
  deterministic-read constraint above it exists to replace.
- **Assumption made to keep moving:** transparency stands; the files remain legible to anyone. An
  agent's _operational_ reads go through Ward's read verbs, and where a verb is missing, that is a
  gap to name and close, not a reason to read the file. The manifest says so.
- **Proposed revision:** in _Transparent and legible to both audiences_, replace "so a human or
  agent can read the state directly and git can version it" with "so the state is never hidden — a
  human can read it directly and git can version it — while an agent acting on the state reads it
  through Ward's deterministic read verbs, since part of what a record means is derived rather than
  stored and the layout is not part of this contract".
- **Status:** pending.
