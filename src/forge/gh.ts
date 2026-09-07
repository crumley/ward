// The forge probe (design/0009-live-forge-state/): live PR state, read from
// the forge at the moment of asking and never stored — the task record keeps
// URLs only, because review state is the forge's truth and a stored copy is
// the stale cache §17 warns about (intent/01-concepts/03-work-lifecycle.md,
// Task states). This module is the thin adapter the remote-provider seam
// demands (intent/02-subsystems/06-remote-provider.md): today's forge is
// GitHub via `gh`; a second forge would be a sibling module behind the same
// neutral vocabulary.
//
// Degradation is one honest bit: `live` is false when the forge cannot be
// asked (gh absent, unauthenticated, offline, rate-limited, or past the
// deadline) and callers must render without forge state rather than fail.
// Two ambient seams keep the boundary testable through a spawned CLI:
// WARD_GH names the executable (tests point it at a fake; helpers pin it to
// an impossible path so no test ever reaches the machine's gh) and
// WARD_GH_TIMEOUT_MS overrides the deadline.

import { existsSync } from 'node:fs';

/** What the forge says about one PR, in Ward's vocabulary — never gh's. */
export type PrState = 'open' | 'merged' | 'closed' | 'unknown';
export type PrReviewDecision = 'approved' | 'changes-requested' | 'review-required';

/**
 * The forge's whole check rollup for one PR, collapsed to the four answers a
 * human acts on: `failing` if anything failed, else `pending` if anything is
 * still running, else `passing` — and `none` when the PR has no checks at
 * all, which is a different fact from "not asked" and must not read as green.
 * Collapsing is deliberate: which job failed is the forge's page to show, and
 * a per-check listing would put a CI dashboard on a glance
 * (intent/02-subsystems/07-human-shell.md).
 */
export type PrChecks = 'passing' | 'failing' | 'pending' | 'none';

export interface PrForgeState {
  readonly url: string;
  readonly state: PrState;
  /** Omitted when the forge reports no decision yet (or none at all). */
  readonly reviewDecision?: PrReviewDecision;
  /**
   * The merge commit's oid, when the forge reports one — rides in the same
   * single `gh pr view` call at zero added forge cost. On a forge, "merged"
   * means merged into the PR's base, not "reached the main line"; the oid is
   * what lets the close gate verify the difference against the repository
   * itself (design/0012-close-gate-reachability/). Omitted whenever the forge
   * reports none: absence degrades honestly, it is never guessed.
   */
  readonly mergeCommit?: string;
  /**
   * The branch the PR targets, when the forge reports one — one more field in
   * the same single call, zero added forge cost. An OPEN PR whose base is not
   * the repository's main line is the motivating incident's cause caught
   * early: merged as-is it delivers into a branch that may never land
   * (design/0014-stale-base-warning/). Omitted when the forge reports none —
   * absent stays absent, same convention as `reviewDecision`.
   */
  readonly baseRefName?: string;
  /**
   * The check rollup, collapsed — one more field in the same single
   * `gh pr view` call, zero added forge cost, the same bargain
   * `mergeCommit` and `baseRefName` struck. Omitted when the forge reports no
   * rollup at all: absence stays absence, never a guessed verdict.
   */
  readonly checks?: PrChecks;
}

export interface ForgeProbe {
  /**
   * True when the forge answered — at least one URL resolved, or there was
   * nothing to ask. False collapses every failure mode (absent, unauth,
   * offline, timeout): they are indistinguishable at this distance, and a
   * wrong "merged" is worse than an honest "unavailable".
   */
  readonly live: boolean;
  readonly states: ReadonlyMap<string, PrForgeState>;
}

const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Read the live state of every URL in one parallel, deadline-bounded pass.
 * Never throws and never hangs past the deadline — status is a
 * high-frequency verb, and the probe must cost nothing when the forge is
 * unreachable (absent binary: no spawn; hung network: at most the deadline).
 */
