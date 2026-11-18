// Repositories Ward does not own (design/0065-external-checkouts-and-repo-commands/):
// a canonical checkout that stands outside the workspace, a worktree made by
// the repository's own command (possibly outside the workspace too), and a
// main line brought up to date by the repository's own command. Remotes are
// local bare repositories and the commands are small scripts — no network.
//
// What must hold, in the order the cases come:
//   - an external checkout is registered without being cloned, moved, or
//     changed, and no path travels in the record;
//   - a machine that has not bound one is refused, naming the command;
//   - refresh never touches an external working tree that is dirty or off the
//     main line, and still learns the main line's tip;
//   - worktrees, rebase, close and remove work against it, and remove leaves it;
//   - an update command replaces fetch + fast-forward and is never run through
//     a dirty tree;
//   - a worktree command's result is read from git, never from the command,
//     and nothing is recorded unless it is a worktree on the named branch;
//   - an outside worktree is linked from its floor, so the context chain
//     passes the floor's manifest;
//   - a removal command is checked, not believed.
import { afterAll, beforeAll, beforeEach, expect, test } from 'bun:test';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { readBindingSync } from '../../src/global/checkouts.ts';
import { readDocument } from '../../src/store/document.ts';
import { workspaceRecordType } from '../../src/store/types.ts';
import { taskAddress } from '../../src/workspace/address.ts';
import { checkoutPath, resolveCheckout } from '../../src/workspace/checkouts.ts';
import { contextChain, contextTarget } from '../../src/workspace/context.ts';
import { runDoctor } from '../../src/workspace/doctor.ts';
import { git, gitOrThrow } from '../../src/workspace/git.ts';
import { openProject } from '../../src/workspace/projects.ts';
import {
  addRepository,
  refreshRepositories,
  remoteKey,
  removeRepository,
} from '../../src/workspace/repos.ts';
import { restoreWorkspace } from '../../src/workspace/restore.ts';
import { resolveOpenTask } from '../../src/workspace/scan.ts';
import { closeTask, openTask } from '../../src/workspace/tasks.ts';
import {
  createWorktree,
  listWorktrees,
  rebaseTaskWorktrees,
  worktreeStatuses,
} from '../../src/workspace/worktrees.ts';
import { applyGitTestEnv, makeTempDir, removeDir } from '../helpers.ts';
import { preparedRemote, preparedWorkspace } from '../prepared.ts';

// -- an external canonical checkout -------------------------------------------

test('add --external registers the checkout where it stands: nothing cloned, nothing changed, no path in the record', async () => {
  gitOrThrow(mine, 'checkout', '-b', 'my-work');
  writeFileSync(join(mine, 'wip.txt'), 'mine\n');
  const before = snapshot(mine);

  const report = await addRepository(ws, mine, undefined, { external: true });
  expect(report).toMatchObject({ outcome: 'registered', path: mine });
  expect(report.record).toMatchObject({
    name: 'mono',
    remote,
    mainLine: 'trunk',
    checkout: 'external',
  });
  expect(existsSync(join(ws, 'repos', 'mono'))).toBe(false);
  expect(snapshot(mine)).toEqual(before);
  expect(readFileSync(join(ws, 'repositories', 'mono.md'), 'utf8')).not.toContain(mine);
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
  expect(checkoutPath(ws, 'mono')).toBe(mine);
  expect(readBindingSync(await workspaceIdOf(ws), 'mono')).toBe(mine);

  expect((await addRepository(ws, mine, undefined, { external: true })).outcome).toBe('satisfied');
  // A path inside the checkout names the checkout.
  mkdirSync(join(mine, 'deep', 'er'), { recursive: true });
  expect((await addRepository(ws, join(mine, 'deep', 'er'), 'mono', { external: true })).path).toBe(
    mine,
  );
});

test('add --external refuses what it cannot honestly register', async () => {
  const plain = join(scratch, `plain-${caseId}`);
  mkdirSync(plain);
  const noOrigin = join(scratch, `no-origin-${caseId}`);
  gitOrThrow('.', 'init', '--initial-branch=trunk', noOrigin);
  const inside = join(ws, 'inside');
  gitOrThrow('.', 'clone', remote, inside);
  const refusals: readonly (readonly [string, RegExp])[] = [
    [join(scratch, 'nowhere'), /nothing is at/],
    [plain, /is not a git checkout/],
    [noOrigin, /has no 'origin' remote/],
    [inside, /is inside the workspace/],
  ];
  for (const [source, why] of refusals) {
    expect(addRepository(ws, source, 'mono', { external: true })).rejects.toThrow(why);
  }
  expect(existsSync(join(ws, 'repositories', 'mono.md'))).toBe(false);

  // A name already registered with a contained checkout is not redefined…
  await addRepository(ws, remote, 'contained');
  expect(addRepository(ws, mine, 'contained', { external: true })).rejects.toThrow(
    /already registered with a checkout contained/,
  );
  // …nor is an external record bound to a checkout of another repository.
  await addRepository(ws, mine, 'mono', { external: true });
  const other = cloneOf(seedRemote('other'), 'other');
  expect(addRepository(ws, other, 'mono', { external: true })).rejects.toThrow(/refusing to bind/);
});

