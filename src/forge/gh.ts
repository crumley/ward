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

export interface PrForgeState {
  readonly url: string;
  readonly state: PrState;
  /** Omitted when the forge reports no decision yet (or none at all). */
  readonly reviewDecision?: PrReviewDecision;
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

/** One PR via `gh pr view`; any failure — spawn, exit, deadline, parse — is null. */
async function readPr(gh: string, url: string, timeout: number): Promise<PrForgeState | null> {
  try {
    const proc = Bun.spawn([gh, 'pr', 'view', url, '--json', 'state,reviewDecision'], {
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
    if (typeof parsed !== 'object' || parsed === null) return null;
    const decision = reviewDecision(parsed);
    return {
      url,
      state: prState(parsed),
      ...(decision === undefined ? {} : { reviewDecision: decision }),
    };
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
