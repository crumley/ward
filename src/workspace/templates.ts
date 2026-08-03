// The installed content workspace creation puts in place. AGENTS.md is
// yours-tier (intent/01-concepts/06-workspace-lifecycle.md): a starting point
// the workspace's human and agents are expected to sharpen. It is written
// once and never touched again by Ward at this version.

export const AGENTS_MD = `# Ward Workspace

This directory is a Ward workspace: a structured, self-sufficient record of work in progress,
operated with the \`ward\` CLI and tracked in git.

## Layout

- \`workspace.md\` — the workspace record: its identity and the Ward version that created it.
- \`catalog.md\` — the artifact types this workspace can produce.
- \`projects/\` — project and task records, as work comes to exist.
- \`repos/\` — canonical checkouts of registered repositories, kept fresh and never worked in
  directly.
- \`worktrees/\` — per-task worktrees, where changes are actually made.
- \`.ward/\` — Ward's store internals; nothing in it is meant to be read or edited.

## Operating here

- Run \`ward doctor\` to check machine preconditions and the record's integrity.
- Records are markdown with typed front matter — read them directly; that is what they are for.
- Work is never committed to a repository's main line directly; changes travel through a worktree
  and a pull request.

This file is yours: sharpen it as the workspace learns how it likes to work.
`;

export const WARD_INTERNAL_README = `# Ward store internals

This directory marks the workspace root for the \`ward\` CLI and holds store mechanics (staging
area for atomic writes, and locks when they become necessary). Nothing in it is meant to be read
or edited by hand.
`;

export const WORKSPACE_RECORD_BODY = `This is the workspace record: the identity of this workspace
and the Ward version that created it. It is written by \`ward\` and read by every command that
operates here.`;

export const CATALOG_BODY = `The artifact types this workspace can produce. Ward seeds the set; it
is open and workspace-evolvable — a future entry adds registration of new types.`;
