// The repository set (intent/01-concepts/06-workspace-lifecycle.md): register
// by adopt-or-clone converging on the contained canonical checkout under
// repos/<name>/, refresh it on demand — never through a dirty tree unless the
// human explicitly asks for the stash cycle — and list what is registered.
// Records live at repositories/<name>.md, one per repo. Refresh runs the
// repositories concurrently and reports them in registration order
// (design/0023-refresh-concurrency-ux/).
import { existsSync, readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { type RepositoryRecord, repositoryRecordType } from '../store/types.ts';
import { git, gitAsync, gitOrThrow } from './git.ts';

export interface AddReport {
  readonly record: RepositoryRecord;
  /** 'registered' — new; 'converged' — record existed, checkout re-established; 'satisfied' — nothing to do. */
  readonly outcome: 'registered' | 'converged' | 'satisfied';
}

/**
 * `conflicted` is **derived, never stored** (§17): a checkout carrying
 * unmerged paths is recognized as conflicted by reading the checkout itself,
 * on every refresh, with or without `--stash`. Like `dirty` it is
 * informational — the refresh reports it and moves on; only `failed` is a
 * broken promise (design/0023-refresh-concurrency-ux/).
 */
export type RefreshOutcome = 'refreshed' | 'current' | 'dirty' | 'conflicted' | 'failed';

export interface RefreshReport {
  readonly name: string;
  readonly outcome: RefreshOutcome;
  readonly detail: string;
}

/** What a repository is doing right now: the two in-flight states, then its outcome. */
export type RefreshState = 'pending' | 'fetching' | RefreshOutcome;

export interface RefreshRow {
  readonly name: string;
  readonly state: RefreshState;
  /** Present once the row has settled — the report's detail, verbatim. */
  readonly detail?: string;
}

/**
 * The progress seam. An observer is handed a **complete snapshot** of every
 * repository in registration order, on every transition — not a delta — so a
 * renderer holds no state of its own and any renderer can be swapped in
 * behind it (§7). Called synchronously; an observer that throws fails the
 * refresh, so renderers keep themselves cheap and total.
 */
export type RefreshObserver = (rows: readonly RefreshRow[]) => void;

export interface RefreshOptions {
  /**
   * Stash a dirty checkout, refresh it, and restore the stash — opt-in, and
   * never a default here. A configured default (`repo.refresh.stash`) is a
   * later, separate substitution at the CLI edge; this module reads no
   * configuration.
   */
  readonly stash?: boolean;
  readonly observe?: RefreshObserver;
}

/**
 * How many repositories are refreshed at once. Fixed, not a flag: the work is
 * one `git fetch` per repository — network-bound, so overlapping them is
 * nearly all of the win — and a cap keeps a large repository set from opening
 * an unbounded number of connections to the same forge. Eight is the knee:
 * beyond it the remote, not the client, is the limit.
 */
const REFRESH_CONCURRENCY = 8;

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
  // The clone (slow, network) stays outside the lock; only the record write
  // and its commit are serialized (§17). The registration is re-checked
  // under the lock so a concurrent add of the same name converges instead
  // of double-committing.
  return withStoreLock(root, `repo add ${name}`, async () => {
    if (existsSync(join(root, recordType.relPath))) {
      const existing = (await readDocument(root, recordType)).data;
      if (existing.remote !== remote) {
        throw new WardError(
          `repository '${name}' is already registered with remote ${existing.remote} — ` +
            `refusing to overwrite it with ${remote}; use --name to register under another name`,
        );
      }
      return { record: existing, outcome: 'satisfied' as const };
    }
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
    return { record, outcome: 'registered' as const };
  });
}

// -- refresh --------------------------------------------------------------

/**
 * Refresh the registered set — or one repository — running repositories
 * concurrently under a fixed cap. Repositories are independent: separate
 * checkouts, separate remotes, no shared record write (refresh takes no store
 * lock because it writes nothing), so the only thing serializing them ever
 * bought was the order of a report this function builds by index anyway.
 *
 * **The report is registration order, always** — indexed by position, never
 * appended in completion order — so the same set produces the same document
 * whatever the network did (§6, deterministic inspection).
 */
export async function refreshRepositories(
  root: string,
  name?: string,
  options: RefreshOptions = {},
): Promise<RefreshReport[]> {
  const names = name === undefined ? listRepositoryNames(root) : [name];
  if (name !== undefined && !existsSync(join(root, repositoryRecordType(name).relPath))) {
    throw new WardError(`no repository named '${name}' is registered`);
  }
  const rows: RefreshRow[] = names.map((repoName) => ({ name: repoName, state: 'pending' }));
  const reports = new Array<RefreshReport | undefined>(names.length);
  const announce = (): void => options.observe?.([...rows]);
  announce();

  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < names.length; index = next++) {
      const repoName = names[index] ?? '';
      rows[index] = { name: repoName, state: 'fetching' };
      announce();
      const report = await refreshOne(root, repoName, options.stash === true);
      reports[index] = report;
      rows[index] = { name: repoName, state: report.outcome, detail: report.detail };
      announce();
    }
  };
  const lanes = Math.min(REFRESH_CONCURRENCY, names.length);
  await Promise.all(Array.from({ length: lanes }, worker));
  // Every index was assigned by the loop above; the fallback is a type
  // narrowing, not a real path.
  return reports.map(
    (report, index) =>
      report ?? { name: names[index] ?? '', outcome: 'failed', detail: 'no report produced' },
  );
}

