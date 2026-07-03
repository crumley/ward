// Append-only event logs, one file per entry, plus fold(events) -> state.
// This single mechanism is reused for derived status, session lifecycle, and
// wake state (design/00-foundation).
//
// No-lost-updates is STRUCTURAL here (§17): each append is an EXCLUSIVE file
// create, so two concurrent writers can never overwrite one another — on a
// filename clash the loser simply bumps its sequence and lands in its own file.
// The `seq` gives a total order; ties are impossible because the create is `wx`.

import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseDocument, serializeDocument } from './frontmatter.ts';
import { eventSchema, type WardEvent } from './schemas.ts';

export type Clock = () => string;
export const systemClock: Clock = () => new Date().toISOString();

const SEQ_RE = /^(\d+)-/;
const MAX_APPEND_ATTEMPTS = 10_000;

export interface AppendInput {
  kind: string;
  actor?: string;
  data?: Record<string, unknown>;
}

/** Append one event to a scope's log dir; returns the event actually written. */
export async function appendEvent(
  logDirPath: string,
  input: AppendInput,
  now: Clock = systemClock,
): Promise<WardEvent> {
  await mkdir(logDirPath, { recursive: true });
  let seq = await nextSeq(logDirPath);
  for (let attempt = 0; attempt < MAX_APPEND_ATTEMPTS; attempt += 1) {
    const event = eventSchema.parse({
      type: 'event',
      seq,
      at: now(),
      kind: input.kind,
      ...(input.actor === undefined ? {} : { actor: input.actor }),
      data: input.data ?? {},
    });
    const file = join(logDirPath, `${String(seq).padStart(4, '0')}-${input.kind}.md`);
    try {
      await writeFile(file, serializeDocument({ frontmatter: event, body: '' }), {
        encoding: 'utf8',
        flag: 'wx',
      });
      return event;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        seq += 1;
        continue;
      }
      throw err;
    }
  }
  throw new Error(`could not allocate a free log sequence in ${logDirPath}`);
}

async function nextSeq(logDirPath: string): Promise<number> {
  const entries = await readdir(logDirPath).catch(() => [] as string[]);
  let max = -1;
  for (const name of entries) {
    const m = SEQ_RE.exec(name);
    if (m && m[1] !== undefined) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}

/** Read all events from a scope's log dir in sequence order (empty if none). */
export async function readEvents(logDirPath: string): Promise<WardEvent[]> {
  const entries = await readdir(logDirPath).catch(() => [] as string[]);
  const events: WardEvent[] = [];
  for (const name of entries) {
    if (!name.endsWith('.md')) {
      continue;
    }
    const raw = parseDocument(await readFile(join(logDirPath, name), 'utf8'));
    events.push(eventSchema.parse(raw.frontmatter));
  }
  return events.sort((a, b) => a.seq - b.seq);
}

/** Fold events into derived state — the basis for never-stored roll-ups. */
export function fold<S>(
  events: readonly WardEvent[],
  init: S,
  reducer: (state: S, event: WardEvent) => S,
): S {
  return events.reduce(reducer, init);
}