const REMOTE_KEYS: readonly (readonly [string, string])[] = [
  ['git@github.com:acme/mono.git', 'github.com/acme/mono'],
  ['https://github.com/acme/mono', 'github.com/acme/mono'],
  ['https://GitHub.com/acme/mono.git/', 'github.com/acme/mono'],
  ['ssh://git@github.com/acme/mono.git', 'github.com/acme/mono'],
  ['https://token@github.com/acme/mono.git', 'github.com/acme/mono'],
  ['/srv/git/mono.git', '/srv/git/mono'],
  ['git@github.com:acme/other.git', 'github.com/acme/other'],
];

test.each(REMOTE_KEYS)('one repository, however its remote is spelled: %s → %s', (spelled, key) => {
  expect(remoteKey(spelled)).toBe(key);
});

test('a machine that has not bound the checkout is refused, naming the command — and that command binds it', async () => {
  await addRepository(ws, mine, undefined, { external: true });
  await openTask(ws, 'work', { floor: 1 });
  process.env.WARD_STATE_DIR = join(scratch, `another-machine-${caseId}`); // the record arrived by pull

  const bind = /ward repo add PATH --external --name mono/;
  expect(resolveCheckout(ws, 'mono')).toEqual({ name: 'mono', external: true });
  expect(() => checkoutPath(ws, 'mono')).toThrow(bind);
  const [refresh] = await refreshRepositories(ws, 'mono');
  expect(refresh).toMatchObject({ outcome: 'failed', detail: expect.stringMatching(bind) });
  expect(createWorktree(ws, 'f1t1', 'mono')).rejects.toThrow(bind);
  expect(addRepository(ws, remote, 'mono')).rejects.toThrow(bind); // never converged by cloning
  expect(existsSync(join(ws, 'repos', 'mono'))).toBe(false);
  expect(await repoFinding('mono')).toMatchObject({
    severity: 'warn',
    message: expect.stringMatching(bind),
  });
  const restored = await restoreWorkspace(ws);
  expect(restored.repositories).toEqual([
    { name: 'mono', outcome: 'failed', detail: expect.stringMatching(bind) },
  ]);

  // This machine keeps its own clone somewhere else.
  const theirs = cloneOf(remote, 'theirs');
  expect(await addRepository(ws, theirs, 'mono', { external: true })).toMatchObject({
    outcome: 'converged',
    path: theirs,
  });
  expect(git(ws, 'status', '--porcelain').stdout).toBe(''); // binding wrote no record
  expect((await refreshRepositories(ws, 'mono'))[0]?.outcome).toBe('current');
  expect(await repoFinding('mono')).toMatchObject({ severity: 'ok' });
});

test('refresh leaves an external working tree alone when it is dirty or off the main line, and still learns the tip', async () => {
  await addRepository(ws, mine, undefined, { external: true });

  // Clean and on the main line: fast-forwarded, as a contained checkout is.
  const first = commitToRemote('one.txt');
  expect((await refreshRepositories(ws, 'mono'))[0]).toMatchObject({ outcome: 'refreshed' });
  expect(head(mine)).toBe(first);

  // Dirty: fetched, not touched — and not a refusal, because the tree is its owner's.
  writeFileSync(join(mine, 'wip.txt'), 'mine\n');
  const second = commitToRemote('two.txt');
  const dirty = (await refreshRepositories(ws, 'mono'))[0];
  expect(dirty).toMatchObject({
    outcome: 'refreshed',
    detail: expect.stringMatching(/working tree left alone \(it has uncommitted changes\)/),
  });
  expect(head(mine)).toBe(first);
  expect(rev(mine, 'origin/trunk')).toBe(second);
  expect(readFileSync(join(mine, 'wip.txt'), 'utf8')).toBe('mine\n');

  // On another branch: the same.
  rmSync(join(mine, 'wip.txt'));
  gitOrThrow(mine, 'checkout', '-b', 'my-work');
  const third = commitToRemote('three.txt');
  const away = (await refreshRepositories(ws, 'mono'))[0];
  expect(away?.detail).toMatch(/working tree left alone \(it is on 'my-work'\)/);
  expect(head(mine)).toBe(first);
  expect(rev(mine, 'origin/trunk')).toBe(third);
  expect((await refreshRepositories(ws, 'mono'))[0]?.outcome).toBe('current');
});

