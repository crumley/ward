// The repository set (intent/01-concepts/06-workspace-lifecycle.md): register
// by adopt-or-clone converging on the contained canonical checkout under
// repos/<name>/, refresh it on demand — never through a dirty tree unless the
// human explicitly asks for the stash cycle — list what is registered, and
// remove a repository whose checkout carries no evidence of unrecorded work
// (design/0033-repo-remove/). Records live at repositories/<name>.md, one per
// repo. Refresh runs the repositories concurrently and reports them in
// registration order (design/0023-refresh-concurrency-ux/).
import { existsSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { bindCheckout, unbindCheckout } from '../global/checkouts.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { type RepositoryRecord, repositoryRecordType, worktreeRecordType } from '../store/types.ts';
import { taskAddress } from './address.ts';
import { checkoutLabel, checkoutPath, resolveCheckout, unboundMessage } from './checkouts.ts';
import {
  commandSucceeded,
  describeFailure,
  repositoryCommands,
  repositoryValues,
  runRepositoryCommand,
} from './commands.ts';
import { git, gitAsync, gitOrThrow } from './git.ts';
import { workspaceId } from './identity.ts';
import { commitRecords, readTasks } from './scan.ts';

// Where a checkout stands is checkouts.ts's question
// (design/0065-external-checkouts-and-repo-commands/); re-exported because
// this module is where every caller has always asked it.
export { checkoutPath };

export interface AddReport {
  readonly record: RepositoryRecord;
  /** 'registered' — new; 'converged' — record existed, checkout re-established; 'satisfied' — nothing to do. */
  readonly outcome: 'registered' | 'converged' | 'satisfied';
  /** Absolute path of the checkout on this machine. */
  readonly path: string;
}

export interface AddOptions {
  /**
   * Register against a checkout that already stands outside the workspace
   * (design/0065-external-checkouts-and-repo-commands/): nothing is cloned or
   * moved, and the same verb binds an already-registered external repository
   * on a machine that has not said where its checkout is.
   */
  readonly external?: boolean;
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

// -- add ------------------------------------------------------------------

export async function addRepository(
  root: string,
  source: string,
  explicitName?: string,
  options: AddOptions = {},
): Promise<AddReport> {
  if (options.external === true) return addExternalRepository(root, source, explicitName);
  const local = isLocalSource(source);
  const name = explicitName ?? deriveName(source);
  const recordType = repositoryRecordType(name);
  const checkout = join(root, 'repos', name);

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
    // An external repository is never converged by cloning: the record says
    // the workspace does not contain its checkout, and a clone into repos/
    // would be a second canonical checkout the record does not describe.
    if (existing.checkout === 'external') throw new WardError(unboundMessage(name));
    if (existsSync(checkout)) return { record: existing, outcome: 'satisfied', path: checkout };
    clone(local ? resolve(source) : source, checkout, local ? remote : null);
    ensureOnMainLine(checkout, existing.mainLine);
    return { record: existing, outcome: 'converged', path: checkout };
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
      return { record: existing, outcome: 'satisfied' as const, path: checkout };
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
    return { record, outcome: 'registered' as const, path: checkout };
  });
}

/**
 * Register a repository against a checkout that already stands outside the
 * workspace, or bind one already registered that way on this machine
 * (design/0065-external-checkouts-and-repo-commands/). Read-only toward the
 * checkout: its remote and main line are read from it, and nothing in it is
 * fetched, checked out, or moved. The record carries `checkout: external` and
 * no path; the path is bound in this machine's state.
 */