export async function probeForge(urls: readonly string[]): Promise<ForgeProbe> {
  const unique = [...new Set(urls)];
  if (unique.length === 0) return { live: true, states: new Map() };
  const gh = ghExecutable();
  if (gh === null) return { live: false, states: new Map() };
  const timeout = timeoutMs(DEFAULT_TIMEOUT_MS);
  const answers = await Promise.all(unique.map((url) => readPr(gh, url, timeout)));

  const states = new Map<string, PrForgeState>();
  for (const answer of answers) {
    if (answer !== null) states.set(answer.url, answer);
  }
  if (states.size === 0) return { live: false, states };
  for (const url of unique) {
    if (!states.has(url)) states.set(url, { url, state: 'unknown' });
  }
  return { live: true, states };
}

/**
 * The executable every forge read spawns: WARD_GH names it (the test seam,
 * and a human affordance for a nonstandard gh), otherwise `gh` on PATH. Null
 * when nothing spawnable exists — the override is verified too (a path must
 * exist; a bare name must resolve on PATH), so doctor's presence finding and
 * the probe always describe the same binary, and the hermetic test pin
 * (WARD_GH=/dev/null/gh) reads as absent everywhere
 * (design/0010-doctor-forge-auth/).
 */
export function ghExecutable(): string | null {
  const override = process.env.WARD_GH;
  if (override !== undefined && override !== '') {
    if (!override.includes('/')) return Bun.which(override);
    return existsSync(override) ? override : null;
  }
  return Bun.which('gh');
}

function timeoutMs(fallback: number): number {
  const override = Number.parseInt(process.env.WARD_GH_TIMEOUT_MS ?? '', 10);
  return Number.isNaN(override) || override <= 0 ? fallback : override;
}

/** Whether the installed gh can actually reach the forge — or nobody can say. */
export type ForgeAuth = 'authenticated' | 'unauthenticated' | 'unverified';

const AUTH_TIMEOUT_MS = 10_000;

/**
 * Doctor's health read (design/0010-doctor-forge-auth/): presence says the
 * binary exists, `gh auth status` says it can reach the forge — the exit
 * code alone decides, never gh's human-oriented output. The deadline is more
 * generous than the PR probe's (10 s vs 3 s) because doctor is on-demand
 * diagnosis, not a glance, and the auth check verifies the token over the
 * network — slowest exactly on the degraded links doctor gets run on;
 * WARD_GH_TIMEOUT_MS overrides both deadlines, one knob for "how long may
 * Ward wait on gh". A cut or unspawnable check is 'unverified', never
 * 'unauthenticated': the deadline expiring proves nothing about auth.
 */
export async function probeForgeAuth(): Promise<ForgeAuth> {
  const gh = ghExecutable();
  if (gh === null) return 'unverified';
  try {
    const proc = Bun.spawn([gh, 'auth', 'status'], {
      stdout: 'ignore',
      stderr: 'ignore',
      stdin: 'ignore',
      env: { ...process.env },
    });
    let cut = false;
    const deadline = setTimeout(() => {
      cut = true;
      proc.kill();
    }, timeoutMs(AUTH_TIMEOUT_MS));
    await proc.exited;
    clearTimeout(deadline);
    if (cut) return 'unverified';
    return proc.exitCode === 0 ? 'authenticated' : 'unauthenticated';
  } catch {
    return 'unverified';
  }
}

/**
 * The fields one `gh pr view` asks for. `statusCheckRollup` is asked for in
 * the SAME call as everything else, so the check verdict costs no extra forge
 * round trip — but it is asked for **separably**, because a token can be
 * allowed to read a pull request and not its checks: a fine-grained personal
 * access token without the commit-statuses permission fails the whole
 * GraphQL query rather than omitting one field. Bundling it unconditionally
 * would trade working review state for check state on such a token, which is
 * a worse answer than the one Ward already gave.
 */
const PR_FIELDS = 'state,reviewDecision,mergeCommit,baseRefName';
const PR_FIELDS_WITH_CHECKS = `${PR_FIELDS},statusCheckRollup`;