test('a task works against an external checkout end to end, and removal leaves the checkout standing', async () => {
  await addRepository(ws, mine, undefined, { external: true });
  gitOrThrow(mine, 'checkout', '-b', 'my-work'); // the owner is busy in it
  await openTask(ws, 'work', { floor: 1 });
  const tip = commitToRemote('landed.txt');

  const { record } = await createWorktree(ws, 'f1t1', 'mono');
  expect(record).toMatchObject({ repo: 'mono', branch: 'work', path: 'floors/1-main/f1t1-work' });
  const worktree = join(ws, record.path);
  expect(head(worktree)).toBe(tip); // cut from the refreshed tip, not from where the owner stands

  commitToRemote('later.txt');
  await refreshRepositories(ws, 'mono');
  expect((await statuses('f1t1'))[0]).toMatchObject({ freshness: 'behind', behindBy: 1 });
  expect((await rebaseTaskWorktrees(ws, 'f1t1')).reports[0]?.outcome).toBe('rebased');
  expect((await statuses('f1t1'))[0]?.freshness).toBe('current');

  expect(removeRepository(ws, 'mono')).rejects.toThrow(/anchors worktrees of open task f1t1/);
  const closed = await closeTask(ws, 'f1t1', 'delivered');
  expect(closed.steps).toContainEqual({ step: `worktree ${record.path}`, detail: 'removed' });
  expect(existsSync(worktree)).toBe(false);

  writeFileSync(join(mine, 'wip.txt'), "unrecorded, and none of Ward's business\n");
  const before = snapshot(mine);
  const removed = await removeRepository(ws, 'mono');
  expect(removed).toMatchObject({ checkout: 'kept', path: mine });
  expect(snapshot(mine)).toEqual(before);
  expect(existsSync(join(ws, 'repositories', 'mono.md'))).toBe(false);
  expect(readBindingSync(await workspaceIdOf(ws), 'mono')).toBeUndefined();
});

test('a branch cut from an external checkout is measured against origin, not against where its owner stands', async () => {
  await addRepository(ws, mine, undefined, { external: true });
  await openTask(ws, 'work', { floor: 1 });
  commitToRemote('ahead-of-local-trunk.txt'); // the owner's local trunk is now behind origin
  gitOrThrow(mine, 'checkout', '-b', 'my-work');
  const { record } = await createWorktree(ws, 'f1t1', 'mono');
  // Nothing committed on the task branch: a delivered close with no PR must not
  // mistake origin's own commits for unlanded work.
  expect((await closeTask(ws, 'f1t1', 'delivered')).outcome).toBe('delivered');

  const more = taskAddress(await openTask(ws, 'more', { floor: 1 }));
  const again = await createWorktree(ws, more, 'mono');
  commitIn(join(ws, again.record.path), 'unlanded.txt');
  expect(closeTask(ws, more, 'delivered')).rejects.toThrow(/never reached a PR/);
  expect(record.path).toBe('floors/1-main/f1t1-work');
});

// -- a custom update command ---------------------------------------------------

test('an update command runs in place of fetch + fast-forward, told about the repository', async () => {
  await addRepository(ws, remote, 'mono');
  const seen = join(scratch, `seen-${caseId}`);
  const sync = script(
    'sync',
    `printf '%s\\n' "$1" "$WARD_CHECKOUT" "$WARD_MAIN_LINE" "$PWD" > "${seen}"\ngit fetch origin`,
  );
  configure({ mono: { update: [sync, '{repo}'] } });

  const tip = commitToRemote('one.txt');
  const checkout = checkoutPath(ws, 'mono');
  const before = head(checkout);
  expect((await refreshRepositories(ws, 'mono'))[0]).toMatchObject({
    outcome: 'refreshed',
    detail: expect.stringMatching(/^origin\/trunk \w+ → \w+ \(update command\)$/),
  });
  expect(readFileSync(seen, 'utf8').trim().split('\n')).toEqual([
    'mono',
    checkout,
    'trunk',
    checkout,
  ]);
  expect(rev(checkout, 'origin/trunk')).toBe(tip);
  expect(head(checkout)).toBe(before); // Ward added no fast-forward of its own
  expect((await refreshRepositories(ws, 'mono'))[0]?.outcome).toBe('current');
});

