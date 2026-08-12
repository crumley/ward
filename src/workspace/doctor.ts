// Doctor: machine preconditions everywhere, record↔world integrity inside a
// workspace. Report-only — it never repairs
// (intent/01-concepts/06-workspace-lifecycle.md, the repair posture).
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { type ForgeAuth, ghExecutable, probeForgeAuth } from '../forge/gh.ts';
import { type DocumentType, readDocument } from '../store/document.ts';
import { inspectStoreLock } from '../store/lock.ts';
import {
  baselinesType,
  catalogType,
  type RepositoryRecord,
  repositoryRecordType,
  workspaceRecordType,
} from '../store/types.ts';
import { sha256OfFile } from './baselines.ts';
import { git, gitAvailable, gitIdentityConfigured, hasCommits } from './git.ts';
import { discoverWorkspace, IGNORE_LINES } from './layout.ts';
import { checkoutPath, listRepositoryNames } from './repos.ts';

export type Severity = 'ok' | 'info' | 'warn' | 'error';

export interface Finding {
  readonly check: string;
  readonly severity: Severity;
  readonly message: string;
}

export interface DoctorReport {
  readonly machine: readonly Finding[];
  /** Null when no workspace encloses the working directory. */
  readonly workspaceRoot: string | null;
  readonly workspace: readonly Finding[];
  readonly healthy: boolean;
}

export async function runDoctor(cwd: string): Promise<DoctorReport> {
  const machine = await machineChecks(cwd);
  const workspaceRoot = discoverWorkspace(cwd);
  const workspace = workspaceRoot === null ? [] : await workspaceChecks(workspaceRoot);
  const healthy = [...machine, ...workspace].every((finding) => finding.severity !== 'error');
  return { machine, workspaceRoot, workspace, healthy };
}

// -- machine preconditions ------------------------------------------------

async function machineChecks(cwd: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (gitAvailable()) {
    const version = git(cwd, '--version')
      .stdout.trim()
      .replace(/^git version /, '');
    findings.push({ check: 'git', severity: 'ok', message: `git ${version}` });
    findings.push(
      gitIdentityConfigured(cwd)
        ? { check: 'git identity', severity: 'ok', message: 'author identity configured' }
        : {
            check: 'git identity',
            severity: 'error',
            message: 'no author identity — set user.name and user.email (git config)',
          },
    );
  } else {
    findings.push({ check: 'git', severity: 'error', message: 'not found on PATH — required' });
  }
  // Presence reads the same WARD_GH seam the probe spawns, so doctor and
  // status always describe the same binary (design/0010-doctor-forge-auth/).
  if (ghExecutable() === null) {
    findings.push({
      check: 'gh',
      severity: 'info',
      message: 'GitHub CLI not found — optional; Ward uses it for PR tracking when present',
    });
  } else {
    findings.push({ check: 'gh', severity: 'ok', message: 'GitHub CLI available' });
    findings.push(ghAuthFinding(await probeForgeAuth()));
  }
  return findings;
}

/**
 * Presence and health are different findings (the git / git identity idiom):
 * the motivating incident (design/0010-doctor-forge-auth/) was a broken
 * token — status degraded to "forge state unavailable (gh)" while doctor
 * green-lit the installed binary. Unauthenticated is warn, not error:
 * nothing is blocked (every verb degrades honestly), but an
 * installed-and-broken tool is likelier a misconfiguration than a choice,
 * and catching that is what doctor is for. A cut check is info: doctor
 * could not verify, and claiming broken would be a guess — doctor reports,
 * it never guesses.
 */
function ghAuthFinding(auth: ForgeAuth): Finding {
  switch (auth) {
    case 'authenticated':
      return {
        check: 'gh auth',
        severity: 'ok',
        message: 'authenticated — live forge state available',
      };
    case 'unauthenticated':
      return {
        check: 'gh auth',
        severity: 'warn',
        message:
          'installed but cannot reach the forge — forge state will be unavailable; run: gh auth login',
      };
    case 'unverified':
      return {
        check: 'gh auth',
        severity: 'info',
        message: 'auth check gave no answer in time — cannot verify forge access from here',
      };
  }
}