async function addExternalRepository(
  root: string,
  source: string,
  explicitName?: string,
): Promise<AddReport> {
  if (!existsSync(source)) {
    throw new WardError(
      `--external takes the path of a checkout already on this machine, and nothing is at ` +
        `'${source}' — to clone a remote, leave --external off`,
    );
  }
  const top = git(resolve(source), 'rev-parse', '--show-toplevel');
  if (top.exitCode !== 0) {
    throw new WardError(`${resolve(source)} is not a git checkout: ${top.stderr.trim()}`);
  }
  const path = realpathSync(top.stdout.trim());
  const within = relative(realpathSync(root), path);
  if (!within.startsWith('..') && !isAbsolute(within)) {
    throw new WardError(
      `${path} is inside the workspace — an external checkout stands outside it; leave ` +
        '--external off to adopt a local checkout into repos/',
    );
  }
  const remote = originOf(path);
  if (remote === null) {
    throw new WardError(
      `${path} has no 'origin' remote — Ward reads a repository's main line as origin/<branch>, ` +
        'so an external checkout needs one (git remote add origin URL)',
    );
  }
  const name = explicitName ?? deriveName(path);
  const recordType = repositoryRecordType(name);
  const id = await workspaceId(root);

  if (existsSync(join(root, recordType.relPath))) {
    const existing = (await readDocument(root, recordType)).data;
    refuseMismatch(existing, remote, name);
    const changed = await bindCheckout(id, name, path);
    return { record: existing, outcome: changed ? 'converged' : 'satisfied', path };
  }

  const mainLine = detectMainLine(path, path);
  if (
    git(path, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${mainLine}`).exitCode !== 0
  ) {
    throw new WardError(
      `${path} has no origin/${mainLine} yet — fetch it there first (git fetch origin), then rerun`,
    );
  }
  const report = await withStoreLock(root, `repo add ${name}`, async () => {
    if (existsSync(join(root, recordType.relPath))) {
      const existing = (await readDocument(root, recordType)).data;
      refuseMismatch(existing, remote, name);
      return { record: existing, outcome: 'satisfied' as const, path };
    }
    const record: RepositoryRecord = {
      type: 'repository',
      name,
      remote,
      mainLine,
      registeredAt: new Date().toISOString(),
      checkout: 'external',
    };
    await writeDocument(root, recordType, {
      data: record,
      body:
        `The record of the \`${name}\` repository: its remote and its main line, read from the ` +
        'repository itself. Its canonical checkout is **external**: it stands outside the ' +
        'workspace, where each machine says (`ward repo add PATH --external --name ' +
        `${name}\`), and Ward never clones, moves, or deletes it.`,
    });
    gitOrThrow(root, 'add', '--', recordType.relPath);
    gitOrThrow(root, 'commit', '-m', `Register repository ${name} (ward ${pkg.version})`);
    return { record, outcome: 'registered' as const, path };
  });
  // Record first, binding second: interrupted between the two, the world is
  // an external record with no binding — the state every other machine starts
  // in, which this same verb converges.
  const changed = await bindCheckout(id, name, path);
  return report.outcome === 'satisfied' && changed ? { ...report, outcome: 'converged' } : report;
}

/** An existing record this registration must not silently redefine. */
function refuseMismatch(existing: RepositoryRecord, remote: string, name: string): void {
  if (existing.checkout !== 'external') {
    throw new WardError(
      `repository '${name}' is already registered with a checkout contained in the workspace ` +
        `(repos/${name}/) — remove it first (ward repo remove ${name}) to register it external, ` +
        'or use --name to register under another name',
    );
  }
  if (remoteKey(existing.remote) !== remoteKey(remote)) {
    throw new WardError(
      `repository '${name}' is already registered with remote ${existing.remote} — ` +
        `refusing to bind it to a checkout of ${remote}; use --name to register under another name`,
    );
  }
}

/**
 * A remote reduced to what identifies the repository, so one repository
 * cloned over SSH on one machine and HTTPS on another binds to the same
 * record: scheme, user, a trailing `.git` and slash, and the host's case are
 * transport spelling, not identity.
 */
export function remoteKey(remote: string): string {
  const scp = /^[^/@:]+@([^:/]+):(.+)$/.exec(remote);
  const url = /^[a-z][a-z0-9+.-]*:\/\/(?:[^/@]+@)?([^/]+)\/(.+)$/i.exec(remote);
  const [host, path] =
    scp !== null ? [scp[1], scp[2]] : url !== null ? [url[1], url[2]] : ['', remote];
  const tail = (path ?? '').replace(/\/+$/, '').replace(/\.git$/, '');
  return host === '' ? tail : `${(host ?? '').toLowerCase()}/${tail}`;
}

// -- remove ---------------------------------------------------------------

export interface RemoveReport {
  /** The record as it stood — its remote is what re-registering takes. */
  readonly record: RepositoryRecord;
  /**
   * 'deleted' — the checkout was removed; 'missing' — there was none on disk;
   * 'kept' — the checkout is external, never Ward's to delete
   * (design/0065-external-checkouts-and-repo-commands/).
   */
  readonly checkout: 'deleted' | 'missing' | 'kept';
  /** Where an external checkout still stands, when this machine had it bound. */
  readonly path?: string;
}

