# 0056 — Intent feedback

> Intent frictions found while building the worktree context bridge.

This file is the entry's adjudication surface and is read on its own. An adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

## IF-001 — an anchor's `AGENTS.md` is its repository's, so Ward's part there cannot be an `AGENTS.md`

- **Slice:**
  [`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md) —
  _Context loads from an `AGENTS.md` hierarchy keyed to the working directory_ ("A narrow-scope
  session started in a repository or anchor directory loads _that_ directory's `AGENTS.md`") and
  _Why harness-neutral_ (a harness-specific name is served by an adapter onto `AGENTS.md`, never a
  copy).

- **Friction:** a task worktree is an anchor, and its root is a checkout of a repository Ward does
  not own. The `AGENTS.md` or `CLAUDE.md` there is the repository's, tracked in its history and
  shared with everyone who clones it. The slice treats the anchor's `AGENTS.md` as the manifest for
  that level, the file that names what to load for the scope. But the scope's facts (the floor the
  task sits on, the task's brief) are the workspace's, and writing them into the repository's
  manifest would commit a workspace's private layout into a public history. The slice's adapter rule
  does not fit either. An adapter is a link onto a harness-neutral file, and the neutral file at an
  anchor is not Ward's. So Ward's contribution at an anchor has to be a separate file the harness
  merges beside the repository's own. The only such file a harness reads today has a harness-chosen
  name, Claude Code's `CLAUDE.local.md`, and there is no neutral counterpart.

- **Assumption made to keep moving:** at an anchor, the repository's manifest governs the code and
  Ward adds a **pointer** beside it: derived from the record, regenerable, excluded from the
  repository's history, and named as the harness names its local, untracked guidance. The root
  manifest, which every harness walking up from the anchor reaches, tells a harness that reads no
  such file to read the pointer. This is the working-directory rule kept, not the scope rule that
  [0055's IF-001](../0055-floor-manifests/intent-feedback.md) proposes. A worktree agent's working
  directory is its anchor, so the pointer reaches it where it stands.

- **Proposed revision:** in `05-context-loading.md`, add a bullet under the hierarchy section. An
  anchor is a checkout owned by its repository, whose manifest is the repository's. Ward's
  contribution there is a **pointer the harness merges beside it**, carrying the scope's context
  (the floor's manifest, the task's brief) by reference. It is derived from the record and
  regenerable, never part of the repository's history, and harness-named where the harness leaves no
  neutral choice. State the constraint and leave the filename to design. Add the _why_: the
  repository's manifest is shared with every clone, and the workspace's knowledge about its own work
  is not, so the two cannot live in one file.

- **Status:** declined — a custom, harness-specific context file written into each worktree and
  hidden by a git exclude works against the grain of how harnesses load guidance, and is
  non-standard and unreliable; context reaches a worktree through the standard `AGENTS.md` hierarchy
  instead, read downward from the workspace root ([#126](https://github.com/crumley/ward/pull/126))