const UPDATE_FAILURES: readonly (readonly [string, string, RegExp])[] = [
  [
    'exits non-zero',
    'echo "no network" >&2; exit 3',
    /update command failed — .* exited 3: no network/,
  ],
  ['is not a program', '', /update command failed — .* did not run to an exit code/],
  ['uses a value an update is not given', 'true', /uses \{branch\}, which Ward does not provide/],
];

test.each(UPDATE_FAILURES)(
  'an update command that %s fails the refresh, and what stands on it',
  async (name, body, why) => {
    await addRepository(ws, remote, 'mono');
    await openTask(ws, 'work', { floor: 1 });
    await createWorktree(ws, 'f1t1', 'mono');
    const program = name === 'is not a program' ? '/no/such/ward-test-sync' : script('sync', body);
    configure({ mono: { update: name.startsWith('uses') ? [program, '{branch}'] : [program] } });

    expect((await refreshRepositories(ws, 'mono'))[0]).toMatchObject({
      outcome: 'failed',
      detail: expect.stringMatching(why),
    });
    // A rebase onto a tip that could not be refreshed is refused, as it always was.
    commitIn(join(ws, 'floors/1-main/f1t1-work'), 'mine.txt');
    expect((await rebaseTaskWorktrees(ws, 'f1t1')).reports[0]).toMatchObject({
      outcome: 'failed',
      detail: expect.stringMatching(/cannot refresh repos\/mono/),
    });
  },
);

test('an update command is never run through a dirty tree', async () => {
  await addRepository(ws, remote, 'mono');
  const ran = join(scratch, `ran-${caseId}`);
  configure({ mono: { update: [script('sync', `touch "${ran}"`)] } });
  writeFileSync(join(checkoutPath(ws, 'mono'), 'wip.txt'), 'unrecorded\n');
  expect((await refreshRepositories(ws, 'mono'))[0]?.outcome).toBe('dirty');
  expect(existsSync(ran)).toBe(false);
});

// -- a custom worktree command ---------------------------------------------------

test('a worktree command that makes the worktree where Ward proposes is recorded like any other', async () => {
  await addRepository(ws, remote, 'mono');
  await openTask(ws, 'work', { floor: 1 });
  const seen = join(scratch, `seen-${caseId}`);
  configure({
    mono: {
      worktree: {
        create: [
          script(
            'wt',
            `printf '%s\\n' "$@" > "${seen}"\ngit worktree add -q -b "$1" "$2" "$3"\ntouch "$2/.setup-done"`,
          ),
          '{branch}',
          '{path}',
          '{base}',
          '{task}',
        ],
      },
    },
  });
  const { record } = await createWorktree(ws, 'f1t1', 'mono');
  expect(record).toEqual({
    type: 'worktree',
    repo: 'mono',
    branch: 'work',
    disposition: 'deliverable',
    path: 'floors/1-main/f1t1-work',
    createdAt: record.createdAt,
  });
  expect(readFileSync(seen, 'utf8').trim().split('\n')).toEqual([
    'work',
    join(ws, 'floors/1-main/f1t1-work'),
    'origin/trunk',
    'f1t1',
  ]);
  expect(existsSync(join(ws, record.path, '.setup-done'))).toBe(true);
  expect((await createWorktree(ws, 'f1t1', 'mono')).record).toEqual(record); // convergent
});

