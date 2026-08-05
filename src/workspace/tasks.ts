// The task lifecycle (design/0004-work-spine/): open → active, pause/resume,
// the PR-link set, and the close — outcome delivered|abandoned recorded at
// close, completion gated on the PR set resolved, teardown gated where it
// would destroy unmerged deliverable work (§18)
// (intent/01-concepts/03-work-lifecycle.md).
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import {
  type SessionRecord,
  sessionRecordType,
  type TaskRecord,
  taskRecordType,
  type WorktreeRecord,
} from '../store/types.ts';
import { git } from './git.ts';
import { taskContainer } from './projects.ts';
import { refreshRepositories } from './repos.ts';
import {
  commitRecords,
  type FoundTask,
  readTasks,
  requireSlug,
  resolveOpenTask,
  smallestFree,
} from './scan.ts';
import { readSessions } from './sessions.ts';
import { readTaskWorktrees } from './worktrees.ts';

export interface OpenTaskOptions {
  readonly floor?: number;
  readonly purpose?: string;
}

export async function openTask(
  root: string,
  slugInput: string,
  options: OpenTaskOptions,
): Promise<FoundTask> {
  const slug = requireSlug(slugInput);
  const container = await taskContainer(root, options.floor);
  const openCodes = (await readTasks(root))
    .filter((task) => task.record.state !== 'closed')
    .map((task) => Number.parseInt(task.record.code.replace(/^t/, ''), 10))
    .filter((code) => !Number.isNaN(code));
  const code = `t${smallestFree(openCodes)}`;
  const dir = `${container}/${code}-${slug}`;
  const record: TaskRecord = {
    type: 'task',
    code,
    slug,
    state: 'active',
    ...(options.floor === undefined ? {} : { floor: options.floor }),
    ...(options.purpose === undefined ? {} : { purpose: options.purpose }),
    prs: [],
    openedAt: new Date().toISOString(),
  };
  await writeDocument(root, taskRecordType(dir), {
    data: record,
    body:
      `The \`${slug}\` task, addressed by its bare code \`${code}\` while open. Its worktree ` +
      'and session records nest beside this document; its status is stored here, at the leaf.',
  });
  commitRecords(root, `Open task ${slug} (${code})`, dir);
  return { dir, record };
}

export async function setTaskState(
  root: string,
  code: string,
  state: 'active' | 'paused',
): Promise<FoundTask> {
  const task = await resolveOpenTask(root, code);
  if (task.record.state === state) return task;
  const record: TaskRecord = { ...task.record, state };
  await writeTask(root, task.dir, record);
  commitRecords(root, `${state === 'paused' ? 'Pause' : 'Resume'} task ${code}`, task.dir);
  return { dir: task.dir, record };
}

export async function addTaskPr(root: string, code: string, url: string): Promise<FoundTask> {
  const task = await resolveOpenTask(root, code);
  if (task.record.prs.includes(url)) return task;
  const record: TaskRecord = { ...task.record, prs: [...task.record.prs, url] };
  await writeTask(root, task.dir, record);
  commitRecords(root, `Link PR to task ${code}`, task.dir);
  return { dir: task.dir, record };
}

// -- close ----------------------------------------------------------------

export type Outcome = 'delivered' | 'abandoned';

export interface CloseStep {
  readonly step: string;
  readonly detail: string;
}

export interface CloseReport {
  readonly task: FoundTask;
  readonly outcome: Outcome;
  readonly steps: readonly CloseStep[];
}

export async function closeTask(
  root: string,
  code: string,
  outcome: Outcome,
): Promise<CloseReport> {
  const task = await resolveOpenTask(root, code);
  const steps: CloseStep[] = [];

  // Every gate is checked before anything mutates: a refused close must
  // leave the task exactly as it found it, or retrying it closes less than
  // the first attempt did (§6 — the only safe operation repeats cleanly).
  steps.push(await resolvePrSet(task.record, outcome));
  const worktrees = await readTaskWorktrees(root, task.dir);
  for (const worktree of worktrees) {
    validateTeardown(root, task.record, worktree, outcome);
  }

  const sessions = await readSessions(root, task.dir);
  const open = sessions.filter((session) => session.state === 'open');
  for (const session of open) {
    const closed: SessionRecord = {
      ...session,
      state: 'closed',
      closedAt: new Date().toISOString(),
    };
    await writeDocument(root, sessionRecordType(task.dir, session.id), {
      data: closed,
      body: `Session \`${session.id}\` of task \`${task.record.code}\`.`,
    });
  }
  steps.push({
    step: 'sessions',
    detail: open.length === 0 ? 'none open' : `closed ${open.map((s) => s.id).join(', ')}`,
  });

  for (const worktree of worktrees) {
    steps.push(removeWorktree(root, worktree, outcome));
  }
  if (worktrees.length === 0) steps.push({ step: 'worktrees', detail: 'none to tear down' });

  const record: TaskRecord = {
    ...task.record,
    state: 'closed',
    outcome,
    closedAt: new Date().toISOString(),
  };
  await writeTask(root, task.dir, record);
  commitRecords(root, `Close task ${code} (${outcome})`, task.dir);
  steps.push({ step: 'record', detail: `closed with outcome ${outcome}` });

  for (const worktree of worktrees) {
    await refreshRepositories(root, worktree.repo).catch(() => undefined);
  }

  return { task: { dir: task.dir, record }, outcome, steps };
}

