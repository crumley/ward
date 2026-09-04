// Repository → floor affinity (design/0037-repo-floor-affinity/): a project
// may CLAIM registered repositories, and a task opened with `--repo NAME` and
// no explicit floor lands on the floor that claims that repository.
//
// A claim is a **routing default, not a rule**. It never constrains what a
// floor's tasks may touch, never moves work that is already placed, and is
// always overridden by an explicit `--project`. That is what lets it be
// recorded at the project at all: the domain model stores at a container only
// judgments that cannot be derived from its children
// (intent/01-concepts/00-domain-model.md, Status), and "work on this
// repository belongs on this floor" is exactly such a judgment — it has to
// answer before the floor holds a single task, which is when a derivation
// from its tasks would answer nothing.
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { withStoreLock } from '../store/lock.ts';
import { type ProjectRecord, projectRecordType } from '../store/types.ts';
import { taskAddress } from './address.ts';
import { type FoundProject, readProjects, resolveProject } from './projects.ts';
import { listRepositoryNames } from './repos.ts';
import { commitRecords, type FoundTask, readTasks } from './scan.ts';

/** The claims a project record carries, or none. */
export function claimsOf(record: ProjectRecord): readonly string[] {
  return record.repositories ?? [];
}

/**
 * The open project claiming a repository, or undefined. A CLOSED project's
 * claims are inert: it cannot take a task anyway, so honouring its claim would
 * route work to a floor that must then refuse it — a default that produces a
 * refusal is worse than no default.
 */
export async function claimant(root: string, name: string): Promise<FoundProject | undefined> {
  return (await readProjects(root)).find(
    (project) => project.record.state !== 'closed' && claimsOf(project.record).includes(name),
  );
}

/** Refuse a name no repository record answers for — a claim on nothing routes nothing. */
export function requireRegistered(root: string, name: string): string {
  if (!listRepositoryNames(root).includes(name)) {
    throw new WardError(`no repository named '${name}' is registered — see: ward repo list`);
  }
  return name;
}

export interface ClaimReport {
  readonly project: ProjectRecord;
  readonly repository: string;
  /** `claimed` — it was unclaimed; `moved` — taken from another open floor; `satisfied` — already here. */
  readonly outcome: 'claimed' | 'moved' | 'satisfied';
  /** The floor the claim came from — present exactly when it moved. */
  readonly from?: number;
  /**
   * Open tasks that touch the repository and stay where they are — the
   * consequence a moved claim must not hide (§20): routing changed, placement
   * did not, and the human is the one who decides whether that is fine.
   */
  readonly staying: readonly { address: string; slug: string; floor?: number }[];
}

/**
 * Claim a repository for a floor. A repository is claimed by **at most one
 * open project**, so claiming from a second floor MOVES the claim rather than
 * splitting it — two claimants would make the routing default ambiguous, which
 * is the one thing a default may never be. Nothing already placed moves: the
 * report names the open tasks that touch the repository and stay behind.
 */
export async function claimRepository(
  root: string,
  floor: number,
  nameInput: string,
): Promise<ClaimReport> {
  const name = requireRegistered(root, nameInput);
  return withStoreLock(root, `project claim ${floor} ${name}`, async () => {
    const target = await resolveProject(root, floor);
    if (target.record.state === 'closed') {
      throw new WardError(
        `floor ${floor} is closed — a closed floor takes no tasks, so a claim on it routes ` +
          'nothing; claim it for an open floor instead (see: ward project list)',
      );
    }
    const holder = await claimant(root, name);
    const staying = await tasksTouching(root, name, target.record.floor);
    if (holder !== undefined && holder.record.floor === floor) {
      return { project: target.record, repository: name, outcome: 'satisfied', staying };
    }
    if (holder !== undefined) {
      await writeClaims(
        root,
        holder,
        claimsOf(holder.record).filter((claimed) => claimed !== name),
      );
    }
    const record = await writeClaims(root, target, [...claimsOf(target.record), name].sort());
    commitRecords(
      root,
      `Claim ${name} for floor ${floor}`,
      ...(holder === undefined ? [target.dir] : [target.dir, holder.dir]),
    );
    return {
      project: record,
      repository: name,
      outcome: holder === undefined ? 'claimed' : 'moved',
      ...(holder === undefined ? {} : { from: holder.record.floor }),
      staying,
    };
  });
}

export interface ReleaseReport {
  readonly project: ProjectRecord;
  readonly repository: string;
  /** `released` — the claim was there and is gone; `absent` — the floor never held it. */
  readonly outcome: 'released' | 'absent';
}

