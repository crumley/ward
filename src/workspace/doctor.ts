// Doctor: machine preconditions everywhere, record↔world integrity inside a
// workspace. Report-only — it never repairs
// (intent/01-concepts/06-workspace-lifecycle.md, the repair posture).
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pkg from '../../package.json' with { type: 'json' };
import {
  type AgentProvenance,
  type Resolved,
  type ResolvedAgentConfig,
  resolveAgentConfig,
} from '../agent/settings.ts';
import { WardError } from '../errors.ts';
import { type ForgeAuth, ghExecutable, probeForgeAuth } from '../forge/gh.ts';
import {
  type GlobalConfig,
  type GlobalConfigRecord,
  globalConfigType,
  inspectConfig,
} from '../global/config.ts';
import { configDir } from '../global/paths.ts';
import {
  listWorkspaces,
  readRegistry,
  registryLockPath,
  registryPath,
  resolutionOrder,
} from '../global/registry.ts';
import type { GlobalRead } from '../global/store.ts';
import {
  adoptionDir,
  fishConfigured,
  inspectAdoption,
  type ShorthandInspection,
} from '../shell/adopt.ts';
import {
  fishArtifactSites,
  type InstalledArtifact,
  inspectInstalledShellArtifacts,
} from '../shell/installed.ts';
import { type DocumentType, readDocument } from '../store/document.ts';
import { inspectLock, inspectStoreLock } from '../store/lock.ts';
import {
  baselinesType,
  catalogType,
  type RepositoryRecord,
  repositoryRecordType,
  workspaceRecordType,
} from '../store/types.ts';
import { sha256OfFile } from './baselines.ts';
import { git, gitAvailable, gitIdentityConfigured, hasCommits } from './git.ts';
import { discoverWorkspace, IGNORE_LINES, inspectClaudeGuidance } from './layout.ts';
import { findStandingProject } from './projects.ts';
import { checkoutPath, listRepositoryNames } from './repos.ts';
import { readTasks } from './scan.ts';
import { readTaskWorktrees } from './worktrees.ts';

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
  /**
   * The agent configuration as it resolves HERE, per key with its provenance
   * (design/0028-agent-configuration/) — null outside a workspace, where only
   * half the resolution exists and the answer would be a guess about a
   * workspace the caller is not standing in. Carried as structure alongside
   * the finding that renders it, because the two audiences want different
   * things from the same read: a human wants one line, an agent wants the
   * values keyed and machine-readable (§8) — and one resolution feeds both, so
   * they cannot disagree.
   */
  readonly agent: ResolvedAgentConfig | null;
  readonly healthy: boolean;
}

export async function runDoctor(cwd: string): Promise<DoctorReport> {
  // Read once, use twice: the machine section names the config file's own
  // state, and the workspace section resolves the agent block out of it
  // against the workspace record. Two reads could disagree; one cannot.
  const config = await inspectConfig(configDir());
  const machine = await machineChecks(cwd, config);
  const workspaceRoot = discoverWorkspace(cwd);
  const inside =
    workspaceRoot === null ? null : await workspaceChecks(workspaceRoot, config.config);
  const workspace = inside?.findings ?? [];
  const healthy = [...machine, ...workspace].every((finding) => finding.severity !== 'error');
  return { machine, workspaceRoot, workspace, agent: inside?.agent ?? null, healthy };
}

/** The global config as doctor read it: the resolved settings and the file's own state. */
type ConfigInspection = { config: GlobalConfig; read: GlobalRead<GlobalConfigRecord> };

// -- machine preconditions ------------------------------------------------

async function machineChecks(cwd: string, config: ConfigInspection): Promise<Finding[]> {
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
  findings.push(pickerFinding());
  findings.push(...(await shellFindings()));
  findings.push(globalConfigFinding(config));
  findings.push(await workspaceRegistryFinding());
  findings.push(...registryLockFindings());
  return findings;
}

