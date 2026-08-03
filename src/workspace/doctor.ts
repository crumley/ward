// Doctor: machine preconditions everywhere, record↔world integrity inside a
// workspace. Report-only — it never repairs
// (intent/01-concepts/06-workspace-lifecycle.md, the repair posture).
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import { WardError } from '../errors.ts';
import { type DocumentType, readDocument } from '../store/document.ts';
import { catalogType, workspaceRecordType } from '../store/types.ts';
import { git, gitAvailable, gitIdentityConfigured, hasCommits } from './git.ts';
import { discoverWorkspace, IGNORE_LINES } from './layout.ts';

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
  const machine = machineChecks(cwd);
  const workspaceRoot = discoverWorkspace(cwd);
  const workspace = workspaceRoot === null ? [] : await workspaceChecks(workspaceRoot);
  const healthy = [...machine, ...workspace].every((finding) => finding.severity !== 'error');
  return { machine, workspaceRoot, workspace, healthy };
}

// -- machine preconditions ------------------------------------------------

function machineChecks(cwd: string): Finding[] {
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
  findings.push(
    Bun.which('gh') !== null
      ? { check: 'gh', severity: 'ok', message: 'GitHub CLI available' }
      : {
          check: 'gh',
          severity: 'info',
          message: 'GitHub CLI not found — optional; Ward uses it for PR tracking when present',
        },
  );
  return findings;
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
