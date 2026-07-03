// Scope-boundary reflection (04-reflection-and-evolution). When a scope closes,
// reflect over THAT scope's arc — a goal-directed routine, not "look at
// everything". It is a MAP-REDUCE so it scales past a single context window:
// chunk the scope's recorded events → distill each chunk → roll up into
// proposals. A per-(scope, goal) CURSOR records how far it reached, so the next
// run processes only what is new (incremental). Produces proposals, never silent
// edits. v2's distill is a deterministic stub; the structure is the invariant.

import { readAs, writeDocument } from '../store/doc.ts';
import { type Clock, readEvents } from '../store/log.ts';
import { logDir, reflectionDoc } from '../store/paths.ts';
import {
  type Reflection,
  reflectionSchema,
  type ScopeRef,
  type WardEvent,
} from '../store/schemas.ts';
import { resolveScopeDir } from '../store/workspace.ts';

const CHUNK_SIZE = 10;

export interface ReflectOptions {
  scope: ScopeRef;
  goal?: string;
  now?: Clock;
}

type Proposal = Reflection['proposals'][number];

export async function reflectOnScope(root: string, opts: ReflectOptions): Promise<Reflection> {
  const goal = opts.goal ?? 'scope-boundary';
  const key = scopeKey(opts.scope);
  const events = await readEvents(logDir(await resolveScopeDir(root, opts.scope)));
  const prior = await loadReflection(root, key, goal);
  const cursor = prior?.cursor ?? -1;

  // Only what is new since the cursor — the incremental guarantee.
  const fresh = events.filter((e) => e.seq > cursor);
  const proposals = rollUp(chunk(fresh, CHUNK_SIZE).map(distill), opts.scope);

  const maxSeq = events.reduce((m, e) => Math.max(m, e.seq), -1);
  const reflection: Reflection = {
    type: 'reflection',
    scope: key,
    goal,
    cursor: Math.max(0, maxSeq),
    proposals: [...(prior?.proposals ?? []), ...proposals],
  };
  await writeDocument(reflectionDoc(root, key, goal), reflection);
  return reflection;
}

export async function loadReflection(
  root: string,
  scopeKeyValue: string,
  goal: string,
): Promise<Reflection | null> {
  try {
    return (await readAs(reflectionDoc(root, scopeKeyValue, goal), reflectionSchema)).doc;
  } catch {
    return null;
  }
}

/** A stable filename key for a scope address (no slashes/colons). */
export function scopeKey(scope: ScopeRef): string {
  const ref = scope.ref.replace(/[/:]/g, '-');
  return ref.length === 0 ? scope.kind : `${scope.kind}-${ref}`;
}

interface Distillate {
  count: number;
  byKind: Record<string, number>;
}

function distill(events: readonly WardEvent[]): Distillate {
  const byKind: Record<string, number> = {};
  for (const event of events) {
    byKind[event.kind] = (byKind[event.kind] ?? 0) + 1;
  }
  return { count: events.length, byKind };
}

// Roll the distilled chunks into proposals. Deterministic and data-driven: no
// fresh activity → no proposals (so a re-run over nothing-new is empty).
function rollUp(distillates: readonly Distillate[], scope: ScopeRef): Proposal[] {
  const total = distillates.reduce((n, d) => n + d.count, 0);
  if (total === 0) {
    return [];
  }
  const merged: Record<string, number> = {};
  for (const d of distillates) {
    for (const [kind, n] of Object.entries(d.byKind)) {
      merged[kind] = (merged[kind] ?? 0) + n;
    }
  }
  const proposals: Proposal[] = [
    {
      kind: 'skill',
      summary: `Capture a reusable skill from ${total} recorded steps in this ${scope.kind}`,
    },
    { kind: 'standard', summary: 'Sharpen the brief template for similar work' },
  ];
  if ((merged['session-resumed'] ?? 0) >= 2) {
    proposals.push({
      kind: 'tooling',
      summary: 'Reduce re-work: repeated resumes suggest a missing checkpoint',
    });
  }
  return proposals;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}
