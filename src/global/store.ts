// The global documents' read/write seam (design/0024-global-config-registry/).
// They are ordinary store documents — markdown with typed, zod-validated YAML
// front matter, written atomically (ADR 0005) — living outside any workspace,
// so they stage their writes beside themselves rather than in a `.ward/tmp/`.
//
// What is different is the POSTURE, and it is the whole reason this file
// exists rather than calling the document layer directly: global state holds
// preferences and conveniences only (intent/01-concepts/06-workspace-lifecycle.md),
// so a global file that is absent, corrupt, or unreadable must never break a
// workspace-local command. Reads therefore return a three-state answer —
// absent, read, unreadable-and-why — instead of throwing: the point of use
// takes the honest bit (fall back to defaults) and doctor takes the diagnosis
// (§20's two halves, from one call).
//
// Writes are the other direction: a caller who ASKED to register a workspace
// is owed the truth if it did not happen, so `writeGlobal` throws legibly.
// Silent-and-implicit writers (the MRU touch) catch it themselves.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import {
  type Document,
  type DocumentType,
  readDocument,
  writeDocument,
} from '../store/document.ts';
import { type LockSite, withLock } from '../store/lock.ts';

export type GlobalRead<T> =
  /** No such file — the honest, common state: no preferences, no registry. */
  | { readonly state: 'absent' }
  | { readonly state: 'read'; readonly document: Document<T> }
  /** Present but unusable — invalid YAML, a failed schema, an unreadable file. */
  | { readonly state: 'unreadable'; readonly reason: string };

export async function readGlobal<T>(dir: string, type: DocumentType<T>): Promise<GlobalRead<T>> {
  const file = join(dir, type.relPath);
  if (!existsSync(file)) return { state: 'absent' };
  try {
    return { state: 'read', document: await readDocument(dir, type) };
  } catch (error) {
    return { state: 'unreadable', reason: reasonOf(error) };
  }
}

/**
 * Write one global document atomically, staging beside it (same filesystem,
 * so the rename is atomic) and reporting failure rather than swallowing it —
 * an unwritable global directory is a real answer to a caller who asked for a
 * change, and the message names the file.
 */
export async function writeGlobal<T>(
  dir: string,
  type: DocumentType<T>,
  document: Document<T>,
): Promise<void> {
  try {
    await writeDocument(dir, type, document, { stageIn: join(dir, 'tmp') });
  } catch (error) {
    throw new WardError(
      `cannot write ${join(dir, type.relPath)} — ${reasonOf(error)}; ` +
        'global state is a convenience: nothing in a workspace depends on it',
    );
  }
}

/**
 * Serialize a global read-modify-write. The same lock primitive the store
 * uses (design/0013-telemetry-and-serialized-writes/) at a global site — a
 * whole-document rewrite is exactly the shared write §17 says must not be
 * lost, and two shells registering workspaces at once is an ordinary thing to
 * do. The wait is short by default: nothing here is worth stalling a command
 * for, and the caller decides what a refusal means.
 */
/** Where a global lock file lives — doctor reads it, so it is named once. */
export function globalLockPath(dir: string, subject: string): string {
  return join(dir, `${subject.replaceAll(' ', '-')}.lock`);
}

export async function withGlobalLock<T>(
  dir: string,
  subject: string,
  verb: string,
  fn: () => Promise<T>,
  timeoutMs = 5_000,
): Promise<T> {
  const site: LockSite = {
    path: globalLockPath(dir, subject),
    tmpDir: join(dir, 'tmp'),
    subject,
    timeoutMs,
    // Quiet: the loudest global write is the recency touch, which rides every
    // invocation and which no caller asked for — a takeover note out of it
    // would be noise on an unrelated command's stderr. Doctor names the lock.
    quiet: true,
  };
  return withLock(site, verb, fn);
}

/** A failure in one clause, for the messages that have to name what broke. */
export function reasonOf(error: unknown): string {
  if (error instanceof WardError) return error.message;
  return error instanceof Error ? error.message : String(error);
}