/**
 * Completion requires the PR set resolved (every PR merged for a delivered
 * close). With gh available the forge is asked; without it, the human's
 * stated outcome is trusted and the trust is reported.
 */
async function resolvePrSet(record: TaskRecord, outcome: Outcome): Promise<CloseStep> {
  const step = 'pr set';
  if (record.prs.length === 0) return { step, detail: 'no linked PRs' };
  if (Bun.which('gh') === null) {
    return { step, detail: `gh not available — trusting the stated outcome '${outcome}'` };
  }
  const states: string[] = [];
  for (const url of record.prs) {
    const result = Bun.spawnSync(['gh', 'pr', 'view', url, '--json', 'state', '--jq', '.state'], {
      env: { ...process.env },
    });
    if (result.exitCode !== 0) {
      return { step, detail: `could not read ${url} — trusting the stated outcome '${outcome}'` };
    }
    states.push(result.stdout.toString().trim());
  }
  if (states.some((state) => state === 'OPEN')) {
    throw new WardError(
      'a linked PR is still open — merge or close it first, or pause the task instead',
    );
  }
  if (outcome === 'delivered' && states.some((state) => state !== 'MERGED')) {
    throw new WardError(
      'a linked PR was closed without merging — a delivered close requires every PR merged; ' +
        'use --outcome abandoned if this work is being set aside',
    );
  }
  return { step, detail: `resolved (${states.join(', ')})` };
}

/**
 * The §18 gate, checked before anything mutates: a dirty tree or, for a task
 * with no PR record, a branch ahead of the main line refuses a delivered
 * close — `--outcome abandoned` is the explicit authority that forces it.
 */
function validateTeardown(
  root: string,
  task: TaskRecord,
  worktree: WorktreeRecord,
  outcome: Outcome,
): void {
  if (outcome !== 'delivered') return;
  const absolute = join(root, worktree.path);
  if (!existsSync(absolute)) return;
  const canonical = join(root, 'repos', worktree.repo);
  if (git(absolute, 'status', '--porcelain').stdout.trim() !== '') {
    throw new WardError(
      `${worktree.path} has uncommitted changes — commit or discard them, ` +
        'or close with --outcome abandoned to discard the worktree',
    );
  }
  if (task.prs.length === 0 && aheadOfMain(canonical, worktree.branch)) {
    throw new WardError(
      `${worktree.path} holds commits that never reached a PR — open one and link it ` +
        '(ward task pr), or close with --outcome abandoned to discard them',
    );
  }
}

function removeWorktree(root: string, worktree: WorktreeRecord, outcome: Outcome): CloseStep {
  const step = `worktree ${worktree.path}`;
  const absolute = join(root, worktree.path);
  const canonical = join(root, 'repos', worktree.repo);
  if (!existsSync(absolute)) {
    git(canonical, 'worktree', 'prune');
    return { step, detail: 'already gone' };
  }
  const args =
    outcome === 'abandoned'
      ? ['worktree', 'remove', '--force', absolute]
      : ['worktree', 'remove', absolute];
  const result = git(canonical, ...args);
  if (result.exitCode !== 0) {
    throw new WardError(`cannot remove ${worktree.path}: ${result.stderr.trim()}`);
  }
  return { step, detail: outcome === 'abandoned' ? 'discarded' : 'removed' };
}

function aheadOfMain(canonical: string, branch: string): boolean {
  const mainLine = git(canonical, 'symbolic-ref', '--short', 'HEAD').stdout.trim();
  const count = git(canonical, 'rev-list', '--count', `${mainLine}..${branch}`);
  return count.exitCode === 0 && Number.parseInt(count.stdout.trim(), 10) > 0;
}

async function writeTask(root: string, dir: string, record: TaskRecord): Promise<void> {
  const existing = await readDocument(root, taskRecordType(dir));
  await writeDocument(root, taskRecordType(dir), { data: record, body: existing.body });
}