/**
 * The picker the emitted shell layer reaches for
 * (design/0025-fish-shell-layer/). Named here because §20's loop demands it:
 * `wrcd` with no argument and no fzf degrades to "no picker installed — name
 * one of these", and an unavailability another surface reports honestly must
 * be a condition doctor can name and explain. Never worse than `info` — the
 * shorthands all work by name without it, and choosing not to install a
 * fuzzy finder is a choice, not a fault.
 */
function pickerFinding(): Finding {
  const check = 'picker';
  return Bun.which('fzf') === null
    ? {
        check,
        severity: 'info',
        message:
          'fzf not found — optional; the shell layer picks a repo or workspace with it ' +
          '(without it, wrcd/wwcd list the candidates and ask you to name one)',
      }
    : { check, severity: 'ok', message: 'fzf available — the shell layer can pick interactively' };
}

/**
 * The installed shell artifacts — the emitted fish layer and ward's fish
 * completions (design/0026-shell-staleness-doctor/). Machine-level, because
 * they are per-user machine state: the files live in the human's own shell
 * configuration, and doctor is the surface that works outside a workspace.
 *
 * They are checked at all because both are installed by REDIRECT, which makes
 * each a snapshot of the ward that emitted it — and the human-shell contract
 * expects the shorthand set to churn, an expectation that means nothing if
 * nobody can see that their copy has fallen behind. Surfaced, not nagged: a
 * stale file is `warn` with the exact re-run, and everything else is quieter.
 * Never `error` — a convenience cannot make a machine unhealthy (0024's
 * posture), and declining to install one is a choice, not a fault.
 *
 * Silence is the answer when this machine keeps no fish configuration at all:
 * doctor names conditions, and "you could install a fish layer" is not one on
 * a machine that does not run fish.
 */
async function shellArtifactFindings(): Promise<Finding[]> {
  const { configured, artifacts } = await inspectInstalledShellArtifacts();
  if (!configured && artifacts.every((artifact) => artifact.state === 'absent')) return [];
  return artifacts.map(shellArtifactFinding);
}

/**
 * Everything doctor says about the human's shell: the two whole-file
 * artifacts 0026 checks, the adopted shorthands
 * (design/0027-shell-adoption/), and the one condition that only exists
 * because both install styles do.
 *
 * One function because the three readings are one subject and share a gate:
 * a machine that keeps no fish configuration and has adopted nothing hears
 * nothing at all.
 */
async function shellFindings(): Promise<Finding[]> {
  const artifacts = await shellArtifactFindings();
  const adoption = await inspectAdoption(adoptionDir(undefined));
  return [...artifacts, ...adoptedShorthandFindings(adoption), ...shadowedFindings(adoption)];
}

/**
 * One finding per **adopted** shorthand, plus at most one dim line for the
 * rest (design/0027-shell-adoption/).
 *
 * Per alias, because that is the granularity the human adopted at: `wrr` can
 * be a year old while `wrcd` is this morning's, they live in different files,
 * and their remedies name different words. The alias that changed is the
 * whole finding — it names the alias, the file, the command that shows the
 * diff, and the command that takes ward's version — because those are exactly
 * the human's three choices (ignore it, see it, take it) and a finding that
 * offered fewer would be making one of them for them.
 *
 * A shorthand ward offers that nobody adopted is never a warning and never a
 * line of its own: declining to adopt is a choice, and the whole point of
 * adoption is that ward writes only what it was asked for. It gets one dim
 * info naming the set, on the same terms 0026 gives an uninstalled layer.
 */
function adoptedShorthandFindings(adoption: readonly ShorthandInspection[]): Finding[] {
  if (!fishConfigured() && adoption.every((seen) => seen.status === 'available')) return [];
  const findings = adoption
    .filter((seen) => seen.status !== 'available')
    .map(adoptedShorthandFinding);
  const available = adoption.filter((seen) => seen.status === 'available');
  if (available.length > 0) {
    findings.push({
      check: 'fish shorthands',
      severity: 'info',
      message:
        `${available.map((seen) => seen.name).join(', ')} not adopted — optional; ` +
        '`ward shell adopt fish` lists what is offered and adopts what you name ' +
        '(or use the always-fresh `ward shell init fish` layer instead)',
    });
  }
  return findings;
}