// -- workspace integrity --------------------------------------------------

async function workspaceChecks(root: string): Promise<Finding[]> {
  const findings: Finding[] = [];

  const record = await checkDocument(findings, root, workspaceRecordType, 'workspace record');
  if (record !== null) {
    findings.push(
      record.wardVersion === pkg.version
        ? {
            check: 'version stamp',
            severity: 'ok',
            message: `stamped by ward ${record.wardVersion}`,
          }
        : {
            check: 'version stamp',
            severity: 'info',
            message:
              `workspace stamped by ward ${record.wardVersion}; this CLI is ${pkg.version} — ` +
              'artifact-only skew, nothing blocked',
          },
    );
  }

  const catalog = await checkDocument(findings, root, catalogType, 'artifact-type catalog');
  if (catalog !== null) {
    findings.push({
      check: 'artifact-type catalog',
      severity: 'ok',
      message: `${catalog.artifactTypes.length} registered artifact types`,
    });
  }

  findings.push(...(await baselineChecks(root)));

  const ignoreFile = join(root, '.gitignore');
  const ignoreLines = existsSync(ignoreFile)
    ? new Set((await readFile(ignoreFile, 'utf8')).split('\n'))
    : new Set<string>();
  const missingIgnores = IGNORE_LINES.filter((line) => !ignoreLines.has(line));
  findings.push(
    missingIgnores.length === 0
      ? { check: 'ignore policy', severity: 'ok', message: 'checkouts and scratch are ignored' }
      : {
          check: 'ignore policy',
          severity: 'warn',
          message: `.gitignore is missing ${missingIgnores.join(', ')} — re-run ward workspace create to converge`,
        },
  );

  findings.push(
    existsSync(join(root, '.git')) && hasCommits(root)
      ? { check: 'version control', severity: 'ok', message: 'workspace tracks itself in git' }
      : {
          check: 'version control',
          severity: 'warn',
          message: 'workspace is not tracked in git — re-run ward workspace create to converge',
        },
  );

  findings.push(storeLockFinding(root));
  findings.push(...telemetryFindings(root));

  for (const name of listRepositoryNames(root)) {
    findings.push(...(await repositoryChecks(root, name)));
  }

  return findings;
}

/**
 * The store write lock, named (§20): a held lock is normal and brief; a
 * stale one is exactly the wedged-looking condition doctor exists to
 * explain. Warn, never error — the next write takes a stale lock over by
 * itself, so nothing is blocked
 * (design/0013-telemetry-and-serialized-writes/).
 */
function storeLockFinding(root: string): Finding {
  const check = 'store lock';
  const seen = inspectStoreLock(root);
  if (!seen.present) {
    return { check, severity: 'ok', message: 'no writer holds the store lock' };
  }
  const holder =
    seen.holder === undefined
      ? 'an unreadable holder'
      : `pid ${seen.holder.pid} (ward ${seen.holder.verb}, ${seen.holder.caller})`;
  const held = seen.heldMs === undefined ? '' : ` for ${Math.round(seen.heldMs / 1000)}s`;
  return seen.verdict === 'live'
    ? {
        check,
        severity: 'info',
        message: `held by ${holder}${held} — concurrent writes are waiting their turn`,
      }
    : {
        check,
        severity: 'warn',
        message:
          `stale — left by ${holder}${held}; the next write takes it over, ` +
          'and deleting .ward/store.lock is also safe',
      };
}

/**
 * Telemetry must stay local (§4): a tracked telemetry file is one push from
 * leaving the workspace, which is exactly the leak the human-shell contract
 * forbids — the one condition worth a warning. Untracked is the healthy
 * state; a workspace with no telemetry yet has nothing to report.
 */
