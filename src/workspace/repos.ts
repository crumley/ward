// The repository set (intent/01-concepts/06-workspace-lifecycle.md): register
// by adopt-or-clone converging on the contained canonical checkout under
// repos/<name>/, refresh it on demand — never through a dirty tree — and list
// what is registered. Records live at repositories/<name>.md, one per repo.
import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { type RepositoryRecord, repositoryRecordType } from '../store/types.ts';
import { git, gitOrThrow } from './git.ts';

export interface AddReport {
  readonly record: RepositoryRecord;
  /** 'registered' — new; 'converged' — record existed, checkout re-established; 'satisfied' — nothing to do. */
  readonly outcome: 'registered' | 'converged' | 'satisfied';
}

export type RefreshOutcome = 'refreshed' | 'current' | 'dirty' | 'failed';

export interface RefreshReport {
  readonly name: string;
  readonly outcome: RefreshOutcome;
  readonly detail: string;
}

export function checkoutPath(root: string, name: string): string {
  return join(root, 'repos', name);
}

// -- add ------------------------------------------------------------------

export async function addRepository(
  root: string,
  source: string,
  explicitName?: string,
): Promise<AddReport> {
  const local = isLocalSource(source);
  const name = explicitName ?? deriveName(source);
  const recordType = repositoryRecordType(name);
  const checkout = checkoutPath(root, name);

  // Adoption reads the source checkout's own origin, so the record points at
  // the real remote; a source with no origin is itself the remote of record.
  const remote = local ? (originOf(resolve(source)) ?? resolve(source)) : source;

  if (existsSync(join(root, recordType.relPath))) {
    const existing = (await readDocument(root, recordType)).data;
    if (existing.remote !== remote) {
      throw new WardError(
        `repository '${name}' is already registered with remote ${existing.remote} — ` +
          `refusing to overwrite it with ${remote}; use --name to register under another name`,
      );
    }
    if (existsSync(checkout)) return { record: existing, outcome: 'satisfied' };
    clone(local ? resolve(source) : source, checkout, local ? remote : null);
    ensureOnMainLine(checkout, existing.mainLine);
    return { record: existing, outcome: 'converged' };
  }

  if (!existsSync(checkout)) {
    clone(local ? resolve(source) : source, checkout, local ? remote : null);
  }
  const mainLine = detectMainLine(checkout, local ? resolve(source) : null);
  ensureOnMainLine(checkout, mainLine);
  const record: RepositoryRecord = {
    type: 'repository',
    name,
    remote,
    mainLine,
    registeredAt: new Date().toISOString(),
  };
  await writeDocument(root, recordType, {
    data: record,
    body:
      `The record of the \`${name}\` repository: its remote and its main line, read from the ` +
      'repository itself. Its canonical checkout lives at ' +
      `\`repos/${name}/\` — contained in the workspace, ignored by its git, and never worked in directly.`,
  });
  gitOrThrow(root, 'add', '--', recordType.relPath);
  gitOrThrow(root, 'commit', '-m', `Register repository ${name} (ward ${pkg.version})`);
  return { record, outcome: 'registered' };
}

// -- refresh --------------------------------------------------------------

export async function refreshRepositories(root: string, name?: string): Promise<RefreshReport[]> {
  const names = name === undefined ? listRepositoryNames(root) : [name];
  if (name !== undefined && !existsSync(join(root, repositoryRecordType(name).relPath))) {
    throw new WardError(`no repository named '${name}' is registered`);
  }
  const reports: RefreshReport[] = [];
  for (const repoName of names) {
    reports.push(await refreshOne(root, repoName));
  }
  return reports;
}

async function refreshOne(root: string, name: string): Promise<RefreshReport> {
  const record = (await readDocument(root, repositoryRecordType(name))).data;
  const checkout = checkoutPath(root, name);
  if (!existsSync(checkout)) {
    return {
      name,
      outcome: 'failed',
      detail: `checkout is missing — run: ward repo add ${record.remote}`,
    };
  }
  // The fail-safe: evidence of unrecorded work stops the toil, whatever the
  // record says (intent/01-concepts/03-work-lifecycle.md).
  if (git(checkout, 'status', '--porcelain').stdout.trim() !== '') {
    return { name, outcome: 'dirty', detail: 'uncommitted changes — refusing to touch it' };
  }
  const fetch = git(checkout, 'fetch', 'origin');
  if (fetch.exitCode !== 0) {
    return { name, outcome: 'failed', detail: `fetch failed: ${fetch.stderr.trim()}` };
  }
  const before = git(checkout, 'rev-parse', '--short', 'HEAD').stdout.trim();
  const merge = git(checkout, 'merge', '--ff-only', `origin/${record.mainLine}`);
  if (merge.exitCode !== 0) {
    return {
      name,
      outcome: 'failed',
      detail: `cannot fast-forward to origin/${record.mainLine}: ${merge.stderr.trim()}`,
    };
  }
  const after = git(checkout, 'rev-parse', '--short', 'HEAD').stdout.trim();
  return before === after
    ? { name, outcome: 'current', detail: `at ${after} on ${record.mainLine}` }
    : { name, outcome: 'refreshed', detail: `${before} → ${after} on ${record.mainLine}` };
}

