// Typed, validated store documents: markdown files with YAML front matter,
// each belonging to a DocumentType whose zod schema is enforced on read and
// write. Writes are atomic — staged in .ward/tmp/ and renamed into place — so
// no reader ever observes a partial document (ADR 0005).
import { mkdir, rename } from 'node:fs/promises';
import { basename, join } from 'node:path';
import type { z } from 'zod';
import { WardError } from '../errors.ts';
import { joinFrontMatter, splitFrontMatter } from './frontmatter.ts';

export interface DocumentType<T> {
  /** The type name documents of this kind carry in their front matter. */
  readonly name: string;
  /** Path of the (singleton) document, relative to the workspace root. */
  readonly relPath: string;
  readonly schema: z.ZodType<T>;
}

export interface Document<T> {
  readonly data: T;
  readonly body: string;
}

export async function readDocument<T>(root: string, type: DocumentType<T>): Promise<Document<T>> {
  const text = await Bun.file(join(root, type.relPath)).text();
  const raw = splitFrontMatter(text, type.relPath);
  let parsed: unknown;
  try {
    parsed = Bun.YAML.parse(raw.frontMatter);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new WardError(`${type.relPath}: front matter is not valid YAML — ${reason}`);
  }
  const result = type.schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) =>
        issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message,
      )
      .join('; ');
    throw new WardError(`${type.relPath}: not a valid ${type.name} record — ${issues}`);
  }
  return { data: result.data, body: raw.body };
}

export async function writeDocument<T>(
  root: string,
  type: DocumentType<T>,
  document: Document<T>,
): Promise<void> {
  const data = type.schema.parse(document.data);
  const text = joinFrontMatter(Bun.YAML.stringify(data, null, 2), document.body);
  const file = join(root, type.relPath);
  const tmpDir = join(root, '.ward', 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const tmp = join(tmpDir, `${basename(file)}.${process.pid}.${nextWrite++}`);
  await Bun.write(tmp, text);
  await rename(tmp, file);
}

let nextWrite = 0;
