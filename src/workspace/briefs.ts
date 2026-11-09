// A task's brief as a typed artifact (design/0056-worktree-context-bridge/):
// the seeded `brief` type gets its runtime schema (`briefSchema`), one write
// verb (`ward task brief`), and a lenient read, which `ward task show` reports
// as the task's `brief` — the one place an agent finds it (design 0057). A brief that predates the type
// is a hand-written `brief.md` with no front matter; it still counts as the
// task's brief everywhere a brief is looked for, and doctor names it with the
// verb that re-records it in place. Nothing migrates it behind the human's
// back: the body is the human's handoff, and only a verb they run rewrites it.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readDocument, writeDocument } from '../store/document.ts';
import { splitFrontMatter } from '../store/frontmatter.ts';
import { withStoreLock } from '../store/lock.ts';
import { type BriefRecord, briefRecordType, briefSchema } from '../store/types.ts';
import { taskAddress } from './address.ts';
import { commitRecords, type FoundTask, resolveOpenTask } from './scan.ts';
import { findSession } from './sessions.ts';

/**
 * How a task's `brief.md` reads: `absent`; `typed` (valid front matter);
 * `untyped` (no front matter at all — a brief from before the type, read
 * leniently); or `invalid` (front matter that is not a valid brief).
 */
export type BriefStanding =
  | { readonly standing: 'absent' }
  | { readonly standing: 'typed'; readonly record: BriefRecord }
  | { readonly standing: 'untyped' }
  | { readonly standing: 'invalid'; readonly reason: string };

/** Where a task's brief lives, whether or not it is there. */
export function briefPath(taskDir: string): string {
  return briefRecordType(taskDir).relPath;
}

/** Read a task's brief leniently. A read: mutates nothing. */
export async function readBrief(root: string, taskDir: string): Promise<BriefStanding> {
  const type = briefRecordType(taskDir);
  const file = join(root, type.relPath);
  if (!existsSync(file)) return { standing: 'absent' };
  const text = await Bun.file(file).text();
  if (!text.startsWith('---\n')) return { standing: 'untyped' };
  try {
    return { standing: 'typed', record: (await readDocument(root, type)).data };
  } catch (error) {
    if (error instanceof WardError) return { standing: 'invalid', reason: error.message };
    throw error;
  }
}

export interface BriefReport {
  readonly task: FoundTask;
  readonly address: string;
  /** Workspace-relative path of the brief written. */
  readonly path: string;
  readonly record: BriefRecord;
  /** Whether a brief stood there before — typed or not — and was replaced. */
  readonly replaced: boolean;
}

/**
 * Record a task's brief: replace `brief.md` with the given text under typed
 * front matter, and commit it alone.
 *
 * The text is the body. Text that already carries brief front matter — a
 * typed brief handed back to be re-recorded — contributes its body only, so
 * the verb converges on its own output; front matter of any other kind is
 * refused, since it would be stored as prose. `session` is recorded only when
 * the declared caller names a recorded session (provenance conditioned on a
 * source existing).
 */
export async function recordBrief(
  root: string,
  taskCode: string,
  text: string,
  declared: string | undefined,
  now: Date = new Date(),
): Promise<BriefReport> {
  const body = briefBody(text);
  if (body === '') throw new WardError('a brief needs a body — the file is empty');
  const session = declared === undefined ? undefined : await recordedSession(root, declared);
  const { task, path, record, replaced } = await withStoreLock(
    root,
    `task brief ${taskCode}`,
    async () => {
      const found = await resolveOpenTask(root, taskCode);
      const type = briefRecordType(found.dir);
      const written: BriefRecord = {
        type: 'brief',
        for: taskAddress(found),
        createdAt: now.toISOString(),
        ...(session === undefined ? {} : { session }),
      };
      const existed = existsSync(join(root, type.relPath));
      await writeDocument(root, type, { data: written, body });
      commitRecords(root, `Record brief for task ${taskAddress(found)}`, type.relPath);
      return { task: found, path: type.relPath, record: written, replaced: existed };
    },
  );
  return { task, address: taskAddress(task), path, record, replaced };
}

/** The body a brief file contributes, with any brief front matter set aside. */
function briefBody(text: string): string {
  if (!text.startsWith('---\n')) return text.trim();
  const raw = splitFrontMatter(text, 'the brief');
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(raw.frontMatter);
  } catch {
    parsed = undefined;
  }
  if (!briefSchema.safeParse(parsed).success) {
    throw new WardError(
      'the file opens with front matter that is not a brief — pass the handoff text alone; ' +
        'Ward writes the front matter',
    );
  }
  return raw.body.trim();
}

async function recordedSession(root: string, id: string): Promise<string | undefined> {
  try {
    return (await findSession(root, id)).record.id;
  } catch (error) {
    if (error instanceof WardError) return undefined; // declared, but no session: no provenance
    throw error;
  }
}