function telemetryFindings(root: string): Finding[] {
  const check = 'telemetry';
  const tracked = git(root, 'ls-files', '--', '.ward/telemetry').stdout.trim();
  if (tracked !== '') {
    return [
      {
        check,
        severity: 'warn',
        message:
          'usage telemetry is tracked in the workspace history — it is local and personal, ' +
          'never shared; untrack it: git rm -r --cached .ward/telemetry',
      },
    ];
  }
  if (!existsSync(join(root, '.ward', 'telemetry'))) return [];
  return [{ check, severity: 'ok', message: 'usage telemetry stays local (untracked)' }];
}

/**
 * Installed-artifact baselines, read-only: customization is the yours-tier
 * working as intended (info, never a warning); a missing artifact is either
 * drift or deliberate departure, and doctor reports rather than guesses
 * (intent/01-concepts/06-workspace-lifecycle.md, the repair posture).
 */
async function baselineChecks(root: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  if (!existsSync(join(root, baselinesType.relPath))) {
    findings.push({
      check: 'installed baselines',
      severity: 'info',
      message:
        'no baseline record — created by an older ward; re-run ward workspace create to start one',
    });
    return findings;
  }
  const baselines = await checkDocument(findings, root, baselinesType, 'installed baselines');
  if (baselines === null) return findings;
  for (const artifact of baselines.artifacts) {
    const check = `baseline ${artifact.path}`;
    const file = join(root, artifact.path);
    if (!existsSync(file)) {
      findings.push({
        check,
        severity: 'warn',
        message:
          'installed artifact is missing — deliberate departure, or drift; ' +
          'ward workspace create reinstalls the default',
      });
      continue;
    }
    findings.push(
      (await sha256OfFile(file)) === artifact.sha256
        ? {
            check,
            severity: 'ok',
            message: `untouched since install (ward ${artifact.wardVersion})`,
          }
        : {
            check,
            severity: 'info',
            message: `customized since install (ward ${artifact.wardVersion}) — yours to shape`,
          },
    );
  }
  return findings;
}

/** Record↔disk and record↔repository drift for one registered repository. */
async function repositoryChecks(root: string, name: string): Promise<Finding[]> {
  const check = `repository ${name}`;
  const findings: Finding[] = [];
  const record = await checkDocument<RepositoryRecord>(
    findings,
    root,
    repositoryRecordType(name),
    check,
  );
  if (record === null) return findings;
  const checkout = checkoutPath(root, name);
  if (!existsSync(checkout)) {
    findings.push({
      check,
      severity: 'warn',
      message: `canonical checkout repos/${name}/ is missing — run: ward repo add ${record.remote}`,
    });
    return findings;
  }
  const origin = git(checkout, 'remote', 'get-url', 'origin').stdout.trim();
  if (origin !== record.remote) {
    findings.push({
      check,
      severity: 'warn',
      message: `checkout origin is ${origin || '(none)'} but the record says ${record.remote}`,
    });
    return findings;
  }
  if (git(checkout, 'rev-parse', '--verify', record.mainLine).exitCode !== 0) {
    findings.push({
      check,
      severity: 'warn',
      message: `main line '${record.mainLine}' does not exist in the checkout`,
    });
    return findings;
  }
  findings.push({
    check,
    severity: 'ok',
    message: `checkout present, tracking ${record.mainLine}`,
  });
  return findings;
}

/** Read and validate one record, converting failures into findings. */
async function checkDocument<T>(
  findings: Finding[],
  root: string,
  type: DocumentType<T>,
  check: string,
): Promise<T | null> {
  try {
    const document = await readDocument(root, type);
    return document.data;
  } catch (error) {
    if (error instanceof WardError) {
      findings.push({ check, severity: 'error', message: error.message });
    } else if (isFileMissing(error)) {
      findings.push({
        check,
        severity: 'error',
        message: `${type.relPath} is missing — re-run ward workspace create to converge`,
      });
    } else {
      throw error;
    }
    return null;
  }
}

function isFileMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