// -- list -----------------------------------------------------------------

export function listRepositoryNames(root: string): string[] {
  const dir = join(root, 'repositories');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .map((file) => file.slice(0, -3))
    .sort();
}

export async function listRepositories(root: string): Promise<RepositoryRecord[]> {
  const records: RepositoryRecord[] = [];
  for (const name of listRepositoryNames(root)) {
    records.push((await readDocument(root, repositoryRecordType(name))).data);
  }
  return records;
}

// -- plumbing -------------------------------------------------------------

function isLocalSource(source: string): boolean {
  return existsSync(source);
}

function deriveName(source: string): string {
  const name = basename(source.replace(/\/+$/, '')).replace(/\.git$/, '');
  if (name === '') throw new WardError(`cannot derive a repository name from '${source}'`);
  return name;
}

/**
 * The configured origin URL, raw: `git config` rather than `remote get-url`,
 * because the latter applies url.*.insteadOf rewrites — a transport-level,
 * per-machine redirection — and the record should carry the remote's durable
 * identity, not where this machine happens to fetch it from
 * (design/0012-close-gate-reachability/).
 */
function originOf(checkout: string): string | null {
  const result = git(checkout, 'config', '--get', 'remote.origin.url');
  return result.exitCode === 0 ? result.stdout.trim() : null;
}

function clone(source: string, destination: string, origin: string | null): void {
  const result = git('.', 'clone', source, destination);
  if (result.exitCode !== 0) {
    throw new WardError(`git clone ${source} failed: ${result.stderr.trim()}`);
  }
  // An adopted checkout should point at the source's real remote, not at the
  // human's local checkout it happened to be cloned from.
  if (origin !== null && origin !== source) {
    gitOrThrow(destination, 'remote', 'set-url', 'origin', origin);
  }
}

/**
 * The main line is read from the repository, never assumed
 * (intent/01-concepts/06-workspace-lifecycle.md). The authoritative answer is
 * the remote's HEAD — an adopted source's checked-out branch is whatever the
 * human happened to be working on, which is exactly the wrong guess.
 */
function detectMainLine(checkout: string, adoptedFrom: string | null): string {
  const lsRemote = git(checkout, 'ls-remote', '--symref', 'origin', 'HEAD');
  if (lsRemote.exitCode === 0) {
    const symref = /^ref: refs\/heads\/(\S+)\tHEAD/m.exec(lsRemote.stdout);
    if (symref?.[1] !== undefined) return symref[1];
  }
  // Offline fallbacks: the clone's recorded origin/HEAD, then a current branch.
  const head = git(checkout, 'symbolic-ref', 'refs/remotes/origin/HEAD');
  if (head.exitCode === 0) {
    const ref = head.stdout.trim();
    const branch = ref.replace(/^refs\/remotes\/origin\//, '');
    if (branch !== ref && branch !== '') return branch;
  }
  const fallback = adoptedFrom ?? checkout;
  const current = git(fallback, 'symbolic-ref', '--short', 'HEAD');
  if (current.exitCode === 0 && current.stdout.trim() !== '') return current.stdout.trim();
  throw new WardError(
    `cannot determine the main line of ${checkout} — the repository names no default branch`,
  );
}

/** The canonical checkout tracks the main line; land it there whatever the clone checked out. */
function ensureOnMainLine(checkout: string, mainLine: string): void {
  const current = git(checkout, 'symbolic-ref', '--short', 'HEAD');
  if (current.exitCode === 0 && current.stdout.trim() === mainLine) return;
  const result = git(checkout, 'checkout', mainLine);
  if (result.exitCode !== 0) {
    throw new WardError(
      `cannot check out main line '${mainLine}' in ${checkout}: ${result.stderr.trim()}`,
    );
  }
}
