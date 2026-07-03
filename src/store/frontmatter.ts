// Canonical YAML front-matter parse/serialize — the ONLY place front matter is
// written (ADR 0004). Reading is tolerant; writing is canonical (sorted keys,
// fixed style, terminal newline) so re-writing an unchanged document is a no-op
// diff — the file-level idempotency that lets append-over-rewrite (§12) and
// no-lost-updates (§17) hold in a plain git tree without a database.

import { parse, stringify } from 'yaml';

/** A document is typed front matter plus a Markdown body. */
export interface RawDocument {
  frontmatter: unknown;
  body: string;
}

const FENCE = '---';

/**
 * Split a document file into its front matter (parsed YAML) and its body.
 * A file with no leading fence is treated as all-body with empty front matter.
 */
export function parseDocument(text: string): RawDocument {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith(`${FENCE}\n`)) {
    return { frontmatter: {}, body: normalized };
  }
  const end = normalized.indexOf(`\n${FENCE}`, FENCE.length + 1);
  if (end === -1) {
    throw new Error('unterminated front-matter fence');
  }
  const yamlText = normalized.slice(FENCE.length + 1, end + 1);
  const rest = normalized.slice(end + 1 + FENCE.length + 1);
  const body = rest.startsWith('\n') ? rest.slice(1) : rest;
  return { frontmatter: parse(yamlText) ?? {}, body };
}

/**
 * Serialize front matter + body to canonical bytes. Keys are sorted so the same
 * logical document always produces the same file; the body is normalized to end
 * with exactly one newline.
 */
export function serializeDocument(doc: RawDocument): string {
  const yamlText = stringify(doc.frontmatter, {
    sortMapEntries: true,
    lineWidth: 0,
  });
  const body = doc.body.replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
  return `${FENCE}\n${yamlText}${FENCE}\n${body}`;
}
