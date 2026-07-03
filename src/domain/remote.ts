// Remote linkage + PR tracking (work-lifecycle, remote-provider). A task's remote
// link is an ATTRIBUTE, not its identity — a local-only task can be attached
// later. Ward tracks the PR set as part of task state: `in-review` derives from
// the open PRs, and a task closes only when ALL its PRs are merged.

import { readdir } from 'node:fs/promises';
import { readAs, writeDocument } from '../store/doc.ts';
import { appendEvent, type Clock, systemClock } from '../store/log.ts';
import { logDir, prDoc, prsDir, taskDir, taskDoc } from '../store/paths.ts';
import { type Pr, prSchema, type RemotePrStateValue, type Task } from '../store/schemas.ts';
import { resolveProjectDir } from '../store/workspace.ts';
import { closeTask, loadTask } from './task.ts';

export interface RemoteLink {
  provider: string;
  id: string;
  url?: string;
}

export interface RemoteOptions {
  now?: Clock;
}

/** Attach a task to a remote work item (identity stays stable; the link is an attribute). */
export async function linkTaskToRemote(
  root: string,
  floor: number,
  slug: string,
  link: RemoteLink,
  opts: RemoteOptions = {},
): Promise<Task> {
  const now = opts.now ?? systemClock;
  const task = await loadTask(root, floor, slug);
  const linked: Task = {
    ...task,
    remote: {
      provider: link.provider,
      id: link.id,
      ...(link.url === undefined ? {} : { url: link.url }),
    },
  };
  const dir = taskDir(await resolveProjectDir(root, floor), slug);
  await writeDocument(taskDoc(dir), linked);
  await appendEvent(
    logDir(dir),
    { kind: 'task-remote-linked', data: { provider: link.provider, id: link.id } },
    now,
  );
  return linked;
}

export interface TrackPrInput {
  floor: number;
  taskSlug: string;
  repo: string;
  provider: string;
  number?: number;
  url?: string;
  id?: string;
  state?: RemotePrStateValue;
  now?: Clock;
}

export async function trackPr(root: string, input: TrackPrInput): Promise<Pr> {
  const now = input.now ?? systemClock;
  const dir = taskDir(await resolveProjectDir(root, input.floor), input.taskSlug);
  const id = input.id ?? `${input.repo}-${input.number ?? (await nextPrOrdinal(dir))}`;
  const pr: Pr = {
    type: 'pr',
    id,
    floor: input.floor,
    taskSlug: input.taskSlug,
    repo: input.repo,
    provider: input.provider,
    state: input.state ?? 'open',
    ...(input.number === undefined ? {} : { number: input.number }),
    ...(input.url === undefined ? {} : { url: input.url }),
  };
  await writeDocument(prDoc(dir, id), pr);
  await appendEvent(logDir(dir), { kind: 'pr-tracked', data: { id, state: pr.state } }, now);
  return pr;
}

export async function advancePrState(
  root: string,
  floor: number,
  slug: string,
  id: string,
  state: RemotePrStateValue,
  opts: RemoteOptions = {},
): Promise<Pr> {
  const now = opts.now ?? systemClock;
  const dir = taskDir(await resolveProjectDir(root, floor), slug);
  const pr = (await readAs(prDoc(dir, id), prSchema)).doc;
  const next: Pr = { ...pr, state };
  await writeDocument(prDoc(dir, id), next);
  await appendEvent(logDir(dir), { kind: 'pr-advanced', data: { id, state } }, now);
  return next;
}

export async function listPrs(root: string, floor: number, slug: string): Promise<Pr[]> {
  const dir = taskDir(await resolveProjectDir(root, floor), slug);
  const files = await readdir(prsDir(dir)).catch(() => [] as string[]);
  const prs: Pr[] = [];
  for (const file of files.filter((n) => n.endsWith('.md'))) {
    prs.push((await readAs(prDoc(dir, file.replace(/\.md$/, '')), prSchema)).doc);
  }
  return prs.sort((a, b) => a.id.localeCompare(b.id));
}

/** Count of PRs not yet merged — the source of the derived `in-review` overlay. */
export async function openPrCount(root: string, floor: number, slug: string): Promise<number> {
  return (await listPrs(root, floor, slug)).filter((p) => p.state !== 'merged').length;
}

/** Close a task, guarding the completion rule: all its PRs must be merged first. */
export async function completeTask(
  root: string,
  floor: number,
  slug: string,
  opts: RemoteOptions = {},
): Promise<Task> {
  const unmerged = (await listPrs(root, floor, slug)).filter((p) => p.state !== 'merged');
  if (unmerged.length > 0) {
    throw new Error(`cannot close ${floor}/${slug}: ${unmerged.length} PR(s) not merged`);
  }
  return closeTask(root, floor, slug, opts);
}

async function nextPrOrdinal(taskDirPath: string): Promise<number> {
  return (await readdir(prsDir(taskDirPath)).catch(() => [] as string[])).length + 1;
}
