// The framing of a store document: a `---`-fenced YAML block followed by a
// markdown body. This layer only splits and joins the frame; parsing and
// validating the YAML is the document layer's job (document.ts).
import { WardError } from '../errors.ts';

export interface RawDocument {
  readonly frontMatter: string;
  readonly body: string;
}

const OPENING = /^---\n([\s\S]*?)\n---\n?/;

export function splitFrontMatter(text: string, file: string): RawDocument {
  const match = OPENING.exec(text);
  if (match === null || match[1] === undefined) {
    throw new WardError(
      `${file}: expected a document framed by \`---\` front-matter fences at the top`,
    );
  }
  return { frontMatter: match[1], body: text.slice(match[0].length).replace(/^\n+/, '') };
}

export function joinFrontMatter(frontMatter: string, body: string): string {
  const fenced = frontMatter.endsWith('\n') ? frontMatter : `${frontMatter}\n`;
  const trimmed = body.trim();
  return trimmed === '' ? `---\n${fenced}---\n` : `---\n${fenced}---\n\n${trimmed}\n`;
}