function adoptedShorthandFinding(seen: ShorthandInspection): Finding {
  const check = `fish shorthand ${seen.name}`;
  const own = seen.files[0];
  const path = own === undefined ? seen.name : own.path;
  switch (seen.status) {
    case 'current':
      return { check, severity: 'ok', message: `${path} — matches what this ward defines` };
    case 'changed': {
      const drifted = seen.files.filter((file) => file.state !== 'current');
      const kept = drifted.filter((file) => file.state === 'yours');
      return {
        check,
        severity: 'warn',
        message:
          `${seen.name} has changed — ${listPaths(drifted)} ` +
          `differ${drifted.length === 1 ? 's' : ''} from what this ward defines. ` +
          `See it: ward shell diff fish ${seen.name}. Take it: ward shell adopt fish ` +
          `${seen.name}. Or keep yours — nothing rewrites it but you` +
          (kept.length === 0
            ? ''
            : ` (${listPaths(kept)} carries no ward marker; adopting leaves it alone)`),
      };
    }
    case 'yours':
      // The claude-guidance idiom (0017), and 0026's posture verbatim: a file
      // ward did not write is somebody's arrangement, kept. Adoption is the
      // one verb that writes, and it declines this file too (§18).
      return {
        check,
        severity: 'info',
        message:
          `${path} is present but carries no ward marker — your own \`${seen.name}\`, kept; ` +
          `ward will not overwrite what it did not write (ward shell adopt fish ${seen.name} ` +
          "--force replaces it, if it was meant to be ward's)",
      };
    case 'unreadable':
      return {
        check,
        severity: 'warn',
        message:
          `${path} could not be read — ${reasonFor(seen)}; whether the adopted copy still ` +
          'matches this ward cannot be told from here',
      };
    // A shorthand nobody adopted is reported as part of the set, not alone.
    case 'available':
      return { check, severity: 'info', message: `${seen.name} not adopted` };
  }
}

/**
 * The one condition that exists only because both install styles do: fish
 * sources `conf.d/ward.fish` at startup, which DEFINES `wrcd`, and an
 * autoloaded `functions/wrcd.fish` is only ever consulted for a function that
 * is not defined yet. So an installed layer silently wins over every adopted
 * shorthand beside it.
 *
 * It is a warning rather than a note because the failure is invisible from
 * the shell: the human's own tracked file does nothing, and the shorthand
 * they are running is the layer's. §20's loop is explicit that a condition a
 * surface can honestly report must be one doctor names — and this one no
 * surface else can see. It is never an error: both files are conveniences.
 */
function shadowedFindings(adoption: readonly ShorthandInspection[]): Finding[] {
  const adopted = adoption.filter((seen) => seen.status === 'current' || seen.status === 'changed');
  const layer = fishArtifactSites()[0];
  if (adopted.length === 0 || layer === undefined || !existsSync(layer.path)) return [];
  const { path } = layer;
  return [
    {
      check: 'fish shorthands shadowed',
      severity: 'warn',
      message:
        `${path} defines ${adopted.map((seen) => seen.name).join(', ')} too, and wins — ` +
        'fish sources conf.d at startup and only autoloads a function that is not already ' +
        'defined, so the adopted files beside it never run. Keep one style: delete the layer ' +
        'to run what you adopted, or the adopted files to run the always-fresh layer',
    },
  ];
}

function listPaths(files: readonly { readonly relativePath: string }[]): string {
  return files.map((file) => file.relativePath).join(', ');
}

function reasonFor(seen: ShorthandInspection): string {
  return seen.files.find((file) => file.reason !== undefined)?.reason ?? 'unknown';
}