test('a worktree made outside the workspace — in a path with spaces — is found through git, linked from its floor, and worked like any other', async () => {
  await addRepository(ws, remote, 'mono');
  await openTask(ws, 'work', { floor: 1 });
  const elsewhere = join(scratch, `their trees ${caseId}`);
  configure({
    mono: { worktree: { create: [script('wt', OUTSIDE_SCRIPT), elsewhere, '{branch}', '{base}'] } },
  });

  const { record } = await createWorktree(ws, 'f1t1', 'mono');
  const outside = join(elsewhere, 'work');
  expect(record).toMatchObject({ path: outside, machine: 'test', branch: 'work' });
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');

  // The floor reaches it, so the reading rule's path passes the floor's manifest.
  const link = join(ws, 'floors/1-main/f1t1-work');
  expect(lstatSync(link).isSymbolicLink()).toBe(true);
  expect(realpathSync(link)).toBe(outside);
  writeFileSync(join(outside, 'AGENTS.md'), '# theirs\n');
  const through = ['AGENTS.md', 'floors/1-main/AGENTS.md', 'floors/1-main/f1t1-work/AGENTS.md'];
  expect(contextChain(ws, join(link, 'src')).chain.map((level) => level.agents)).toEqual(through);
  // Named by where it really stands, the chain is the same one.
  const mapped = await contextTarget(ws, join(outside, 'src', 'file.ts'));
  expect(mapped).toBe(join(link, 'src', 'file.ts'));
  expect(contextChain(ws, mapped).chain.map((level) => level.agents)).toEqual(through);
  expect(() => contextChain(ws, join(scratch, 'unrelated'))).toThrow(/outside the workspace/);
  rmSync(join(outside, 'AGENTS.md'));

  // Listing, freshness and rebase read it where it stands.
  expect(await listWorktrees(ws)).toMatchObject([{ present: true, record: { path: outside } }]);
  commitToRemote('later.txt');
  await refreshRepositories(ws, 'mono');
  expect((await statuses('f1t1'))[0]).toMatchObject({ freshness: 'behind', behindBy: 1 });
  expect((await rebaseTaskWorktrees(ws, 'f1t1')).reports[0]?.outcome).toBe('rebased');
  expect(await worktreeFinding(outside)).toMatchObject({ severity: 'ok' });

  // The link is derived state: lost, it is named, and re-running create puts it back.
  rmSync(link);
  expect(await worktreeFinding(outside)).toMatchObject({
    severity: 'warn',
    message: expect.stringMatching(/does not link onto it/),
  });
  expect((await createWorktree(ws, 'f1t1', 'mono')).record).toEqual(record);
  expect(realpathSync(link)).toBe(outside);

  // With no removal command, git removes it where it stands — and the link goes too.
  writeFileSync(join(outside, 'wip.txt'), 'unrecorded\n');
  expect(closeTask(ws, 'f1t1', 'delivered')).rejects.toThrow(/has uncommitted changes/); // the fail-safe holds out there
  rmSync(join(outside, 'wip.txt'));
  const closed = await closeTask(ws, 'f1t1', 'delivered');
  expect(closed.steps).toContainEqual({ step: `worktree ${outside}`, detail: 'removed' });
  expect(existsSync(outside)).toBe(false);
  expect(existsSync(link)).toBe(false);
  expect(() => lstatSync(link)).toThrow();
});

test('on another machine an outside worktree is not missing: it stands where this one cannot look', async () => {
  await addRepository(ws, remote, 'mono');
  await openTask(ws, 'work', { floor: 1 });
  const elsewhere = join(scratch, `trees-${caseId}`);
  configure({
    mono: { worktree: { create: [script('wt', OUTSIDE_SCRIPT), elsewhere, '{branch}', '{base}'] } },
  });
  const { record } = await createWorktree(ws, 'f1t1', 'mono');

  process.env.WARD_MACHINE = 'laptop';
  rmSync(record.path, { recursive: true }); // what `laptop` sees at that path: nothing
  expect((await statuses('f1t1'))[0]).toMatchObject({
    freshness: 'unreadable',
    detail: "unreadable (stands on machine 'test')",
  });
  expect((await rebaseTaskWorktrees(ws, 'f1t1')).reports[0]?.detail).toMatch(
    /stands on machine 'test'/,
  );
  expect(await worktreeFinding(record.path)).toMatchObject({ severity: 'info' });
  expect((await restoreWorkspace(ws)).worktrees[0]).toMatchObject({
    outcome: 'satisfied',
    detail: expect.stringMatching(/stands on machine 'test'/),
  });
  const closed = await closeTask(ws, 'f1t1', 'abandoned');
  expect(closed.steps.find((step) => step.step.startsWith('worktree'))?.detail).toMatch(
    /stands on machine 'test' — not removed from here/,
  );

  // Back on the machine that made it, gone is gone — and restore does not rerun the command.
  process.env.WARD_MACHINE = 'test';
  const again = taskAddress(await openTask(ws, 'again', { floor: 1 }));
  const second = await createWorktree(ws, again, 'mono');
  rmSync(second.record.path, { recursive: true });
  expect((await restoreWorkspace(ws)).worktrees[0]).toMatchObject({
    outcome: 'failed',
    detail: expect.stringMatching(/restore does not rerun that command/),
  });
});

