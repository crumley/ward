// Worktrees (design/0004-work-spine/): created off the refreshed canonical
// checkout as worktrees *of* it, so branches live in the one repository the
// record names and teardown is `git worktree remove`. Disposition is recorded
// from day one; this entry builds only `deliverable`
// (intent/01-concepts/00-domain-model.md, Anchor).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { repositoryRecordType, type WorktreeRecord, worktreeRecordType } from '../store/types.ts';
import { git } from './git.ts';
import { refreshRepositories } from './repos.ts';
import { commitRecords, type FoundTask, readTasks, resolveOpenTask } from './scan.ts';

export async function createWorktree(
  root: string,
  taskCode: string,
  repoName: string,
  branchInput?: string,
): Promise<{ task: FoundTask; record: WorktreeRecord }> {
  const task = await resolveOpenTask(root, taskCode);
  if (!existsSync(join(root, repositoryRecordType(repoName).relPath))) {
    throw new WardError(`no repository named '${repoName}' is registered — see: ward repo list`);
  }
  const repoRecord = (await readDocument(root, repositoryRecordType(repoName))).data;
  const branch = branchInput ?? task.record.slug;
  const fileName = `${repoName}--${branch.replaceAll('/', '-')}`;
  const recordType = worktreeRecordType(task.dir, fileName);
  const path = `worktrees/${task.record.code}-${branch.replaceAll('/', '-')}`;

  if (existsSync(join(root, recordType.relPath))) {
    const existing = (await readDocument(root, recordType)).data;
    if (existsSync(join(root, existing.path))) {
      return { task, record: existing }; // convergent: already there
    }
  }

  // Branch from current code: the refresh the cadence would have done.
  await refreshRepositories(root, repoName);

  const canonical = join(root, 'repos', repoName);
  const result = git(
    canonical,
    'worktree',
    'add',
    '-b',
    branch,
    join(root, path),
    `origin/${repoRecord.mainLine}`,
  );
  if (result.exitCode !== 0) {
    throw new WardError(`git worktree add failed: ${result.stderr.trim()}`);
  }

  const record: WorktreeRecord = {
    type: 'worktree',
    repo: repoName,
    branch,
    disposition: 'deliverable',
    path,
    createdAt: new Date().toISOString(),
  };
  await writeDocument(root, recordType, {
    data: record,
    body:
      `Worktree of \`${repoName}\` on branch \`${branch}\`, occupied for task ` +
      `\`${task.record.code}\`. Deliverable: its changes reach the main line only through a ` +
      'pull request.',
  });
  commitRecords(root, `Create worktree ${branch} for task ${taskCode}`, task.dir);
  return { task, record };
}

export async function readTaskWorktrees(root: string, taskDir: string): Promise<WorktreeRecord[]> {
  const dir = join(root, taskDir, 'worktrees');
  if (!existsSync(dir)) return [];
  const records: WorktreeRecord[] = [];
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    const type = worktreeRecordType(taskDir, file.slice(0, -3));
    records.push((await readDocument(root, type)).data);
  }
  return records;
}

export interface WorktreeListing {
  readonly taskCode: string;
  readonly record: WorktreeRecord;
  readonly present: boolean;
}

export async function listWorktrees(root: string): Promise<WorktreeListing[]> {
  const listings: WorktreeListing[] = [];
  for (const task of await readTasks(root)) {
    for (const record of await readTaskWorktrees(root, task.dir)) {
      listings.push({
        taskCode: task.record.code,
        record,
        present: existsSync(join(root, record.path)),
      });
    }
  }
  return listings;
}
