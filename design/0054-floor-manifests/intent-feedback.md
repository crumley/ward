# 0054 — Intent feedback

> Intent frictions found while building floor manifests.

This file is the entry's adjudication surface and is read on its own. An adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

## IF-001 — context is keyed to the working directory, but a floor session does not stand in its floor

- **Slice:**
  [`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md) —
  _Context loads from an `AGENTS.md` hierarchy keyed to the working directory_ ("loaded relative to
  the session's working directory"; "where you start determines what you load"). Read it against
  [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) — _Working
  directory: the second axis_, which chooses a session's working directory apart from its scope.

- **Friction:** this entry gives every floor a manifest, the `AGENTS.md` for that level. The slice
  says a session loads the manifest of the directory it stands in. Floor-scope sessions
  (design 0051) stand at the workspace root by design: a project directory is a record directory,
  and the root is where a coordinating agent reads every floor from. So the one session a floor's
  manifest is written for is the one session that the working-directory rule never takes to it.
  Under the slice as written, there are two ways to load the floor's knowledge. One is to move the
  session into its floor's directory, which undoes 0051's decision. The other is to load it some
  other way, which the slice does not name.

- **Assumption made to keep moving:** a session loads the manifest of its **working directory and of
  its scope**. When the scope's directory is not the working directory, Ward points the session at
  the scope's manifest when it starts it. Here, a launched floor session is started with
  `WARD_FLOOR_MANIFEST`, naming its floor's `AGENTS.md`, and the root manifest tells the agent to
  read it first. The working directory still decides everything else the session loads.

- **Proposed revision:** in `05-context-loading.md`, retitle the section _Context loads from an
  `AGENTS.md` hierarchy keyed to the working directory and the scope_ and add one bullet. A session
  whose scope has a manifest of its own loads it, even when its working directory is elsewhere. Ward
  names that manifest to the session when it starts it, because the scope is a fact Ward recorded,
  and finding the file is not something to leave to the agent. Keep the _why keyed to working
  directory_ paragraph, and add the reason the scope is a second key: the axes are chosen
  independently, so a manifest keyed to only one of them misses every session whose two axes differ.

- **Status:** pending