test('a branch name full of shell syntax reaches the command as one argument and runs nothing', async () => {
  await addRepository(ws, remote, 'mono');
  await openTask(ws, 'work', { floor: 1 });
  const elsewhere = join(scratch, `trees-${caseId}`);
  // Every character here is legal in a git branch name (a space is not).
  const hostile = 'x/$(touch${IFS}pwned);`touch${IFS}pwned`&&y|z\'"q>pwned';
  configure({
    mono: { worktree: { create: [script('wt', OUTSIDE_SCRIPT), elsewhere, '{branch}', '{base}'] } },
  });

  const { record } = await createWorktree(ws, 'f1t1', 'mono', hostile);
  expect(record.branch).toBe(hostile);
  expect(git(record.path, 'symbolic-ref', '--short', 'HEAD').stdout.trim()).toBe(hostile);
  for (const dir of [ws, checkoutPath(ws, 'mono'), elsewhere, record.path, process.cwd()]) {
    expect(existsSync(join(dir, 'pwned'))).toBe(false);
  }
});

// Each row: what the command does, and why nothing may be recorded for it.
const BAD_CREATES: readonly (readonly [string, string, RegExp])[] = [
  [
    'exits non-zero halfway, after making the worktree',
    'git worktree add -q -b "$2" "$1/$2" "$3"; echo "setup step failed" >&2; exit 4',
    /worktree command failed — .* exited 4: setup step failed\. Nothing was recorded\. It left a worktree at .* remove it/,
  ],
  [
    'exits non-zero before making anything',
    'echo "no licence" >&2; exit 2',
    /exited 2: no licence\. Nothing was recorded\.$/,
  ],
  [
    'exits 0 having made nothing',
    'exit 0',
    /exited 0, but git knows no worktree of .* on branch 'work'/,
  ],
  [
    'makes a worktree on a branch of its own choosing',
    'git worktree add -q -b "their-name" "$1/x" "$3"',
    /exited 0, but git knows no worktree of .* on branch 'work'/,
  ],
  [
    'makes a plain directory and calls it done',
    'mkdir -p "$1/$2"; echo "$1/$2"',
    /exited 0, but git knows no worktree/,
  ],
  [
    'makes the worktree and then deletes its directory',
    'git worktree add -q -b "$2" "$1/$2" "$3"; rm -rf "$1/$2"',
    /is not on disk\. Nothing was recorded/,
  ],
  [
    'makes the worktree inside the workspace, away from the path Ward proposed',
    'git worktree add -q -b "$2" "$WARD_WORKSPACE/floors/elsewhere" "$3"',
    /inside the workspace but not at the path Ward proposed/,
  ],
];

test.each(BAD_CREATES)('a worktree command that %s records nothing', async (_name, body, why) => {
  await addRepository(ws, remote, 'mono');
  await openTask(ws, 'work', { floor: 1 });
  const elsewhere = join(scratch, `trees-${caseId}`);
  mkdirSync(elsewhere);
  configure({
    mono: { worktree: { create: [script('wt', body), elsewhere, '{branch}', '{base}'] } },
  });
  const journal = head(ws);

  expect(createWorktree(ws, 'f1t1', 'mono')).rejects.toThrow(why);
  expect(head(ws)).toBe(journal);
  expect(git(ws, 'status', '--porcelain').stdout).toBe('');
  expect(await listWorktrees(ws)).toEqual([]);
  expect(() => lstatSync(join(ws, 'floors/1-main/f1t1-work'))).toThrow(); // no link onto nothing
});

test('a branch name git would refuse never reaches the worktree command', async () => {
  await addRepository(ws, remote, 'mono');
  await openTask(ws, 'work', { floor: 1 });
  const ran = join(scratch, `ran-${caseId}`);
  configure({ mono: { worktree: { create: [script('wt', `touch "${ran}"`), '{branch}'] } } });
  for (const branch of ['-rf', 'two words', 'a..b', 'ends.lock']) {
    expect(createWorktree(ws, 'f1t1', 'mono', branch)).rejects.toThrow(
      /is not a valid branch name/,
    );
  }
  expect(existsSync(ran)).toBe(false);
});

// -- a custom removal command -----------------------------------------------------

test('a removal command runs in place of git worktree remove, told the outcome', async () => {
  await addRepository(ws, remote, 'mono');
  await openTask(ws, 'work', { floor: 1 });
  const elsewhere = join(scratch, `trees-${caseId}`);
  const seen = join(scratch, `seen-${caseId}`);
  configure({
    mono: {
      worktree: {
        create: [script('wt', OUTSIDE_SCRIPT), elsewhere, '{branch}', '{base}'],
        remove: [
          script('unwt', `printf '%s\\n' "$@" > "${seen}"\ngit worktree remove --force "$1"`),
          '{path}',
          '{outcome}',
          '{branch}',
          '{task}',
        ],
      },
    },
  });
  const { record } = await createWorktree(ws, 'f1t1', 'mono');
  const closed = await closeTask(ws, 'f1t1', 'abandoned');
  expect(closed.steps).toContainEqual({
    step: `worktree ${record.path}`,
    detail: 'discarded by the removal command',
  });
  expect(readFileSync(seen, 'utf8').trim().split('\n')).toEqual([
    record.path,
    'abandoned',
    'work',
    'f1t1',
  ]);
  expect(existsSync(record.path)).toBe(false);
  expect(() => lstatSync(join(ws, 'floors/1-main/f1t1-work'))).toThrow();
});

