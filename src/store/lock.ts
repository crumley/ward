// Serialized store writes (design/0013-telemetry-and-serialized-writes/):
// the last rung of the no-lost-updates ladder — derive → append → one owner →
// serialize the few unavoidable shared writes
// (intent/00-foundation/01-principles.md §17,
// intent/02-subsystems/00-metadata-store.md). The primitive is a plain
// filesystem lock, honoring the store contract: no resident process (safe
// from a cold start); legible contention (the lock file names its holder, so
// "who holds it" is answerable from the workspace itself); fail-safe takeover
// (a crashed writer never wedges the store — a provably-dead or unknowably-old
// holder is taken over through a rename-and-verify break that is safe to
// repeat, §6); sized to its real load (brief critical sections, a bounded
// wait, an honest refusal when it is exceeded).
import {
  linkSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { hostname } from 'node:os';
import { join } from 'node:path';
import { WardError } from '../errors.ts';

export interface LockHolder {
  readonly pid: number;
  readonly host: string;
  /** The verb holding the lock, in CLI words (`task open json-output`). */
  readonly verb: string;
  /** Human-or-agent, from the WARD_AGENT declaration (design/0005-agent-audience/). */
  readonly caller: 'human' | 'agent';
  readonly startedAt: string;
  /** Random per-acquisition identity — what break and release verify against. */
  readonly nonce: string;
}

export interface LockInspection {
  readonly present: boolean;
  /** Parsed holder metadata, when the lock file carries valid JSON. */
  readonly holder?: LockHolder;
  /** The raw lock content — the exact identity a takeover verifies against. */
  readonly raw?: string;
  readonly verdict?: 'live' | 'stale';
  /** How long the lock has been held, from its holder record (mtime as fallback). */
  readonly heldMs?: number;
}

export function storeLockPath(root: string): string {
  return join(root, '.ward', 'store.lock');
}

/**
 * Run `fn` holding the store's write lock. The critical section is the
 * store's mutate-and-commit span — allocation scan → record write →
 * `commitRecords` — kept brief: slow work (network fetches, forge probes)
 * stays outside. Locked operations must not call other locked operations;
 * the lock is deliberately not reentrant, so nesting would self-deadlock —
 * currently true by construction across the workspace modules.
 */
export async function withStoreLock<T>(
  root: string,
  verb: string,
  fn: () => Promise<T>,
): Promise<T> {
  const holder: LockHolder = {
    pid: process.pid,
    host: hostname(),
    verb,
    caller: process.env.WARD_AGENT ? 'agent' : 'human',
    startedAt: new Date().toISOString(),
    nonce: crypto.randomUUID(),
  };
  await acquire(root, holder);
  try {
    return await fn();
  } finally {
    release(root, holder);
  }
}

/**
 * Read the lock's state without touching it — the legibility surface doctor
 * and the contention refusal share, so they can never disagree about what
 * the same file means. Verdict: a same-host holder is judged by its pid
 * (dead → stale, alive → live — a live writer is never aged out); a holder
 * whose liveness cannot be checked (another host, unreadable content) is
 * stale only past the age bound.
 */
export function inspectStoreLock(root: string): LockInspection {
  const path = storeLockPath(root);
  let raw: string;
  let mtimeMs: number;
  try {
    raw = readFileSync(path, 'utf8');
    mtimeMs = statSync(path).mtimeMs;
  } catch {
    return { present: false };
  }
  const holder = parseHolder(raw);
  if (holder === null) {
    const heldMs = Math.max(0, Date.now() - mtimeMs);
    return { present: true, raw, verdict: heldMs > staleMs() ? 'stale' : 'live', heldMs };
  }
  const started = Date.parse(holder.startedAt);
  const heldMs = Math.max(0, Date.now() - (Number.isNaN(started) ? mtimeMs : started));
  const verdict =
    holder.host === hostname()
      ? pidAlive(holder.pid)
        ? 'live'
        : 'stale'
      : heldMs > staleMs()
        ? 'stale'
        : 'live';
  return { present: true, holder, raw, verdict, heldMs };
}

/** One line naming the holder — the contention refusal and takeover note share it. */
export function describeHolder(seen: LockInspection): string {
  const held = seen.heldMs === undefined ? '' : `, held ${Math.round(seen.heldMs / 1000)}s`;
  if (seen.holder === undefined) return `an unreadable holder (.ward/store.lock${held})`;
  const h = seen.holder;
  return `pid ${h.pid} on ${h.host} (ward ${h.verb}, ${h.caller}${held})`;
}

// -- acquisition ----------------------------------------------------------

async function acquire(root: string, holder: LockHolder): Promise<void> {
  const bound = timeoutMs();
  const deadline = Date.now() + bound;
  let delay = 15;
  while (true) {
    if (tryLink(root, holder)) return;
    const seen = inspectStoreLock(root);
    if (!seen.present) continue; // released between attempts — try again now
    if (seen.verdict === 'stale' && seen.raw !== undefined && breakStale(root, seen.raw)) {
      // Announced on stderr so the takeover is visible in the transcript
      // that performed it, not only inferable from the record afterward.
      console.error(`ward: took over a stale store lock left by ${describeHolder(seen)}`);
      continue;
    }
    if (Date.now() >= deadline) {
      throw new WardError(
        `the store is write-locked by ${describeHolder(seen)} — gave up after ` +
          `${Math.round(bound / 1000)}s; a lock whose holder is gone is taken over ` +
          `automatically, and ward doctor names the lock's state`,
      );
    }
    await Bun.sleep(delay + Math.random() * delay);
    delay = Math.min(delay * 1.6, 250);
  }
}

/**
 * The atomic acquire: stage the holder file in .ward/tmp/ and link(2) it to
 * the lock path — link fails with EEXIST when the lock is held, and the lock
 * appears with its full holder content in one step, so no observer ever sees
 * a lock that cannot say who holds it (the store's no-partial-reads rule,
 * applied to the mechanism itself).
 */
function tryLink(root: string, holder: LockHolder): boolean {
  const tmpDir = join(root, '.ward', 'tmp');
  mkdirSync(tmpDir, { recursive: true });
  const tmp = join(tmpDir, `lock-${holder.pid}-${holder.nonce}`);
  try {
    // Synchronous throughout, so acquisition is one uninterruptible step
    // even for in-process contenders sharing the event loop.
    writeFileSync(tmp, `${JSON.stringify(holder)}\n`);
    linkSync(tmp, storeLockPath(root));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw error;
  } finally {
    rmSync(tmp, { force: true });
  }
}

/**
 * Take over a lock judged stale, safely repeatable: rename it aside (only
 * one contender wins the rename; the losers rejoin the wait), then verify
 * the parked file is byte-identical to what was judged — if the lock changed
 * hands in between, what was parked is someone's live lock, and it is
 * restored atomically via link(2). The unrestorable corner (the slot was
 * retaken during the mistake) refuses loudly rather than piling a third
 * writer onto a race (§20) — it cannot repair what it can no longer prove.
 */
function breakStale(root: string, judgedRaw: string): boolean {
  const path = storeLockPath(root);
  const parked = join(root, '.ward', 'tmp', `lock-broken-${process.pid}-${crypto.randomUUID()}`);
  try {
    renameSync(path, parked);
  } catch {
    return false; // another waiter broke it first — rejoin the acquire loop
  }
  let raw = '';
  try {
    raw = readFileSync(parked, 'utf8');
  } catch {
    raw = '';
  }
  if (raw === judgedRaw) {
    rmSync(parked, { force: true });
    return true;
  }
  try {
    linkSync(parked, path);
    rmSync(parked, { force: true });
    return false;
  } catch {
    rmSync(parked, { force: true });
    throw new WardError(
      'the store lock changed hands mid-takeover and could not be restored — stop concurrent ' +
        'ward commands, run ward doctor, and remove .ward/store.lock only if doctor calls it stale',
    );
  }
}

function release(root: string, holder: LockHolder): void {
  const path = storeLockPath(root);
  try {
    // Unlink only our own lock: if a takeover replaced it, the file now
    // guards someone else's critical section.
    if (parseHolder(readFileSync(path, 'utf8'))?.nonce === holder.nonce) rmSync(path);
  } catch {
    // Already gone — nothing to release.
  }
}

// -- plumbing -------------------------------------------------------------

function parseHolder(raw: string): LockHolder | null {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.pid === 'number' &&
      typeof parsed.host === 'string' &&
      typeof parsed.verb === 'string' &&
      (parsed.caller === 'human' || parsed.caller === 'agent') &&
      typeof parsed.startedAt === 'string' &&
      typeof parsed.nonce === 'string'
    ) {
      return parsed as unknown as LockHolder;
    }
    return null;
  } catch {
    return null;
  }
}

function pidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM: alive but not ours — alive is what matters here.
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** Bounded wait before an honest refusal; overridable for tests and unusual machines. */
function timeoutMs(): number {
  return positiveEnv('WARD_LOCK_TIMEOUT_MS') ?? 10_000;
}

/** Age past which a holder of unknowable liveness is judged stale. */
function staleMs(): number {
  return positiveEnv('WARD_LOCK_STALE_MS') ?? 30_000;
}

function positiveEnv(name: string): number | null {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return null;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}
