// The installed content workspace creation puts in place. AGENTS.md is
// yours-tier (intent/01-concepts/06-workspace-lifecycle.md): a starting point
// the workspace's human and agents are expected to sharpen. Ward records a
// baseline hash of each installed artifact (design/0005-agent-audience/), so
// a future upgrade can tell customized from untouched — and propose, not
// overwrite.

export const AGENTS_MD = `# Ward Workspace

This directory is a Ward workspace: a structured, self-sufficient record of work in progress,
operated with the \`ward\` CLI and tracked in git.

## Layout

- \`workspace.md\` — the workspace record: its identity and the Ward version that created it.
- \`catalog.md\` — the artifact types this workspace can produce.
- \`projects/\` — project records (floors), each with its tasks nested beside it.
- \`tasks/\` — bare tasks opened directly under the workspace (levels are elided, not faked).
- \`repositories/\` — the records of registered repositories (one document each).
- \`repos/\` — canonical checkouts of registered repositories, kept fresh and never worked in
  directly.
- \`worktrees/\` — per-task worktrees, where changes are actually made.
- \`.ward/\` — Ward's store internals and bookkeeping; nothing in it is meant to be edited by
  hand.

## Operating here

- Run \`ward doctor\` to check machine preconditions and the record's integrity.
- Records are markdown with typed front matter — read them directly; that is what they are for.
- Work is never committed to a repository's main line directly; changes travel through a worktree
  and a pull request.

## Driving \`ward\` as an agent

You may be reading this from the workspace root or from inside a task worktree under
\`worktrees/\` — the workspace above you is the record of the work either way. Drive it with
\`ward\`:

- **Declare yourself.** Set \`WARD_AGENT=1\` in the environment before calling \`ward\` — or,
  better, set it to your session id once you have one. A declared agent gets plain,
  deterministic output and is never given an interactive prompt.
- **Read state as JSON.** \`ward status --json\` says where everything stands; every read verb
  (\`status\`, \`project list\`, \`task list\`, \`worktree list\`, \`repo list\`, \`doctor\`)
  accepts \`--json\`.
- **Record your session.** \`ward session open TASK --purpose TEXT --handle HANDLE\` before you
  start work; put your harness's own run id in \`--handle\` so the run can be located again.
- **Work in the task's worktree** under \`worktrees/\`, never in \`repos/\` — the canonical
  checkouts are reference copies of each repository's main line.
- **Link your pull request.** \`ward task pr CODE URL\` records it on the task; review state is
  read live from the forge, never stored.
- **Closing is gated.** \`ward task close\` requires the PR set resolved and tears down
  worktrees — leave it to the human unless that authority was explicitly delegated to you.
- **Never merge or push to a repository's main line.** Work reaches a main line only through a
  pull request, and resolving one is the human's act.

This file is yours: sharpen it as the workspace learns how it likes to work.
`;

export const WARD_INTERNAL_README = `# Ward store internals

This directory marks the workspace root for the \`ward\` CLI and holds store mechanics: the
staging area for atomic writes (\`tmp/\`), locks when they become necessary, and Ward's own
bookkeeping — \`baselines.md\`, the fingerprints of what Ward installed, which is how an upgrade
tells customized from untouched. Nothing in it is meant to be edited by hand.
`;

export const WORKSPACE_RECORD_BODY = `This is the workspace record: the identity of this workspace
and the Ward version that created it. It is written by \`ward\` and read by every command that
operates here.`;

export const CATALOG_BODY = `The artifact types this workspace can produce. Ward seeds the set; it
is open and workspace-evolvable — a future entry adds registration of new types.`;