const BAD_REMOVES: readonly (readonly [string, string, RegExp])[] = [
  [
    'fails',
    'echo "locked by another process" >&2; exit 5',
    /removal command failed — .* exited 5: locked by another process/,
  ],
  [
    'exits 0 and leaves the worktree standing',
    'exit 0',
    /exited 0 but the directory is still there/,
  ],
];

test.each(BAD_REMOVES)(
  'a removal command that %s refuses the close, and the task stays open',
  async (_name, body, why) => {
    await addRepository(ws, remote, 'mono');
    await openTask(ws, 'work', { floor: 1 });
    configure({ mono: { worktree: { remove: [script('unwt', body), '{path}'] } } });
    const { record } = await createWorktree(ws, 'f1t1', 'mono');
    const journal = head(ws);

    expect(closeTask(ws, 'f1t1', 'delivered')).rejects.toThrow(why);
    expect(existsSync(join(ws, record.path))).toBe(true);
    expect(head(ws)).toBe(journal);
    expect((await listWorktrees(ws))[0]?.present).toBe(true);
    // Fix the machine's command and the same close goes through.
    configure({});
    expect((await closeTask(ws, 'f1t1', 'delivered')).outcome).toBe('delivered');
  },
);

test('a removal command is handed only what git lists as a worktree of the checkout', async () => {
  await addRepository(ws, remote, 'mono');
  await openTask(ws, 'work', { floor: 1 });
  const ran = join(scratch, `ran-${caseId}`);
  configure({
    mono: { worktree: { remove: [script('unwt', `touch "${ran}"; rm -rf "$1"`), '{path}'] } },
  });
  const { record } = await createWorktree(ws, 'f1t1', 'mono');
  // The record still names the path, but what stands there is no longer the worktree.
  gitOrThrow(checkoutPath(ws, 'mono'), 'worktree', 'remove', join(ws, record.path));
  mkdirSync(join(ws, record.path));
  writeFileSync(join(ws, record.path, 'precious.txt'), 'not a worktree\n');

  expect(closeTask(ws, 'f1t1', 'abandoned')).rejects.toThrow(
    /is not a worktree of repos\/mono that git knows/,
  );
  expect(existsSync(ran)).toBe(false);
  expect(existsSync(join(ws, record.path, 'precious.txt'))).toBe(true);
});

// -- doctor ------------------------------------------------------------------------

test('doctor says what this machine will run for a repository, and what could not run', async () => {
  await addRepository(ws, remote, 'mono');
  configure({
    mono: {
      update: ['git', 'fetch', 'origin'],
      worktree: {
        create: ['/no/such/ward-test-wt', '{branch}'],
        remove: ['git', 'worktree', 'remove', '{base}'],
      },
    },
    'not-registered-here': { update: ['/no/such/tool'] }, // another workspace's business
  });
  const findings = (await runDoctor(ws)).workspace
    .filter((finding) => /^repository .* command$/.test(finding.check))
    .map((finding) => [finding.check, finding.severity, finding.message]);
  expect(findings).toEqual([
    ['repository mono update command', 'info', 'runs: ["git","fetch","origin"]'],
    ['repository mono worktree.create command', 'warn', expect.stringMatching(/cannot be found/)],
    ['repository mono worktree.remove command', 'warn', expect.stringMatching(/uses \{base\}/)],
  ]);
});

test('doctor names an external checkout that has gone missing, with the command that binds it again', async () => {
  await addRepository(ws, mine, undefined, { external: true });
  expect(await repoFinding('mono')).toMatchObject({
    severity: 'ok',
    message: `external checkout present at ${mine}, reading origin/trunk`,
  });
  rmSync(mine, { recursive: true });
  expect(await repoFinding('mono')).toMatchObject({
    severity: 'warn',
    message: expect.stringMatching(
      /external checkout is missing at .* ward repo add PATH --external --name mono/,
    ),
  });
  expect((await refreshRepositories(ws, 'mono'))[0]).toMatchObject({
    outcome: 'failed',
    detail: expect.stringMatching(/the external checkout is missing at/),
  });
});

// -- fixtures ---------------------------------------------------------------

