// Session records (design/0004-work-spine/): recorded, not managed — the
// record carries what recovery and reflection will one day need (purpose,
// working directory, the optional harness handle), and the human runs the
// agent themselves (intent/01-concepts/02-sessions-and-lifecycle.md).
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { type SessionRecord, sessionRecordType } from '../store/types.ts';
import { commitRecords, readTasks, resolveOpenTask, smallestFree } from './scan.ts';
import { readTaskWorktrees } from './worktrees.ts';

export interface OpenSessionOptions {
  readonly handle?: string;
  readonly workingDirectory?: string;
}

export async function openSession(
  root: string,
  taskCode: string,
  purpose: string,
  options: OpenSessionOptions,
): Promise<SessionRecord> {
  // The id-allocation scan through the commit is the serialized critical
  // section (§17, design/0013-telemetry-and-serialized-writes/).
  return withStoreLock(root, `session open ${taskCode}`, async () => {
    const task = await resolveOpenTask(root, taskCode);
    // Ids are unique among open sessions workspace-wide, so a bare id
    // addresses every operation; discriminators are reused only after close.
    const slug = task.record.slug;
    const taken = (await readOpenSessions(root))
      .filter((session) => session.record.id.startsWith(`${slug}-`))
      .map((session) => Number.parseInt(session.record.id.slice(slug.length + 1), 10))
      .filter((n) => !Number.isNaN(n));
    const id = `${slug}-${smallestFree(taken)}`;

    const worktrees = await readTaskWorktrees(root, task.dir);
    const workingDirectory = options.workingDirectory ?? worktrees[0]?.path ?? '.';

    const record: SessionRecord = {
      type: 'session',
      id,
      task: task.record.code,
      purpose,
      workingDirectory,
      ...(options.handle === undefined ? {} : { handle: options.handle }),
      state: 'open',
      openedAt: new Date().toISOString(),
    };
    await writeDocument(root, sessionRecordType(task.dir, id), {
      data: record,
      body: `Session \`${id}\` of task \`${task.record.code}\`.`,
    });
    commitRecords(root, `Open session ${id} on task ${taskCode}`, task.dir);
    return record;
  });
}

export async function closeSession(root: string, id: string): Promise<SessionRecord> {
  return withStoreLock(root, `session close ${id}`, async () => {
    const open = (await readOpenSessions(root)).find((session) => session.record.id === id);
    if (open === undefined) {
      throw new WardError(`no open session has id '${id}' — closed stays closed, and ids are bare`);
    }
    const record: SessionRecord = {
      ...open.record,
      state: 'closed',
      closedAt: new Date().toISOString(),
    };
    await writeDocument(root, sessionRecordType(open.taskDir, id), {
      data: record,
      body: `Session \`${id}\` of task \`${record.task}\`.`,
    });
    commitRecords(root, `Close session ${id}`, open.taskDir);
    return record;
  });
}

export async function readSessions(root: string, taskDir: string): Promise<SessionRecord[]> {
  const dir = join(root, taskDir, 'sessions');
  if (!existsSync(dir)) return [];
  const records: SessionRecord[] = [];
  for (const file of readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .sort()) {
    records.push((await readDocument(root, sessionRecordType(taskDir, file.slice(0, -3)))).data);
  }
  return records;
}

export interface OpenSessionListing {
  readonly taskDir: string;
  readonly record: SessionRecord;
}

/**
 * Every open session in the workspace. Exported since
 * design/0022-shell-completion/, so `session close ID` completes from the
 * very listing `closeSession` resolves against — one reader, so what the
 * shell offers and what the verb accepts cannot disagree.
 */
export async function readOpenSessions(root: string): Promise<OpenSessionListing[]> {
  const listings: OpenSessionListing[] = [];
  for (const task of await readTasks(root)) {
    for (const record of await readSessions(root, task.dir)) {
      if (record.state === 'open') listings.push({ taskDir: task.dir, record });
    }
  }
  return listings;
}
