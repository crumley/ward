// Workspace creation: a deliberate, located, one-time act
// (intent/01-concepts/06-workspace-lifecycle.md, Creation is a deliberate act).
// It owns exactly one thing no other verb can do — turning a path that is not
// a workspace into one — and then hands the establishment steps to
// `convergeWorkspace`, which is the same list `workspace upgrade` runs on a
// workspace that already exists (design/0042-upgrade-owns-convergence/).
//
// A path that already carries the marker is REFUSED, naming the verb that owns
// updating it. A verb whose name says it makes something must not be the way a
// workspace that already exists is brought forward.
import { existsSync, statSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { WardError } from '../errors.ts';
import { convergeWorkspace, type StepReport } from './converge.ts';
import { gitAvailable } from './git.ts';
import { MARKER_DIR } from './layout.ts';

export interface CreateReport {
  readonly root: string;
  readonly steps: readonly StepReport[];
}

/**
 * Create a workspace at `path`: establish the root, then converge it. The two
 * steps are the whole verb, and only the first is creation's own — which is
 * why a run that crashed after the root step leaves a workspace `ward
 * workspace upgrade` finishes, rather than a half-made thing only this verb
 * could complete.
 */
export async function createWorkspace(path: string): Promise<CreateReport> {
  if (!gitAvailable()) {
    throw new WardError('git is required to create a workspace and was not found on PATH');
  }
  const root = resolve(path);
  const rootStep = await establishRoot(root);
  const converged = await convergeWorkspace(root);
  return { root, steps: [rootStep, ...converged.steps] };
}

/**
 * The one step creation owns: a location that is not yet a workspace. Three
 * answers, and only one of them proceeds.
 *
 * - **Absent** — made, and creation proceeds.
 * - **An empty directory** — accepted as the location the human chose.
 * - **Already a workspace** — refused, naming `ward workspace upgrade`.
 *   Creation is a one-time act; a workspace that exists is updated, not
 *   re-created. The refusal is what keeps "did I already init this?" a safe
 *   question: the answer is a refusal, never a clobber.
 * - **Populated and not a workspace** — refused, as it always was.
 */
async function establishRoot(root: string): Promise<StepReport> {
  const step = 'root directory';
  if (existsSync(root)) {
    if (!statSync(root).isDirectory()) {
      throw new WardError(`${root} exists and is not a directory`);
    }
    if (existsSync(join(root, MARKER_DIR))) {
      throw new WardError(
        `${root} is already a Ward workspace — bring it to this release with: ` +
          'ward workspace upgrade',
      );
    }
    if ((await readdir(root)).length > 0) {
      throw new WardError(
        `${root} is not empty and is not a Ward workspace — choose a new or empty location`,
      );
    }
    return { step, outcome: 'satisfied', detail: root };
  }
  await mkdir(root, { recursive: true });
  return { step, outcome: 'established', detail: root };
}