/**
 * A worktree tool with a layout of its own: `wt ROOT BRANCH BASE` makes the
 * worktree at ROOT/<branch with slashes flattened>, outside the workspace.
 */
const OUTSIDE_SCRIPT =
  'mkdir -p "$1"\ngit worktree add -q -b "$2" "$1/$(printf "%s" "$2" | tr -c "A-Za-z0-9\\n" "_")" "$3"';

let scratch: string;
let ws: string;
let remote: string;
/** A checkout of `remote` that stands outside the workspace: somebody's own. */
let mine: string;
let configDir: string;
let caseId = 0;

type Commands = Record<
  string,
  { update?: string[]; worktree?: { create?: string[]; remove?: string[] } }
>;

/** Write this machine's configuration: the only place a command comes from. */
function configure(repositories: Commands): void {
  mkdirSync(configDir, { recursive: true });
  writeFileSync(
    join(configDir, 'config.md'),
    `---\n${JSON.stringify({ type: 'ward-config', repositories })}\n---\n`,
  );
}

function script(name: string, body: string): string {
  const path = join(scratch, `${name}-${caseId}`);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

function head(dir: string): string {
  return rev(dir, 'HEAD');
}

function rev(dir: string, ref: string): string {
  return gitOrThrow(dir, 'rev-parse', ref).stdout.trim();
}

/** Everything about a checkout Ward must not have changed. */
function snapshot(dir: string): Record<string, string> {
  return {
    head: head(dir),
    branch: git(dir, 'symbolic-ref', '--short', 'HEAD').stdout,
    status: git(dir, 'status', '--porcelain').stdout,
    origin: git(dir, 'config', '--get', 'remote.origin.url').stdout,
    refs: git(dir, 'for-each-ref').stdout,
    worktrees: git(dir, 'worktree', 'list').stdout,
  };
}

function commitIn(dir: string, file: string): string {
  writeFileSync(join(dir, file), `${file}\n`);
  gitOrThrow(dir, 'add', '-A');
  gitOrThrow(dir, 'commit', '-m', `add ${file}`);
  return head(dir);
}

/** Land a commit on the remote's main line from a clone of its own. */
function commitToRemote(file: string): string {
  const stage = join(scratch, `stage-${caseId}`);
  if (!existsSync(stage)) gitOrThrow('.', 'clone', remote, stage);
  gitOrThrow(stage, 'pull', '--ff-only', 'origin', 'trunk');
  const sha = commitIn(stage, file);
  gitOrThrow(stage, 'push', 'origin', 'trunk');
  return sha;
}

function seedRemote(name: string): string {
  const path = join(scratch, `remote-${caseId}`, `${name}.git`);
  mkdirSync(path, { recursive: true });
  return preparedRemote(path, {
    branch: 'trunk',
    files: { 'seed.txt': 'seed.txt\n' },
    message: 'add seed.txt',
  });
}

function cloneOf(source: string, name: string): string {
  const path = join(scratch, `${name}-${caseId}`);
  gitOrThrow('.', 'clone', source, path);
  return path;
}

async function workspaceIdOf(root: string): Promise<string> {
  return (await readDocument(root, workspaceRecordType)).data.id ?? '';
}

async function statuses(address: string) {
  return worktreeStatuses(ws, (await resolveOpenTask(ws, address)).dir);
}

async function repoFinding(name: string) {
  const report = await runDoctor(ws);
  return report.workspace.find((finding) => finding.check === `repository ${name}`);
}

async function worktreeFinding(path: string) {
  const report = await runDoctor(ws);
  return report.workspace.find((finding) => finding.check === `worktree ${path}`);
}

beforeAll(() => {
  applyGitTestEnv();
  scratch = makeTempDir();
});

beforeEach(async () => {
  caseId += 1;
  // Each case is its own machine: its own configuration, its own bindings.
  applyGitTestEnv();
  configDir = join(scratch, `config-${caseId}`);
  process.env.WARD_CONFIG_DIR = configDir;
  process.env.WARD_STATE_DIR = join(scratch, `state-${caseId}`);
  ws = join(scratch, `ws-${caseId}`);
  await preparedWorkspace(ws);
  await openProject(ws, 'main');
  remote = seedRemote('mono');
  // In a directory of its own, so the checkout is named `mono` in every case.
  mine = join(scratch, `mine-${caseId}`, 'mono');
  mkdirSync(join(scratch, `mine-${caseId}`));
  gitOrThrow('.', 'clone', remote, mine);
});

afterAll(() => {
  applyGitTestEnv(); // hand the next file the shared hermetic directories back
  removeDir(scratch);
});
