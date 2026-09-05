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
- \`CLAUDE.md\` — a relative symlink to this AGENTS.md, so a harness that looks for that name
  reads the same guidance: one source of truth, nothing duplicated to drift.
- \`projects/\` — project records (floors), each with its tasks nested beside it. One is the
  standing workspace project (slug \`workspace\`, marked \`standing: true\` in its record): the
  home for work on the workspace itself — upgrades, migrations, reflections — and the one
  project that never closes.
- \`tasks/\` — bare tasks opened directly under the workspace (levels are elided, not faked).
- \`sessions/\` — sessions opened at **workspace scope**: the ones responsible for the workspace
  itself rather than for any one task. A task's sessions live beside its task record instead.
- \`repositories/\` — the records of registered repositories (one document each).
- \`repos/\` — canonical checkouts of registered repositories, kept fresh and never worked in
  directly.
- \`worktrees/\` — per-task worktrees, where changes are actually made, one directory per
  task address and branch.
- \`.ward/\` — Ward's store internals and bookkeeping, including the store write lock and local
  usage telemetry (\`telemetry/\`, untracked — it never leaves the workspace); nothing in it is
  meant to be edited by hand.

## Operating here

- Run \`ward doctor\` to check machine preconditions and the record's integrity.
- Records are markdown with typed front matter — read them directly; that is what they are for.
- **A task is addressed \`f<floor>t<room>\`** — \`f3t1\` is room 1 on floor 3 — and a task with no
  floor is addressed \`t<room>\`. Spelling is case-insensitive. A bare \`t1\` is a shorthand that
  works while exactly one open task holds that room; when several do, Ward names them and asks
  for one.
- Standing inside a task's worktree, task-addressed verbs need no address — Ward derives the task
  from the working directory (\`ward task pr URL\`, \`ward worktree rebase\`) and echoes what it
  derived. An explicit address always works, and \`ward task close\` always takes one.
- \`ward status\`, \`ward task list\`, and \`ward project list\` show what is in flight: work
  closed more than a week ago drops off the listing, and \`--all\` brings it back. A closed task
  is shown by its slug, not its room — the room belongs to whoever holds it next.
- **A floor may claim repositories** (\`ward project claim FLOOR NAME\`, \`ward project release
  FLOOR NAME\`, or \`--repo\` at \`ward project open\`). A claim is a **routing default**, never
  a rule about what a floor's tasks may touch: \`ward task open SLUG --repo NAME\` records what
  the task touches and, with no \`--project\`, opens it on the claiming floor. \`--project\`
  always wins. Moving a claim changes where new work lands and leaves open tasks where they are —
  Ward says so when it moves one.
- Work is never committed to a repository's main line directly; changes travel through a worktree
  and a pull request.
- When a main line moves under work in progress, \`ward worktree rebase\` replays the task's
  worktrees onto the refreshed tip — never through a dirty tree, and a conflict aborts cleanly,
  leaving the worktree exactly as it was.

## Sessions — Ward opens them, and starts the agent

A session is one bounded episode of an agent working at a scope. **Ward opens sessions, and the
open is what starts the agent** — there is no id to copy by hand:

- \`ward session open [--purpose TEXT]\` opens a session at **workspace scope** (the workspace
  itself is what it is responsible for), records it, and **launches the agent in it**, in the
  workspace root — \`--purpose\` is optional here: left out, the record says
  \`Coordinating work · opened <time>\`. Ward assigns the harness handle before the process starts and sets
  \`WARD_AGENT\` in its environment, so the new session is declared from its first command and
  nothing about Ward has to be explained to it.
- **A session id names the machine it ran on**, and a number is never reused:
  \`workspace-7@mbp\` is workspace session seven, on \`mbp\`. A session is bound to the computer
  holding its harness history while this record travels, so two machines sharing one workspace
  never mint the same id and a closed session's record is never written over. Ids recorded before
  this rule carry no \`@\` and keep working unchanged. \`ward doctor\` says what this machine is
  called (set \`machine:\` in \`~/.config/ward/config.md\` to name it yourself).
- **When the agent exits, the session stays open.** An exit is not a close: open and running are
  different things. Pick it back up with \`ward session resume ID\` — same conversation, same
  handle, in the directory it ran in — or end it with \`ward session close ID\`. At a terminal,
  Ward asks once whether to close it when the run exits, defaulting to yes only when the run left
  no history at all; \`--on-exit keep|close\` answers in advance, and nothing is ever asked of an
  agent, a \`--json\` invocation, or a caller without a terminal.
- \`ward status\` lists the open workspace-scope sessions, each saying whether its harness history
  is on this machine — so a session with nothing to resume is visible, with the command that ends
  it. \`ward session resume\` refuses a session whose history is on another machine, naming the
  machine that can resume it, rather than starting a run that can only fail.
- \`ward session locate ID\` resolves a session's handle to the harness's own history, reporting
  **found** (with the path) or **gone** — asked of THIS machine, and naming the machine the run
  stood on. Gone is a normal answer: retention belongs to the harness, not to Ward, and the
  session record is what survives it.
- **What the agent is started with** is configuration on two axes: your defaults in
  \`~/.config/ward/config.md\` (\`agent.model\`, \`agent.effort\`, \`agent.args\`, \`agent.harness\`,
  and \`agent.command\` — how the harness is invoked on this machine, \`[npx, claude]\` where
  \`claude\` cannot be run directly) overridden **per key** by an \`agent:\` block in
  \`workspace.md\`. A key set nowhere is passed as nothing at all — the harness's own default
  then applies. \`ward doctor\` prints the resolved answer with the layer each key came from,
  and checks that the command can be found.
- **Sessions Ward did not launch record themselves.** \`ward session open --purpose TEXT --handle
  HANDLE\` (and \`ward session open TASK --purpose TEXT\` for a task) records without launching —
  the path for an agent that is already running, like the one reading this file. Put your
  harness's own run id in \`--handle\` (for Claude Code: \`claude:<session-id>\`) so the run can
  be located again.

## Driving \`ward\` as an agent

You may be reading this from the workspace root or from inside a task worktree under
\`worktrees/\` — the workspace above you is the record of the work either way. Drive it with
\`ward\`:

- **Declare yourself.** Set \`WARD_AGENT=1\` in the environment before calling \`ward\` — or,
  better, set it to your session id once you have one. (A session Ward launched is born with it
  already set.) A declared agent gets plain, deterministic output and is never given an
  interactive prompt.
- **Run \`ward\` commands concurrently when it helps.** Store writes serialize on a lock
  (\`.ward/store.lock\`) that names its holder; a write that cannot get it in time refuses
  legibly — rerun it. A lock left by a crashed process is taken over automatically, and
  \`ward doctor\` names a held or stale lock. Read verbs never wait on it.
- **Read state as JSON.** \`ward status --json\` says where everything stands; every read verb
  (\`status\`, \`project list\`, \`task list\`, \`worktree list\`, \`repo list\`, \`doctor\`)
  accepts \`--json\`.
- **Mutations report as JSON too.** Every mutation verb accepts \`--json\` and emits its report —
  steps, per-item outcomes, and any named trusts — as one document on stdout. A refusal (a gated
  close, a bad argument) emits no document: the error stays on stderr with a nonzero exit, so
  parse stdout only when the exit code says the verb ran.
- **Discover the contract from the tool.** \`ward schema\` emits the JSON Schema of every
  \`--json\` verb's output (one verb: \`ward schema task list\`). The shapes ship inside the
  binary, so they are always current for the \`ward\` you are running — no repo reading needed.
- **Record your session.** If Ward launched you, it is already recorded and \`WARD_AGENT\` holds
  its id — nothing to do. If it did not, record yourself before you start work:
  \`ward session open TASK --purpose TEXT --handle HANDLE\` (see **Sessions**, above).
- **Name the task explicitly.** Deriving the task from the working directory is a human
  affordance; a declared agent is refused it and passes the **full address** (\`f3t22\`) on every
  task-addressed verb, read from \`address\` in \`--json\` (\`ward task list --json\` says what
  exists; its \`hidden\` block says what the settled-work window left out).
- **Work in the task's worktree** under \`worktrees/\`, never in \`repos/\` — the canonical
  checkouts are reference copies of each repository's main line. \`ward worktree create ADDRESS\`
  needs no \`--repo\` when the task record names exactly one repository; with none or several
  recorded, name it.
- **Stay atop the main line.** When it moves, \`ward worktree rebase ADDRESS\` rebases the task's
  worktrees onto the refreshed tip. A dirty tree is refused; a conflict is aborted and reported
  with the tree left as found — resolving it is your work, then rerun. It never pushes: publish
  a rewritten branch yourself with \`git push --force-with-lease\`.
- **Link your pull request.** \`ward task pr ADDRESS URL\` records it on the task; review state is
  read live from the forge, never stored.
- **Closing is gated.** \`ward task close\` requires the PR set resolved and tears down
  worktrees — leave it to the human unless that authority was explicitly delegated to you.
- **Never merge or push to a repository's main line.** Work reaches a main line only through a
  pull request, and resolving one is the human's act.

This file is yours: sharpen it as the workspace learns how it likes to work.
`;

export const WARD_INTERNAL_README = `# Ward store internals

This directory marks the workspace root for the \`ward\` CLI and holds store mechanics: the
staging area for atomic writes (\`tmp/\`); the store write lock (\`store.lock\`), which appears
only while a write is in flight and names its holder — a lock whose holder is gone is taken
over automatically, and \`ward doctor\` names its state; local usage telemetry
(\`telemetry/\`, untracked — local and personal, it never leaves the workspace); and Ward's own
bookkeeping — \`baselines.md\`, the fingerprints of what Ward installed, which is how an upgrade
tells customized from untouched. Nothing in it is meant to be edited by hand.
`;

export const WORKSPACE_RECORD_BODY = `This is the workspace record: the identity of this workspace
and the Ward version that created it. It is written by \`ward\` and read by every command that
operates here.`;

export const CATALOG_BODY = `The artifact types this workspace can produce. Ward seeds the set; it
is open and workspace-evolvable — a future entry adds registration of new types.`;