async function refreshOne(root: string, name: string, stash: boolean): Promise<RefreshReport> {
  const record = (await readDocument(root, repositoryRecordType(name))).data;
  const checkout = checkoutPath(root, name);
  if (!existsSync(checkout)) {
    return {
      name,
      outcome: 'failed',
      detail: `checkout is missing — run: ward repo add ${record.remote}`,
    };
  }
  const status = await gitAsync(checkout, 'status', '--porcelain');
  // Conflict is read off the checkout, never remembered: unmerged paths are
  // the evidence, and they are evidence whether this run created them or a
  // previous one left them. A conflicted checkout is skipped exactly as a
  // dirty one is — including under --stash, which would otherwise stash a
  // half-merged index and hand the human two problems.
  if (hasUnmergedPaths(status.stdout)) {
    return { name, outcome: 'conflicted', detail: conflictDetail(name) };
  }
  // The fail-safe: evidence of unrecorded work stops the toil, whatever the
  // record says (intent/01-concepts/03-work-lifecycle.md). --stash is the
  // human's explicit, narrow exception to it — the work is preserved and put
  // back, never discarded.
  const dirty = status.stdout.trim() !== '';
  if (dirty && !stash) {
    return { name, outcome: 'dirty', detail: 'uncommitted changes — refusing to touch it' };
  }
  if (!dirty) return advance(checkout, name, record.mainLine);

  const stackBefore = await stashRef(checkout);
  const push = await gitAsync(checkout, 'stash', 'push', '-u', '-m', STASH_MESSAGE);
  if (push.exitCode !== 0) {
    return {
      name,
      outcome: 'failed',
      detail: `cannot stash repos/${name}: ${oneLine(push.stderr)} — the checkout is untouched`,
    };
  }
  // Whether an entry was actually created is read from the stack, not from
  // git's prose: a push that saved nothing (git says so and still exits 0)
  // must not be followed by a pop that would take somebody else's entry.
  const stashed = (await stashRef(checkout)) !== stackBefore;
  const advanced = await advance(checkout, name, record.mainLine);
  if (!stashed) return advanced;
  // The stash comes back whatever the fast-forward did: leaving the human's
  // work parked because the network failed would be the fail-safe inverted.
  const pop = await gitAsync(checkout, 'stash', 'pop');
  if (pop.exitCode !== 0) {
    const after = await gitAsync(checkout, 'status', '--porcelain');
    if (hasUnmergedPaths(after.stdout)) {
      // Left exactly as git left it — markers in the tree, the stash entry
      // still on the stack (git keeps it on a failed pop). Resolving is
      // judgement, and judgement is the human's (§18).
      return { name, outcome: 'conflicted', detail: conflictDetail(name) };
    }
    return {
      name,
      outcome: 'failed',
      detail:
        `refreshed, but restoring the stash failed: ${oneLine(pop.stderr)} — your changes are ` +
        `still on the stack in repos/${name} (git stash list)`,
    };
  }
  if (advanced.outcome === 'failed') return advanced;
  return { ...advanced, detail: `${advanced.detail}; stashed and restored` };
}

/** Fetch, then fast-forward to the recorded main line — the refresh proper. */
async function advance(checkout: string, name: string, mainLine: string): Promise<RefreshReport> {
  const fetch = await gitAsync(checkout, 'fetch', 'origin');
  if (fetch.exitCode !== 0) {
    return { name, outcome: 'failed', detail: `fetch failed: ${oneLine(fetch.stderr)}` };
  }
  const before = (await gitAsync(checkout, 'rev-parse', '--short', 'HEAD')).stdout.trim();
  const merge = await gitAsync(checkout, 'merge', '--ff-only', `origin/${mainLine}`);
  if (merge.exitCode !== 0) {
    return {
      name,
      outcome: 'failed',
      detail: `cannot fast-forward to origin/${mainLine}: ${oneLine(merge.stderr)}`,
    };
  }
  const after = (await gitAsync(checkout, 'rev-parse', '--short', 'HEAD')).stdout.trim();
  return before === after
    ? { name, outcome: 'current', detail: `at ${after} on ${mainLine}` }
    : { name, outcome: 'refreshed', detail: `${before} → ${after} on ${mainLine}` };
}

/**
 * A report detail is one line, by contract — the human form renders one row
 * per repository, and git's stderr is happily several paragraphs long. Folded
 * here, at the one place multi-line text enters a report, so both audiences
 * get the whole message without either getting a broken layout.
 */
function oneLine(text: string): string {
  return text.trim().replaceAll(/\s*\n\s*/g, ' ');
}

/** The stash entry carries who made it, so `git stash list` explains itself. */
const STASH_MESSAGE = 'ward repo refresh --stash';

/** The top of the stash stack, or '' when the stack is empty. */
async function stashRef(checkout: string): Promise<string> {
  const result = await gitAsync(checkout, 'rev-parse', '--verify', '--quiet', 'refs/stash');
  return result.exitCode === 0 ? result.stdout.trim() : '';
}

function conflictDetail(name: string): string {
  return (
    `unresolved conflicts in repos/${name} — resolve the unmerged paths (git status), ` +
    'git add them, then drop the entry git kept (git stash drop); ' +
    'refresh skips this repository until it is clean'
  );
}

/**
 * Unmerged paths in `git status --porcelain` output. The unmerged codes are
 * the pairs with a `U` on either side plus `AA` and `DD`; everything else —
 * staged, modified, untracked — is ordinary dirt. Read rather than stored,
 * so the state survives Ward not being the one who created it.
 */
function hasUnmergedPaths(porcelain: string): boolean {
  return porcelain
    .split('\n')
    .some(
      (line) =>
        line.length >= 2 &&
        (line[0] === 'U' ||
          line[1] === 'U' ||
          (line[0] === 'A' && line[1] === 'A') ||
          (line[0] === 'D' && line[1] === 'D')),
    );
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