/**
 * Unregister a repository and delete its canonical checkout — registration's
 * converse, and the set's one destructive verb, so every gate runs before
 * anything is touched. What keeps the delete autonomous (§18) is the same
 * fail-safe refresh lives by (intent/01-concepts/03-work-lifecycle.md):
 * evidence of unrecorded work refuses the verb, and a checkout that passes is
 * re-creatable from its remote to the commit — the report carries that
 * remote, and `ward repo add` puts it back.
 *
 * The evidence is read off the world, never remembered (§17): a worktree of
 * an open task (it borrows the checkout's object store, so deletion severs
 * it), a dirty or conflicted tree, parked stash entries, or a local branch
 * carrying commits origin/<mainLine> does not — an abandoned task's unlanded
 * branch lives exactly here, and the checkout is the one place it survives.
 *
 * Everything sits inside the store lock: the gates are local reads, cheap to
 * serialize, and a concurrent `worktree create` must not thread a new
 * worktree under a checkout mid-deletion.
 */
export async function removeRepository(root: string, name: string): Promise<RemoveReport> {
  const recordType = repositoryRecordType(name);
  return withStoreLock(root, `repo remove ${name}`, async () => {
    if (!existsSync(join(root, recordType.relPath))) {
      throw new WardError(`no repository named '${name}' is registered — see: ward repo list`);
    }
    const record = (await readDocument(root, recordType)).data;

    const holders = await tasksAnchoredIn(root, name);
    if (holders.length > 0) {
      throw new WardError(
        `repository '${name}' anchors worktrees of open task${holders.length === 1 ? '' : 's'} ` +
          `${holders.join(', ')} — close ${holders.length === 1 ? 'it' : 'them'} first ` +
          '(ward task close), then rerun',
      );
    }

    if (record.checkout === 'external') {
      // An external checkout is not Ward's: unregistering forgets it and
      // touches nothing in it, so there is no unrecorded work to guard — the
      // one gate left is the one above, the open tasks standing on it.
      const { path } = resolveCheckout(root, name);
      rmSync(join(root, recordType.relPath));
      commitRecords(root, `Unregister repository ${name}`, recordType.relPath);
      const id = await workspaceId(root).catch(() => undefined);
      if (id !== undefined) await unbindCheckout(id, name).catch(() => false);
      return { record, checkout: 'kept' as const, ...(path === undefined ? {} : { path }) };
    }

    const checkout = checkoutPath(root, name);
    const hadCheckout = existsSync(checkout);
    if (hadCheckout) refuseUnrecordedWork(checkout, name, record.mainLine);

    // Checkout first, record second: interrupted between the two, the world
    // is a record whose checkout is missing — drift doctor already names,
    // with `ward repo add` as its converging remedy. The other order leaves
    // an orphaned checkout no record accounts for.
    if (hadCheckout) rmSync(checkout, { recursive: true, force: true });
    rmSync(join(root, recordType.relPath));
    commitRecords(root, `Unregister repository ${name}`, recordType.relPath);
    return { record, checkout: hadCheckout ? ('deleted' as const) : ('missing' as const) };
  });
}

/**
 * Open tasks with a worktree record of this repository, named by address. The records are
 * read directly (the same shape worktrees.ts reads) rather than through
 * worktrees.ts, which imports this module — the duplication buys the absence
 * of an import cycle.
 */
async function tasksAnchoredIn(root: string, name: string): Promise<string[]> {
  const codes: string[] = [];
  for (const task of await readTasks(root)) {
    if (task.record.state === 'closed') continue;
    const dir = join(root, task.dir, 'worktrees');
    if (!existsSync(dir)) continue;
    for (const file of readdirSync(dir)
      .filter((entry) => entry.endsWith('.md'))
      .sort()) {
      const worktree = (await readDocument(root, worktreeRecordType(task.dir, file.slice(0, -3))))
        .data;
      if (worktree.repo === name && !codes.includes(taskAddress(task))) {
        codes.push(taskAddress(task));
      }
    }
  }
  return codes;
}

/**
 * The fail-safe, read off the checkout in one pass. Every refusal names what
 * was found and the remedy (§20); a checkout git itself cannot read is
 * refused too — an unreadable tree is exactly the case where "probably fine
 * to delete" is a guess.
 */