function shellArtifactFinding(artifact: InstalledArtifact): Finding {
  const check = artifact.what;
  const install = `${artifact.command} > ${artifact.path}`;
  switch (artifact.state) {
    case 'absent':
      return {
        check,
        severity: 'info',
        message: `not installed — optional; ward emits it and you redirect: ${install}`,
      };
    case 'current':
      return {
        check,
        severity: 'ok',
        message: `${artifact.path} — matches what this ward emits`,
      };
    case 'bootstrap':
      return {
        check,
        severity: 'ok',
        message:
          `${artifact.path} — a lazy bootstrap: it runs ${artifact.command} and sources ` +
          'the result, so every shell gets what its ward emits — nothing here to go stale',
      };
    case 'stale':
      return {
        check,
        severity: 'warn',
        message:
          `${artifact.path} differs from what this ward emits — the installed copy is a ` +
          `snapshot of an earlier ward; re-emit it: ${install}`,
      };
    case 'foreign':
      // The honest reading, and the reason it is not a warning: a file ward
      // did not write is somebody's own arrangement (the claude-guidance
      // idiom), and telling them to redirect over it would be Ward writing
      // into a human's shell configuration by proxy (§18).
      return {
        check,
        severity: 'info',
        message:
          `${artifact.path} is present but is not ward's emission — your own file, kept; ` +
          `ward will not tell you to overwrite what it did not write (were it meant to be ` +
          `ward's, ${install} replaces it)`,
      };
    case 'unreadable':
      return {
        check,
        severity: 'warn',
        message:
          `${artifact.path} could not be read — ${artifact.reason}; whether the installed ` +
          'copy is current cannot be told from here',
      };
  }
}

/**
 * The registry's own write lock, on the same terms as the store's: a held
 * lock is normal and brief, a stale one is the wedged-looking condition
 * doctor exists to explain. It is named here because the lock's own refusal
 * says "ward doctor names the lock's state" — a promise that must be true at
 * every site that borrows the primitive (§20's loop). Nothing is reported
 * when no lock file exists, which is almost always.
 */
function registryLockFindings(): Finding[] {
  const check = 'workspace registry lock';
  const path = registryLockPath();
  const seen = inspectLock(path);
  if (!seen.present) return [];
  const held = seen.heldMs === undefined ? '' : ` for ${Math.round(seen.heldMs / 1000)}s`;
  const holder =
    seen.holder === undefined
      ? 'an unreadable holder'
      : `pid ${seen.holder.pid} (ward ${seen.holder.verb}, ${seen.holder.caller})`;
  return [
    seen.verdict === 'live'
      ? {
          check,
          severity: 'info',
          message: `held by ${holder}${held} — a concurrent registry write is in flight`,
        }
      : {
          check,
          severity: 'warn',
          message:
            `stale — left by ${holder}${held}; the next registry write takes it over, ` +
            `and deleting ${path} is also safe`,
        },
  ];
}

/**
 * The global state is machine-level, so it is checked with the machine
 * (design/0024-global-config-registry/) — and it is checked at all because of
 * §20's loop: both files degrade silently to "no preferences" / "no registry"
 * at the point of use, and a degradation the diagnostic surface cannot
 * explain trains the human to distrust both. Nothing here is ever an error:
 * global state holds conveniences only, so its worst state costs a shortcut.
 */
function globalConfigFinding({ config, read }: ConfigInspection): Finding {
  const check = 'global config';
  const file = globalConfigPath();
  if (read.state === 'absent') {
    return { check, severity: 'info', message: `none at ${file} — Ward's defaults apply` };
  }
  if (read.state === 'unreadable') {
    return {
      check,
      severity: 'warn',
      message: `${file} could not be read — ${read.reason}; Ward's defaults apply meanwhile`,
    };
  }
  return {
    check,
    severity: 'ok',
    message: `${file} — repo.refresh.stash ${config.repo.refresh.stash}`,
  };
}

function globalConfigPath(): string {
  return join(configDir(), globalConfigType.relPath);
}

/**
 * The registry's own health: how many workspaces answer from anywhere, which
 * is the default, and how many entries point at a path that no longer holds a
 * workspace. Stale entries are warn — nothing is blocked (resolution skips
 * them), but they are the one state a human should act on, and the remedy is
 * one verb.
 */
