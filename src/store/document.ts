// Typed, validated store documents: markdown files with YAML front matter,
// each belonging to a DocumentType whose zod schema is enforced on read and
// write. Writes are atomic — staged in .ward/tmp/ and renamed into place — so
// no reader ever observes a partial document (ADR 0005).
import { readFileSync } from 'node:fs';
import { mkdir, rename } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { z } from 'zod';
import { WardError } from '../errors.ts';
import { requireFormatFor, requireReadableFormat } from './format.ts';
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

/**
 * Every read and every write first asks whether this Ward may read the
 * workspace at all (design/0066-workspace-format-guard/): a record written at
 * a format level above this Ward's is refused before a byte of it is parsed,
 * because parsing it is how an older reader comes to misread it. The CLI asks
 * the same question up front; asking it here too is what covers a path into
 * the store that no one remembered to gate. A root with no workspace record —
 * a global directory, a workspace being created — has no level and passes.
 */
export async function readDocument<T>(root: string, type: DocumentType<T>): Promise<Document<T>> {
  requireReadableFormat(root);
  return parseDocument(await Bun.file(join(root, type.relPath)).text(), type);
}

/**
 * The same read, blocking — for the few questions asked from synchronous code
 * deep in a call path (where a repository's canonical checkout stands,
 * design/0065-external-checkouts-and-repo-commands/). One parser serves both,
 * so the two reads can never disagree about what a valid document is.
 */
export function readDocumentSync<T>(root: string, type: DocumentType<T>): Document<T> {
  requireReadableFormat(root);
  return parseDocument(readFileSync(join(root, type.relPath), 'utf8'), type);
}

function parseDocument<T>(text: string, type: DocumentType<T>): Document<T> {
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

/**
 * The exact bytes a document writes to disk. Exported so the artifact lineage
 * (design/0020-deterministic-upgrade/) can know what a generated installed
 * artifact's current default looks like through the very serializer that
 * installs it — one code path, so the two can never disagree.
 */
export function renderDocument<T>(type: DocumentType<T>, document: Document<T>): string {
  const data = type.schema.parse(document.data);
  return joinFrontMatter(stableYaml(Bun.YAML.stringify(data, null, 2)), document.body);
}

/**
 * Bun's YAML writer, made byte-stable across Bun versions. Releases before
 * 1.4.4 leave a trailing space after a key that opens a nested value
 * (`prs: `) and put an empty collection on its own line (`prs: \n  []`);
 * 1.4.4 writes `prs:` and `prs: []`. A record's bytes — and the hash an
 * installed artifact's lineage pins (design/0020-deterministic-upgrade/) —
 * must not depend on which Bun ran, so both spellings are folded to the newer
 * one. Safe on this writer's output: every string is quoted on one line, so a
 * line's trailing space or a bare `[]` line is never inside a value.
 */
export function stableYaml(text: string): string {
  return text.replace(/[ \t]+$/gm, '').replace(/^(.*:)\n[ \t]+(\[\]|\{\})$/gm, '$1 $2');
}

/**
 * Write a document atomically. `stageIn` names the staging directory — it
 * defaults to the workspace's own `.ward/tmp/`, and is overridden by the
 * global documents (design/0024-global-config-registry/), which live outside
 * any workspace and stage beside themselves. The only requirement is the one
 * ADR 0005 rests on: the staging directory and the destination share a
 * filesystem, so the rename is atomic.
 */
export async function writeDocument<T>(
  root: string,
  type: DocumentType<T>,
  document: Document<T>,
  options: { readonly stageIn?: string } = {},
): Promise<void> {
  requireReadableFormat(root);
  // And the other direction: a shape the workspace's level does not describe
  // waits for the upgrade that raises it.
  requireFormatFor(root, type.name, document.data);
  const text = renderDocument(type, document);
  const file = join(root, type.relPath);
  await mkdir(dirname(file), { recursive: true });
  const tmpDir = options.stageIn ?? join(root, '.ward', 'tmp');
  await mkdir(tmpDir, { recursive: true });
  const tmp = join(tmpDir, `${basename(file)}.${process.pid}.${nextWrite++}`);
  await Bun.write(tmp, text);
  await rename(tmp, file);
}

let nextWrite = 0;