/**
 * One PR via `gh pr view`; any failure — spawn, exit, deadline, parse — is
 * null. The full field set is asked first and, when it fails, the core set is
 * asked once more within what is left of the same deadline: the retry costs
 * nothing on a healthy read (the first call answered) and buys back state and
 * review on a token that may not read checks. The deadline is absolute across
 * both attempts, so the probe's "never hangs past the deadline" promise is
 * exactly as strong as it was with one call.
 */
async function readPr(gh: string, url: string, timeout: number): Promise<PrForgeState | null> {
  const until = Date.now() + timeout;
  const full = await viewPr(gh, url, PR_FIELDS_WITH_CHECKS, timeout);
  const answer = full ?? (await retryWithoutChecks(gh, url, until));
  if (answer === null) return null;
  const decision = reviewDecision(answer);
  const oid = mergeCommitOid(answer);
  const base = baseRefName(answer);
  const checks = checkRollup(answer);
  return {
    url,
    state: prState(answer),
    ...(decision === undefined ? {} : { reviewDecision: decision }),
    ...(oid === undefined ? {} : { mergeCommit: oid }),
    ...(base === undefined ? {} : { baseRefName: base }),
    ...(checks === undefined ? {} : { checks }),
  };
}

/** The second attempt, inside the remaining deadline — skipped when none is left. */
async function retryWithoutChecks(gh: string, url: string, until: number): Promise<object | null> {
  const remaining = until - Date.now();
  if (remaining <= 0) return null;
  return viewPr(gh, url, PR_FIELDS, remaining);
}

