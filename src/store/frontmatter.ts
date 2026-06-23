// Canonical front-matter parse/serialize. The ONLY writer of YAML front matter, so every document
// Ward writes is byte-deterministic (principles §6) and produces minimal git diffs / stable token
// caches (§12). See build/decisions/0004-frontmatter-determinism.md.

import { parse as yamlParse, stringify as yamlStringify } from "yaml";

export type Parsed = { data: Record<string, unknown>; body: string };

const FM_RE = /^---\n([\s\S]*?)\n---\n?/;

// Fields that, when present, sort to the top of a document in a fixed order; everything else is
// alphabetical. Purely cosmetic-for-humans + deterministic-for-machines; order has no semantics.
const PRIORITY = [
  "type",
  "schemaVersion",
  "identity",
  "name",
  "title",
  "wardVersion",
  "kind",
  "verb",
  "artifactType",
  "goal",
  "state",
];

function rank(k: string): number {
  const i = PRIORITY.indexOf(k);
  return i === -1 ? PRIORITY.length : i;
}

// Recursively rebuild objects with canonically-ordered keys, dropping `undefined`. Arrays keep their
// order (sequence is meaningful). The result stringifies deterministically.
function canon(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined);
    keys.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0));
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = canon(obj[k]);
    return out;
  }
  return value;
}

export function parseFrontmatter(raw: string): Parsed {
  const m = raw.match(FM_RE);
  if (!m) return { data: {}, body: raw.replace(/^\n+/, "") };
  const data = (yamlParse(m[1]!) ?? {}) as Record<string, unknown>;
  const body = raw.slice(m[0].length).replace(/^\n+/, "");
  return { data, body };
}

export function serializeFrontmatter(data: Record<string, unknown>, body = ""): string {
  const fm = yamlStringify(canon(data), { lineWidth: 0 });
  const trimmed = body.replace(/\s+$/, "");
  const bodyPart = trimmed ? `\n${trimmed}\n` : "";
  return `---\n${fm}---\n${bodyPart}`;
}