async function workspaceRegistryFinding(): Promise<Finding> {
  const check = 'workspace registry';
  const file = registryPath();
  const read = await readRegistry();
  if (read.state === 'absent') {
    return {
      check,
      severity: 'info',
      message:
        `no registry at ${file} — ward answers from inside a workspace; register one to be ` +
        'answerable from anywhere: ward workspace register [PATH]',
    };
  }
  if (read.state === 'unreadable') {
    return {
      check,
      severity: 'warn',
      message:
        `${file} could not be read — ${read.reason}; ward still works from inside a workspace, ` +
        'and deleting the file loses only the shortcuts',
    };
  }
  const listings = await listWorkspaces();
  const stale = listings.filter((entry) => entry.stale);
  const fallback = resolutionOrder(listings)[0];
  const answer =
    fallback === undefined
      ? 'none can answer from outside a workspace'
      : `'${fallback.name}' answers from outside a workspace`;
  if (stale.length > 0) {
    return {
      check,
      severity: 'warn',
      message:
        `${listings.length} registered, ${stale.length} stale (${stale
          .map((entry) => entry.name)
          .join(', ')}) — no workspace at their paths; drop one: ` +
        `ward workspace unregister ${stale[0]?.name}`,
    };
  }
  return { check, severity: 'ok', message: `${listings.length} registered — ${answer}` };
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

async function workspaceChecks(
  root: string,
  config: GlobalConfig,
): Promise<{ findings: Finding[]; agent: ResolvedAgentConfig }> {
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
  findings.push(claudeGuidanceFinding(root));
  findings.push(await standingProjectFinding(root));

  // The agent configuration, resolved from the record just validated above
  // and the global config already read — never from a second read of either.
  // A record that would not parse is already an error finding, and its agent
  // block is simply not there: the workspace layer drops out and the global
  // one answers, which is the honest resolution rather than a second complaint
  // about the same broken file.
  const agent = resolveAgentConfig({ workspace: record?.agent, global: config.agent });
  findings.push(agentConfigFinding(agent));

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

  const tracked = existsSync(join(root, '.git')) && hasCommits(root);
  findings.push(
    tracked
      ? { check: 'version control', severity: 'ok', message: 'workspace tracks itself in git' }
      : {
          check: 'version control',
          severity: 'warn',
          message: 'workspace is not tracked in git — re-run ward workspace create to converge',
        },
  );
  if (record !== null && tracked) {
    findings.push(mainLineFinding(root, record.mainLine));
  }

  findings.push(storeLockFinding(root));
  findings.push(...telemetryFindings(root));

  for (const name of listRepositoryNames(root)) {
    findings.push(...(await repositoryChecks(root, name)));
  }

  findings.push(...(await worktreeChecks(root)));

  return { findings, agent };
}

/**
 * The agent configuration as it resolves in THIS workspace, per key with the
 * layer that answered (design/0028-agent-configuration/). It is a finding at
 * all because the resolution is the one thing a two-axis configuration makes
 * hard to see: the value lives in one of two files, and "which model will
 * actually run here?" is otherwise a question a human answers by opening both
 * and applying the precedence rule in their head. Doctor is where Ward already
 * answers questions about the caller's own setup, so it answers this one too —
 * reported, never repaired, and never an error: an unconfigured agent is the
 * ordinary state, not a fault.
 *
 * Info when nothing is configured on either axis, ok when something is — the
 * same distinction the global-config finding draws, for the same reason: `ok`
 * says "you have this and it is fine", `info` says "you have none of this, and
 * here is where it would go".
 */
function agentConfigFinding(agent: ResolvedAgentConfig): Finding {
  const check = 'agent configuration';
  const configured = [agent.harness, agent.model, agent.effort, agent.args].some(
    (key) => key.provenance === 'workspace' || key.provenance === 'global',
  );
  const summary = [
    describeKey('harness', agent.harness),
    describeKey('model', agent.model),
    describeKey('effort', agent.effort),
    describeKey('args', agent.args, renderArgs),
  ].join(' · ');
  return configured
    ? { check, severity: 'ok', message: summary }
    : {
        check,
        severity: 'info',
        message:
          `${summary} — nothing configured; set your defaults in ${globalConfigPath()} ` +
          `(agent.model, agent.effort, agent.args) and override them per workspace in ` +
          `${workspaceRecordType.relPath}`,
      };
}

/**
 * One resolved key, for the human. An absent key reads as "not set" and
 * carries no provenance, because there is nothing to attribute — which is also
 * the point the whole entry turns on: absent is not a default, and the launch
 * will pass no flag for it.
 */
function describeKey<T>(
  name: string,
  resolved: Resolved<T>,
  render: (value: T) => string = String,
): string {
  if (resolved.provenance === 'absent') return `${name} not set`;
  return `${name} ${render(resolved.value)} (${sourceWord(resolved.provenance)})`;
}

function sourceWord(provenance: Exclude<AgentProvenance, 'absent'>): string {
  return { workspace: 'this workspace', global: 'global config', default: "ward's default" }[
    provenance
  ];
}

function renderArgs(args: readonly string[]): string {
  return args.length === 0 ? 'none' : args.join(' ');
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

/**
 * The CLAUDE.md bridge (design/0017-claude-md-symlink/): creation symlinks
 * Claude Code's expected filename onto the harness-neutral AGENTS.md. Absent
 * is the pre-0017 workspace — the first workspace-migration target; the
 * upgrade machinery that will carry the link there does not exist yet, so
 * doctor names the gap with its one-line remedy (§20). A regular file or a
 * link aimed elsewhere is the human's own arrangement — info like any
 * customization (the yours-tier working as intended), named for the drift a
 * second guidance surface can hide (§16), never an instruction to delete
 * their content. Nothing here is broken, so nothing is ever warn or error.
 */
function claudeGuidanceFinding(root: string): Finding {
  const check = 'claude guidance';
  switch (inspectClaudeGuidance(root)) {
    case 'linked':
      return {
        check,
        severity: 'ok',
        message: 'CLAUDE.md → AGENTS.md — Claude Code reads the workspace guidance',
      };
    case 'absent':
      return {
        check,
        severity: 'info',
        message:
          'no CLAUDE.md — Claude Code will not find the workspace guidance; add the bridge: ' +
          'ln -s AGENTS.md CLAUDE.md (a future workspace upgrade will carry this)',
      };
    case 'file':
      return {
        check,
        severity: 'info',
        message:
          'CLAUDE.md is a regular file, not a link to AGENTS.md — your own arrangement, kept; ' +
          'two guidance surfaces drift apart unless tended together',
      };
    case 'elsewhere':
      return {
        check,
        severity: 'info',
        message:
          'CLAUDE.md is a symlink aimed away from AGENTS.md — your own arrangement, kept; ' +
          'Claude Code reads that target instead of the workspace guidance',
      };
  }
}

/**
 * The standing workspace project
 * (design/0018-standing-workspace-project/): established by creation, so its
 * absence is the pre-0018 workspace — a migration target exactly like 0017's
 * missing CLAUDE.md, bridged the same way: info, never warn (nothing is
 * broken, ordinary work is unaffected), carrying the converge remedy doctor
 * itself never runs (report-only, the repair posture). An unreadable project
 * record surfaces as error through the same conversion checkDocument applies
 * — doctor reports what it cannot read rather than guessing past it.
 */
async function standingProjectFinding(root: string): Promise<Finding> {
  const check = 'standing project';
  try {
    const standing = await findStandingProject(root);
    return standing === undefined
      ? {
          check,
          severity: 'info',
          message:
            'no standing workspace project — the home for upgrades, migrations, and ' +
            `reflections; establish it: ward workspace create ${root} ` +
            '(a future workspace upgrade will carry it)',
        }
      : {
          check,
          severity: 'ok',
          message: `floor ${standing.record.floor} (${standing.dir}/) — the workspace's own project`,
        };
  } catch (error) {
    if (error instanceof WardError) {
      return { check, severity: 'error', message: error.message };
    }
    throw error;
  }
}

/**
 * The workspace's own main line (design/0020-deterministic-upgrade/): its
 * name is recorded in the workspace record — from the repository, never
 * assumed, the same rule every registered repository lives by — so a root
 * checkout standing elsewhere is ordinary record↔disk drift with a name,
 * instead of quietly redefining what the main line is (0019's SF-001). An
 * unrecorded name is the pre-0020 workspace: info, never warn — nothing is
 * broken, every rail falls back to the live root read — carrying the upgrade
 * and converge remedies doctor itself never runs. Drift is warn, not error:
 * the journal proceeds loudly and the rails aim at the recorded name, so the
 * workspace still operates; the remedy is one `git switch`.
 */
function mainLineFinding(root: string, recorded: string | undefined): Finding {
  const check = 'workspace main line';
  if (recorded === undefined) {
    return {
      check,
      severity: 'info',
      message:
        'no recorded main-line name — created by an older ward; a workspace upgrade records ' +
        `it (ward workspace upgrade TASK), as does re-running ward workspace create ${root}`,
    };
  }
  if (git(root, 'rev-parse', '--verify', '--quiet', `refs/heads/${recorded}`).exitCode !== 0) {
    return {
      check,
      severity: 'warn',
      message:
        `the record names '${recorded}' but no such branch exists in the workspace's own ` +
        'repository — record↔disk drift; restore or rename the branch, or converge the record',
    };
  }
  const head = git(root, 'symbolic-ref', '--short', 'HEAD').stdout.trim();
  if (head === '') {
    return {
      check,
      severity: 'warn',
      message:
        `the root checkout is detached, off the recorded main line '${recorded}' — ` +
        `journal commits are landing off the main line; return it: git switch ${recorded}`,
    };
  }
  if (head !== recorded) {
    return {
      check,
      severity: 'warn',
      message:
        `the root checkout stands on '${head}' but the recorded main line is '${recorded}' — ` +
        'record↔disk drift: journal commits are landing off the main line (loudly), and the ' +
        `gated merge refuses until it is back; return it: git switch ${recorded}`,
    };
  }
  return {
    check,
    severity: 'ok',
    message: `the root checkout stands on '${recorded}', the recorded main line`,
  };
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
      message:
        `canonical checkout repos/${name}/ is missing — re-materialize it: ` +
        `ward workspace restore (or: ward repo add ${record.remote})`,
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

/**
 * Record↔disk drift for the worktrees of non-closed tasks
 * (design/0021-restore-from-clone/): each record names repo (or the
 * workspace), branch, and path, and a fresh clone — or a hand-deleted
 * directory — has the record without the world. One finding per worktree,
 * the repository idiom: present is ok, missing is warn naming the
 * re-materializing verb. Doctor reports; restore is the remedy — the repair
 * posture keeps them separate verbs. Closed tasks are not asked: their
 * worktrees settled at the gated close, and reporting a correct teardown as
 * drift would manufacture noise (the 0016 posture).
 */
async function worktreeChecks(root: string): Promise<Finding[]> {
  const findings: Finding[] = [];
  try {
    for (const task of await readTasks(root)) {
      if (task.record.state === 'closed') continue;
      for (const record of await readTaskWorktrees(root, task.dir)) {
        const check = `worktree ${record.path}`;
        const source =
          record.repo === undefined ? "the workspace's own repository" : `repos/${record.repo}`;
        findings.push(
          existsSync(join(root, record.path))
            ? {
                check,
                severity: 'ok',
                message: `on disk — branch '${record.branch}' of ${source}`,
              }
            : {
                check,
                severity: 'warn',
                message:
                  `missing on disk — task ${task.record.code} anchors branch ` +
                  `'${record.branch}' of ${source} there; re-materialize it: ` +
                  'ward workspace restore',
              },
        );
      }
    }
  } catch (error) {
    if (error instanceof WardError) {
      findings.push({ check: 'worktrees', severity: 'error', message: error.message });
    } else {
      throw error;
    }
  }
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