/**
 * Drop a floor's claim. Releasing a name the floor does not hold converges
 * rather than refusing (§6): the caller asked for a state, and the state is
 * already true. Unlike a claim this accepts an unregistered name — releasing
 * a claim on a repository that has since been removed is exactly the remedy
 * doctor names for it.
 */
export async function releaseRepository(
  root: string,
  floor: number,
  name: string,
): Promise<ReleaseReport> {
  return withStoreLock(root, `project release ${floor} ${name}`, async () => {
    const target = await resolveProject(root, floor);
    if (!claimsOf(target.record).includes(name)) {
      return { project: target.record, repository: name, outcome: 'absent' };
    }
    const record = await writeClaims(
      root,
      target,
      claimsOf(target.record).filter((claimed) => claimed !== name),
    );
    commitRecords(root, `Release ${name} from floor ${floor}`, target.dir);
    return { project: record, repository: name, outcome: 'released' };
  });
}

export interface Placement {
  /** The floor the task should open on — undefined leaves it in the bare pool. */
  readonly floor?: number;
  /**
   * What to say on the echo line: how the floor was chosen, or why it was not.
   * Always present, because a placement the caller did not ask for must never
   * be silent (§20).
   */
  readonly note?: string;
}

/**
 * Where a task opened with `--repo NAME…` belongs, when no `--project` was
 * given. One claimant routes; no claimant leaves the task bare with the hint
 * that would fix it; two claimants refuse, because guessing between two
 * floors is exactly the ambiguity the claim's one-claimant rule exists to
 * prevent, and `--project` resolves it in one word.
 */
export async function placeByAffinity(
  root: string,
  repositories: readonly string[],
): Promise<Placement> {
  const found = new Map<number, { slug: string; repos: string[] }>();
  for (const name of repositories) {
    const holder = await claimant(root, name);
    if (holder === undefined) continue;
    const seen = found.get(holder.record.floor) ?? { slug: holder.record.slug, repos: [] };
    seen.repos.push(name);
    found.set(holder.record.floor, seen);
  }
  if (found.size === 0) {
    const hint = repositories[0];
    return hint === undefined
      ? {}
      : { note: `no floor claims ${hint} — ward project claim FLOOR ${hint}` };
  }
  if (found.size > 1) {
    const named = [...found]
      .sort(([a], [b]) => a - b)
      .map(([floor, seen]) => `floor ${floor} claims ${seen.repos.join(', ')} (${seen.slug})`)
      .join('; ');
    throw new WardError(
      `the repositories named are claimed by different floors — ${named}; name the floor ` +
        'explicitly: ward task open SLUG --project FLOOR',
    );
  }
  const [floor, seen] = [...found][0] as [number, { slug: string; repos: string[] }];
  return { floor, note: `floor ${floor} by affinity: ${seen.repos.join(', ')}` };
}

/**
 * The repository a `worktree create` with no `--repo` should use: the task's
 * single recorded one. Nothing recorded, or several, is not a guess Ward gets
 * to make — the caller names it, exactly as before this entry.
 */
export function recordedRepository(task: FoundTask): string | undefined {
  const repositories = task.record.repositories ?? [];
  return repositories.length === 1 ? repositories[0] : undefined;
}

/** Open tasks touching a repository that are NOT on the floor now claiming it. */
async function tasksTouching(
  root: string,
  name: string,
  exceptFloor: number,
): Promise<ClaimReport['staying']> {
  const staying: { address: string; slug: string; floor?: number }[] = [];
  for (const task of await readTasks(root)) {
    if (task.record.state === 'closed') continue;
    if (!(task.record.repositories ?? []).includes(name)) continue;
    if (task.record.floor === exceptFloor) continue;
    staying.push({
      address: taskAddress(task),
      slug: task.record.slug,
      ...(task.record.floor === undefined ? {} : { floor: task.record.floor }),
    });
  }
  return staying;
}

/**
 * Rewrite a project's claims, keeping its body byte-for-byte: the record's
 * prose is the workspace's to edit, and a mutation that touches one front
 * matter key has no business rewriting it (the same rule `writeTask` follows).
 * An empty set removes the key rather than storing `[]` — an absent optional
 * is how this codebase spells "none" everywhere else.
 */
async function writeClaims(
  root: string,
  project: FoundProject,
  repositories: readonly string[],
): Promise<ProjectRecord> {
  const record: ProjectRecord = { ...project.record };
  if (repositories.length === 0) delete (record as { repositories?: string[] }).repositories;
  else (record as { repositories?: string[] }).repositories = [...repositories];
  const existing = await readDocument(root, projectRecordType(project.dir));
  await writeDocument(root, projectRecordType(project.dir), {
    data: record,
    body: existing.body,
  });
  return record;
}