function refuseUnrecordedWork(checkout: string, name: string, mainLine: string): void {
  const status = git(checkout, 'status', '--porcelain');
  if (status.exitCode !== 0) {
    throw new WardError(`cannot read repos/${name}: ${status.stderr.trim()}`);
  }
  if (hasUnmergedPaths(status.stdout)) {
    throw new WardError(
      `repos/${name} has unresolved conflicts — resolve the unmerged paths (git status), then rerun`,
    );
  }
  if (status.stdout.trim() !== '') {
    throw new WardError(
      `repos/${name} has uncommitted changes — deleting them would be silent loss; ` +
        'commit or discard them, then rerun',
    );
  }
  if (git(checkout, 'stash', 'list').stdout.trim() !== '') {
    throw new WardError(
      `repos/${name} carries stash entries — apply or drop them (git stash list), then rerun`,
    );
  }
  const branches = git(
    checkout,
    'branch',
    '--format=%(refname:short)',
    '--no-merged',
    `origin/${mainLine}`,
  );
  if (branches.exitCode !== 0) {
    throw new WardError(
      `cannot read repos/${name}'s branches against origin/${mainLine}: ${branches.stderr.trim()}`,
    );
  }
  const unlanded = branches.stdout
    .split('\n')
    .map((branch) => branch.trim())
    .filter((branch) => branch !== '');
  if (unlanded.length > 0) {
    throw new WardError(
      `repos/${name} holds local branch${unlanded.length === 1 ? '' : 'es'} with commits ` +
        `origin/${mainLine} does not have (${unlanded.join(', ')}) — push or delete ` +
        `${unlanded.length === 1 ? 'it' : 'them'}, then rerun`,
    );
  }
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
  const where = resolveCheckout(root, name);
  if (where.path === undefined) return { name, outcome: 'failed', detail: unboundMessage(name) };
  const checkout = where.path;
  const label = checkoutLabel(root, name);
  if (!existsSync(checkout)) {
    return {
      name,
      outcome: 'failed',
      detail: where.external
        ? `the external checkout is missing at ${checkout} — put it back, or bind where it ` +
          `stands now: ward repo add PATH --external --name ${name}`
        : `checkout is missing — run: ward repo add ${record.remote}`,
    };
  }
  // This machine's own update command, when it names one
  // (design/0065-external-checkouts-and-repo-commands/).
  const update = (await repositoryCommands(name)).update;
  const how: Advance =
    update === undefined
      ? { by: 'git' }
      : { by: 'command', argv: update, values: repositoryValues(root, record, checkout) };
  const status = await gitAsync(checkout, 'status', '--porcelain');
  const dirty = status.stdout.trim() !== '';
  // An external checkout is somebody's own working place: it may be dirty,
  // mid-merge, or on another branch for reasons that are none of Ward's. With
  // no update command, everything Ward needs from a refresh is
  // origin/<mainLine>, and a fetch moves that without touching the tree — so
  // the tree is fast-forwarded only when it is clean and on the main line.
  if (where.external && how.by === 'git') {
    const branch = (await gitAsync(checkout, 'symbolic-ref', '--short', 'HEAD')).stdout.trim();
    if (dirty || branch !== record.mainLine) {
      const why = dirty
        ? 'it has uncommitted changes'
        : `it is on ${branch === '' ? 'a detached HEAD' : `'${branch}'`}`;
      return fetchOnly(checkout, name, record.mainLine, why);
    }
  }
  // Conflict is read off the checkout, never remembered: unmerged paths are
  // the evidence, and they are evidence whether this run created them or a
  // previous one left them. A conflicted checkout is skipped exactly as a
  // dirty one is — including under --stash, which would otherwise stash a
  // half-merged index and hand the human two problems.
  if (hasUnmergedPaths(status.stdout)) {
    return { name, outcome: 'conflicted', detail: conflictDetail(label) };
  }
  // The fail-safe: evidence of unrecorded work stops the toil, whatever the
  // record says (intent/01-concepts/03-work-lifecycle.md). --stash is the
  // human's explicit, narrow exception to it — the work is preserved and put
  // back, never discarded. It holds for an update command too: a machine's
  // own tool is never run through a dirty tree on Ward's initiative.
  if (dirty && !stash) {
    return { name, outcome: 'dirty', detail: 'uncommitted changes — refusing to touch it' };
  }
  if (!dirty) return advance(checkout, name, record.mainLine, how);

  const stackBefore = await stashRef(checkout);
  const push = await gitAsync(checkout, 'stash', 'push', '-u', '-m', STASH_MESSAGE);
  if (push.exitCode !== 0) {
    return {
      name,
      outcome: 'failed',
      detail: `cannot stash ${label}: ${oneLine(push.stderr)} — the checkout is untouched`,
    };
  }
  // Whether an entry was actually created is read from the stack, not from
  // git's prose: a push that saved nothing (git says so and still exits 0)
  // must not be followed by a pop that would take somebody else's entry.
  const stashed = (await stashRef(checkout)) !== stackBefore;
  const advanced = await advance(checkout, name, record.mainLine, how);
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
      return { name, outcome: 'conflicted', detail: conflictDetail(label) };
    }
    return {
      name,
      outcome: 'failed',
      detail:
        `refreshed, but restoring the stash failed: ${oneLine(pop.stderr)} — your changes are ` +
        `still on the stack in ${label} (git stash list)`,
    };
  }
  if (advanced.outcome === 'failed') return advanced;
  return { ...advanced, detail: `${advanced.detail}; stashed and restored` };
}

