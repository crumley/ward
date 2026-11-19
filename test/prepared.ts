// Prepared fixtures (design/0072-test-workspace-template/): the starting
// points most tests need, built for real once per test process and handed to
// each test as its own copy.
//
// - `preparedWorkspace(path)` — what `createWorkspace(path)` leaves behind,
//   without running creation for every case: a template made by the real
//   `createWorkspace`, copied, then given the identity creation would have
//   given a workspace at `path` (its name, a fresh id, a fresh creation time)
//   in one amended commit. A test whose subject is creation itself keeps
//   calling `createWorkspace`.
// - `preparedRemote(path, seed)` — a bare repository holding one seed commit,
//   the "source repository with a remote" most repository tests start from,
//   copied from a template built once per distinct seed.
//
// A copy is a full, independent repository: the files are copied, never
// hard-linked or shared through git alternates, and nothing in a template
// records an absolute path, so no test can reach another test's state
// through its copy. Templates live in a per-process directory removed at
// exit, so parallel test workers never share one.
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { readDocument, writeDocument } from '../src/store/document.ts';
import { workspaceRecordType } from '../src/store/types.ts';
import { createWorkspace } from '../src/workspace/create.ts';
import { gitOrThrow } from '../src/workspace/git.ts';
import { mintWorkspaceId } from '../src/workspace/identity.ts';

/**
 * A workspace at `path`, as `createWorkspace(path)` would leave it: the same
 * files, one commit on the main line, a clean tree, the name `basename(path)`,
 * an id no other workspace holds, and a creation time of now. Costs one git
 * process (the amend), where creation costs six. `path` must not exist, or be
 * an empty directory — the same rule creation keeps.
 */
export async function preparedWorkspace(path: string): Promise<string> {
  const root = resolve(path);
  claimDestination(root);
  copyTree(await workspaceTemplate(), root);
  const record = await readDocument(root, workspaceRecordType);
  await writeDocument(root, workspaceRecordType, {
    data: {
      ...record.data,
      name: basename(root),
      id: mintWorkspaceId(),
      createdAt: new Date().toISOString(),
    },
    body: record.body,
  });
  // --reset-author: the commit is dated now and signed by whoever the test's
  // environment says, exactly as creation's own commit would be.
  gitOrThrow(root, 'commit', '--all', '--amend', '--no-edit', '--reset-author', '--quiet');
  return root;
}

/** What a prepared remote's one seed commit holds. */
export interface RemoteSeed {
  /** The branch the seed commit is pushed to, and the remote's HEAD. */
  readonly branch: string;
  /** Path (relative, `/`-separated) → content. */
  readonly files: Readonly<Record<string, string>>;
  /** The seed commit's message (default `seed`). */
  readonly message?: string;
}

/**
 * A bare repository at `path` holding one commit — `seed.files` on
 * `seed.branch` — with HEAD naming that branch: what `git init --bare`, a
 * seed clone, a commit, and a push leave behind, at no git process per copy.
 * Every copy made from one seed in one process carries the same commit id.
 */
export function preparedRemote(path: string, seed: RemoteSeed): string {
  const root = resolve(path);
  claimDestination(root);
  copyTree(remoteTemplate(seed), root);
  return root;
}

// -- templates ------------------------------------------------------------

const templateHome = ((): string => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'ward-test-prepared-')));
  process.on('exit', () => rmSync(dir, { recursive: true, force: true }));
  return dir;
})();

const workspaceTemplates = new Map<string, Promise<string>>();
const remoteTemplates = new Map<string, string>();
let nextTemplate = 0;

/**
 * The git environment a template was built under is part of what it is (the
 * main line's name comes from git's config, for one), so a template is
 * reused only under the same `GIT_*` variables it was built with.
 */
function gitEnvKey(): string {
  return JSON.stringify(
    Object.entries(process.env)
      .filter(([key]) => key.startsWith('GIT_'))
      .sort(([a], [b]) => (a < b ? -1 : 1)),
  );
}

function workspaceTemplate(): Promise<string> {
  const key = gitEnvKey();
  let template = workspaceTemplates.get(key);
  if (template === undefined) {
    template = buildWorkspaceTemplate();
    workspaceTemplates.set(key, template);
  }
  return template;
}

async function buildWorkspaceTemplate(): Promise<string> {
  nextTemplate += 1;
  const root = join(templateHome, `workspace-${nextTemplate}`);
  await createWorkspace(root);
  compact(root);
  return root;
}

function remoteTemplate(seed: RemoteSeed): string {
  const key = JSON.stringify([gitEnvKey(), seed.branch, seed.files, seed.message ?? 'seed']);
  const known = remoteTemplates.get(key);
  if (known !== undefined) return known;
  nextTemplate += 1;
  const bare = join(templateHome, `remote-${nextTemplate}.git`);
  const work = join(templateHome, `seed-${nextTemplate}`);
  gitOrThrow(templateHome, 'init', '--quiet', '--bare', `--initial-branch=${seed.branch}`, bare);
  gitOrThrow(templateHome, 'init', '--quiet', `--initial-branch=${seed.branch}`, work);
  for (const [file, content] of Object.entries(seed.files)) {
    mkdirSync(dirname(join(work, file)), { recursive: true });
    writeFileSync(join(work, file), content);
  }
  gitOrThrow(work, 'add', '--all');
  gitOrThrow(work, 'commit', '--quiet', '--message', seed.message ?? 'seed');
  gitOrThrow(work, 'push', '--quiet', bare, seed.branch);
  rmSync(work, { recursive: true, force: true });
  compact(bare);
  remoteTemplates.set(key, bare);
  return bare;
}

/**
 * Fewer files to copy, nothing a reader of the repository can tell apart:
 * loose objects go into one pack, and the inert `*.sample` hooks `git init`
 * installs are dropped (a copy runs no hook either way).
 */
function compact(root: string): void {
  gitOrThrow(root, 'repack', '-a', '-d', '--quiet');
  gitOrThrow(root, 'prune-packed', '--quiet');
  const gitDir = existsSync(join(root, '.git')) ? join(root, '.git') : root;
  rmSync(join(gitDir, 'hooks'), { recursive: true, force: true });
}

// -- copying --------------------------------------------------------------

function claimDestination(root: string): void {
  if (existsSync(root) && readdirSync(root).length > 0) {
    throw new Error(`prepared fixture: ${root} already exists and is not empty`);
  }
}

/**
 * A real copy, file by file: no hard links and no clonefile, so a test that
 * rewrites a file (git rewrites its index and refs in place) never changes a
 * template or a sibling's copy. Symbolic links are copied as the links they
 * are; every one a workspace holds is relative.
 */
function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else if (entry.isSymbolicLink()) symlinkSync(readlinkSync(source), target);
    else copyFileSync(source, target);
  }
}