/** One `gh pr view` invocation, parsed — null on spawn, exit, deadline, or parse failure. */
async function viewPr(
  gh: string,
  url: string,
  fields: string,
  timeout: number,
): Promise<object | null> {
  try {
    const proc = Bun.spawn([gh, 'pr', 'view', url, '--json', fields], {
      stdout: 'pipe',
      stderr: 'ignore',
      stdin: 'ignore',
      env: { ...process.env },
    });
    const deadline = setTimeout(() => proc.kill(), timeout);
    const [output] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    clearTimeout(deadline);
    if (proc.exitCode !== 0) return null;
    const parsed: unknown = JSON.parse(output);
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function prState(answer: object): PrState {
  const state = 'state' in answer ? answer.state : undefined;
  switch (state) {
    case 'OPEN':
      return 'open';
    case 'MERGED':
      return 'merged';
    case 'CLOSED':
      return 'closed';
    default:
      return 'unknown';
  }
}

function reviewDecision(answer: object): PrReviewDecision | undefined {
  const decision = 'reviewDecision' in answer ? answer.reviewDecision : undefined;
  switch (decision) {
    case 'APPROVED':
      return 'approved';
    case 'CHANGES_REQUESTED':
      return 'changes-requested';
    case 'REVIEW_REQUIRED':
      return 'review-required';
    default:
      return undefined;
  }
}

/** gh reports `"baseRefName": "main"` — a branch name, or nothing to report. */
function baseRefName(answer: object): string | undefined {
  const base = 'baseRefName' in answer ? answer.baseRefName : undefined;
  return typeof base === 'string' && base !== '' ? base : undefined;
}

/**
 * gh reports `"statusCheckRollup"` as an array of check runs and status
 * contexts — or null when the head commit has none at all. An empty array is
 * `none` (a PR with no checks); anything else collapses by the worst verdict
 * present, so one failure is `failing` no matter how many jobs are green.
 */
function checkRollup(answer: object): PrChecks | undefined {
  const rollup = 'statusCheckRollup' in answer ? answer.statusCheckRollup : undefined;
  if (!Array.isArray(rollup)) return undefined;
  if (rollup.length === 0) return 'none';
  let pending = false;
  for (const entry of rollup) {
    const verdict = checkVerdict(entry);
    if (verdict === 'failing') return 'failing';
    if (verdict === 'pending') pending = true;
  }
  return pending ? 'pending' : 'passing';
}

/**
 * One rollup entry's verdict. The two shapes gh returns are read through one
 * rule: a check run carries `conclusion` once it finishes (and null while it
 * runs), a status context carries `state` — so the first of the two that says
 * anything is the verdict, and saying nothing yet IS pending. An unrecognized
 * verdict is pending rather than passing: the safe direction, since a green
 * claim is the one this function must never make on a guess.
 */
function checkVerdict(entry: unknown): 'passing' | 'failing' | 'pending' {
  if (typeof entry !== 'object' || entry === null) return 'pending';
  const conclusion = 'conclusion' in entry ? entry.conclusion : undefined;
  const state = 'state' in entry ? entry.state : undefined;
  const verdict = typeof conclusion === 'string' && conclusion !== '' ? conclusion : state;
  switch (verdict) {
    case 'SUCCESS':
    case 'NEUTRAL':
    case 'SKIPPED':
      return 'passing';
    case 'FAILURE':
    case 'ERROR':
    case 'TIMED_OUT':
    case 'CANCELLED':
    case 'ACTION_REQUIRED':
    case 'STARTUP_FAILURE':
    case 'STALE':
      return 'failing';
    default:
      return 'pending';
  }
}

/** gh reports `"mergeCommit": {"oid": "…"}` for merged PRs, null otherwise. */
function mergeCommitOid(answer: object): string | undefined {
  const commit = 'mergeCommit' in answer ? answer.mergeCommit : undefined;
  if (typeof commit !== 'object' || commit === null) return undefined;
  const oid = 'oid' in commit ? commit.oid : undefined;
  return typeof oid === 'string' && oid !== '' ? oid : undefined;
}

// -- PR → repository mapping ----------------------------------------------

/**
 * Whether a PR URL lives in the repository a git remote names — the close
 * gate's URL→repository mapping (design/0012-close-gate-reachability/).
 * Identity is host + repository path, compared case-insensitively: the PR URL
 * contributes everything before its `/pull/` segment (the forge's URL shape
 * is this adapter's knowledge, like its state vocabulary), and the remote is
 * normalized across the forms git accepts (https, ssh://, scp-like
 * `git@host:path`). A local-path remote names no forge host, so nothing maps
 * to it — the caller degrades honestly rather than guessing.
 */
export function prBelongsToRemote(prUrl: string, remote: string): boolean {
  const pr = prLocator(prUrl);
  const repo = remoteLocator(remote);
  return pr !== null && repo !== null && pr.host === repo.host && pr.path === repo.path;
}

export interface RepoLocator {
  readonly host: string;
  readonly path: string;
}

/**
 * The forge a git remote names — host plus repository path — or null when the
 * remote names no forge at all (a filesystem path, an unparseable string).
 * The self-service upgrade asks this of the workspace's own `origin` before it
 * considers a pull request at all (design/0030-upgrade-self-service/): a
 * workspace repository commonly has no remote and needs none
 * (intent/01-concepts/06-workspace-lifecycle.md), so "there is no forge here"
 * is an ordinary answer to degrade on, never a failure.
 */
export function forgeRemote(remote: string): RepoLocator | null {
  return remoteLocator(remote);
}

function prLocator(prUrl: string): RepoLocator | null {
  try {
    const url = new URL(prUrl);
    const cut = url.pathname.indexOf('/pull/');
    if (cut < 0 || url.hostname === '') return null;
    return { host: url.hostname.toLowerCase(), path: repoPath(url.pathname.slice(0, cut)) };
  } catch {
    return null;
  }
}

function remoteLocator(remote: string): RepoLocator | null {
  let host: string;
  let path: string;
  if (remote.includes('://')) {
    try {
      const url = new URL(remote);
      host = url.hostname;
      path = url.pathname;
    } catch {
      return null;
    }
  } else {
    // scp-like `git@host:path` — the one remote form that is not a URL. A
    // plain filesystem path never matches this shape (no host before a colon).
    const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(remote);
    if (scp === null) return null;
    host = scp[1] ?? '';
    path = scp[2] ?? '';
  }
  if (host === '') return null;
  return { host: host.toLowerCase(), path: repoPath(path) };
}

function repoPath(path: string): string {
  return path
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.git$/, '')
    .toLowerCase();
}

// -- opening a pull request (design/0030-upgrade-self-service/) -------------

/**
 * The forge's answer about one pull request Ward wanted to exist. `existing`
 * is the convergent re-run (§6): the branch already has a PR, so the second
 * invocation reuses its URL instead of asking the forge for a duplicate.
 * `unavailable` is §20's honest bit — no gh, no auth, no network — and
 * `failed` is the forge answering "no"; both carry the reason, and neither is
 * ever thrown: the upgrade that asked for the PR has already committed, and
 * its task, worktree, and commit must stand and be named regardless.
 */
export interface PullRequestResult {
  readonly outcome: 'opened' | 'existing' | 'unavailable' | 'failed';
  /** Present exactly when the outcome is `opened` or `existing`. */
  readonly url?: string;
  readonly detail: string;
}

export interface PullRequestSpec {
  /** The branch the PR merges into, on the forge. */
  readonly base: string;
  /** The branch under review — already pushed by the caller. */
  readonly head: string;
  readonly title: string;
  readonly body: string;
}

const PR_TIMEOUT_MS = 30_000;

/**
 * Make sure `head` has a pull request on the forge, and say which way that
 * came true. Run with `dir` inside the repository, so gh resolves the
 * repository from its remotes exactly as a human's own `gh pr create` would —
 * Ward names no forge API of its own (the remote-provider seam,
 * intent/02-subsystems/06-remote-provider.md).
 *
 * The deadline is generous (30 s, WARD_GH_TIMEOUT_MS overrides): this is a
 * once-per-upgrade act whose answer changes what the human does next, the §20
 * case where precision is affordable — unlike the 3 s status probe.
 */
export async function ensurePullRequest(
  dir: string,
  spec: PullRequestSpec,
): Promise<PullRequestResult> {
  const gh = ghExecutable();
  if (gh === null) {
    return {
      outcome: 'unavailable',
      detail: 'gh is not installed (or WARD_GH names nothing spawnable); ward doctor names it',
    };
  }
  const timeout = timeoutMs(PR_TIMEOUT_MS);
  const existing = await runGh(gh, dir, timeout, ['pr', 'view', spec.head, '--json', 'url']);
  if (existing.exitCode === 0) {
    const url = pullRequestUrl(existing.stdout);
    if (url !== null) return { outcome: 'existing', url, detail: `already open for ${spec.head}` };
  }
  const created = await runGh(gh, dir, timeout, [
    'pr',
    'create',
    '--base',
    spec.base,
    '--head',
    spec.head,
    '--title',
    spec.title,
    '--body',
    spec.body,
  ]);
  if (created.exitCode !== 0) {
    const said = created.stderr.trim() === '' ? created.stdout.trim() : created.stderr.trim();
    return { outcome: 'failed', detail: said === '' ? 'gh pr create failed' : firstLine(said) };
  }
  // gh prints the new PR's URL, and nothing else, on stdout.
  const url = created.stdout.trim().split('\n').filter(isForgeUrl).pop();
  if (url === undefined) {
    return { outcome: 'failed', detail: 'gh pr create reported no pull-request URL' };
  }
  return { outcome: 'opened', url, detail: `opened against ${spec.base}` };
}

function pullRequestUrl(json: string): string | null {
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const url = 'url' in parsed ? parsed.url : undefined;
    return typeof url === 'string' && url !== '' ? url : null;
  } catch {
    return null;
  }
}

function isForgeUrl(line: string): boolean {
  return line.startsWith('http://') || line.startsWith('https://');
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? text;
}

/** One gh invocation, both streams captured, cut at the deadline. */
async function runGh(
  gh: string,
  cwd: string,
  timeout: number,
  args: readonly string[],
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  try {
    const proc = Bun.spawn([gh, ...args], {
      cwd,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
      env: { ...process.env },
    });
    let cut = false;
    const deadline = setTimeout(() => {
      cut = true;
      proc.kill();
    }, timeout);
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    clearTimeout(deadline);
    if (cut) return { exitCode: 1, stdout, stderr: `gh did not answer within ${timeout} ms` };
    return { exitCode: proc.exitCode ?? 1, stdout, stderr };
  } catch (error) {
    return { exitCode: 1, stdout: '', stderr: (error as Error).message };
  }
}
