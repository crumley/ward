// Typed document I/O: parse + validate on read, validate + canonical-write on
// write (ADRs 0003/0004). Everything above the store gets strongly-typed
// documents; a malformed file fails loudly at the boundary with a field-level
// error, never deep in domain logic.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { z } from 'zod';
import { parseDocument, serializeDocument } from './frontmatter.ts';
import { documentSchema, type WardDocument } from './schemas.ts';

export interface LoadedDocument<T = WardDocument> {
  doc: T;
  body: string;
}

/** Read and validate a document against the full catalog; caller narrows by `.type`. */
export async function readDocument(path: string): Promise<LoadedDocument> {
  const raw = parseDocument(await readFile(path, 'utf8'));
  return { doc: documentSchema.parse(raw.frontmatter), body: raw.body };
}

/** Read and validate against a specific schema — a typed read when the type is known from the path. */
export async function readAs<S extends z.ZodType>(
  path: string,
  schema: S,
): Promise<LoadedDocument<z.infer<S>>> {
  const raw = parseDocument(await readFile(path, 'utf8'));
  return { doc: schema.parse(raw.frontmatter), body: raw.body };
}

/**
 * Validate and write a document canonically (creating parent dirs). Validation
 * on write means only well-formed, defaulted, key-sorted documents ever land on
 * disk — so re-writing an unchanged document is a no-op diff.
 */
export async function writeDocument(path: string, doc: WardDocument, body = ''): Promise<void> {
  const validated = documentSchema.parse(doc);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, serializeDocument({ frontmatter: validated, body }), 'utf8');
}
