// Typed document I/O: parse + validate on read, validate + canonical-write on write. Every document
// in the store passes through here, so malformed front matter fails loudly at the boundary
// (metadata-store seam: no machine-critical state in unvalidated free text).

import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
import { dirname } from "node:path";
import { existsSync } from "node:fs";
import { parseFrontmatter, serializeFrontmatter } from "./frontmatter.ts";
import { DocSchema, type Doc, type DocInput } from "./schemas.ts";

export async function readDoc(path: string): Promise<{ doc: Doc; body: string }> {
  const raw = await readFile(path, "utf8");
  const { data, body } = parseFrontmatter(raw);
  const doc = DocSchema.parse(data);
  return { doc, body };
}

export async function writeDoc(path: string, data: DocInput, body = ""): Promise<Doc> {
  const doc = DocSchema.parse(data); // validate (and apply defaults) before writing
  const text = serializeFrontmatter(doc as Record<string, unknown>, body);
  await mkdir(dirname(path), { recursive: true });
  // Atomic write: temp + rename, so a reader never sees a half-written record (§17 serialize tier).
  const tmp = `${path}.tmp-${process.pid}-${process.hrtime.bigint()}`;
  await writeFile(tmp, text, "utf8");
  await rename(tmp, path);
  return doc;
}

// List subdirectories of a dir (e.g. project floors, task slugs, room codes). Empty if absent.
export async function listDirs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

// List `*.md` files in a dir (not recursive). Empty if absent.
export async function listDocs(dir: string): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isFile() && e.name.endsWith(".md")).map((e) => e.name).sort();
}