/** How the checkout is brought to the latest: Ward's own git, or the machine's command. */
type Advance =
  | { readonly by: 'git' }
  | {
      readonly by: 'command';
      readonly argv: readonly string[];
      readonly values: Readonly<Record<string, string>>;
    };

/** Fetch, then fast-forward to the recorded main line — the refresh proper. */
async function advance(
  checkout: string,
  name: string,
  mainLine: string,
  how: Advance,
): Promise<RefreshReport> {
  if (how.by === 'command') return advanceByCommand(checkout, name, mainLine, how);
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

/** The short commit `origin/<mainLine>` names in a checkout, or '' when it names none. */
async function mainLineTip(checkout: string, mainLine: string): Promise<string> {
  const tip = await gitAsync(
    checkout,
    'rev-parse',
    '--short',
    '--verify',
    '--quiet',
    `refs/remotes/origin/${mainLine}`,
  );
  return tip.exitCode === 0 ? tip.stdout.trim() : '';
}

/**
 * The fetch alone, for an external checkout whose tree Ward leaves as it is.
 * Sufficient by construction: worktrees are cut from `origin/<mainLine>`,
 * rebased onto it, measured against it, and the close gate asks it.
 */
async function fetchOnly(
  checkout: string,
  name: string,
  mainLine: string,
  why: string,
): Promise<RefreshReport> {
  const before = await mainLineTip(checkout, mainLine);
  const fetch = await gitAsync(checkout, 'fetch', 'origin');
  if (fetch.exitCode !== 0) {
    return { name, outcome: 'failed', detail: `fetch failed: ${oneLine(fetch.stderr)}` };
  }
  const after = await mainLineTip(checkout, mainLine);
  const left = `working tree left alone (${why})`;
  return before === after
    ? { name, outcome: 'current', detail: `origin/${mainLine} at ${after}; ${left}` }
    : { name, outcome: 'refreshed', detail: `origin/${mainLine} ${before} → ${after}; ${left}` };
}

/**
 * The machine's own update command in place of fetch + fast-forward. Its
 * contract is its result: exit 0, and `origin/<mainLine>` resolving in the
 * checkout — the one ref everything downstream reads. What the command did to
 * get there (and to the working tree) is its own business.
 */
async function advanceByCommand(
  checkout: string,
  name: string,
  mainLine: string,
  how: Extract<Advance, { by: 'command' }>,
): Promise<RefreshReport> {
  const before = await mainLineTip(checkout, mainLine);
  let run: Awaited<ReturnType<typeof runRepositoryCommand>>;
  try {
    run = await runRepositoryCommand('update', how.argv, how.values, checkout);
  } catch (error) {
    if (error instanceof WardError) return { name, outcome: 'failed', detail: error.message };
    throw error;
  }
  if (!commandSucceeded(run)) {
    return { name, outcome: 'failed', detail: `update command failed — ${describeFailure(run)}` };
  }
  const after = await mainLineTip(checkout, mainLine);
  if (after === '') {
    return {
      name,
      outcome: 'failed',
      detail:
        `the update command exited 0 but origin/${mainLine} does not resolve in the checkout — ` +
        'an update command must leave that ref at the latest',
    };
  }
  return before === after
    ? { name, outcome: 'current', detail: `origin/${mainLine} at ${after} (update command)` }
    : {
        name,
        outcome: 'refreshed',
        detail: `origin/${mainLine} ${before} → ${after} (update command)`,
      };
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

function conflictDetail(label: string): string {
  return (
    `unresolved conflicts in ${label} — resolve the unmerged paths (git status), ` +
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
