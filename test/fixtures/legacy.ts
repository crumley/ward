// Byte-exact historical installed defaults, for building fixture workspaces
// in the live bootstrap workspace's shape (design/0020-deterministic-upgrade/).
// LEGACY_AGENTS_MD is the AGENTS.md a c7962cc-era ward (design 0004) installed
// — the untouched original still standing in the live workspace — and
// LEGACY_WARD_README is the a71b091-era .ward/README.md (design 0002). The
// lineage tests pin their sha256 against the live workspace's, so a
// transcription error here cannot pass silently.

export const LEGACY_AGENTS_MD = `# Ward Workspace

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
- \`.ward/\` — Ward's store internals; nothing in it is meant to be read or edited.

## Operating here

- Run \`ward doctor\` to check machine preconditions and the record's integrity.
- Records are markdown with typed front matter — read them directly; that is what they are for.
- Work is never committed to a repository's main line directly; changes travel through a worktree
  and a pull request.

This file is yours: sharpen it as the workspace learns how it likes to work.
`;

export const LEGACY_WARD_README = `# Ward store internals

This directory marks the workspace root for the \`ward\` CLI and holds store mechanics (staging
area for atomic writes, and locks when they become necessary). Nothing in it is meant to be read
or edited by hand.
`;
