// The single upstream privacy-translation gate (06-remote-provider, §4). Every
// outward path — a remote comment AND an artifact committed into a worktree
// (which reaches the remote on merge) — crosses HERE, exactly once. Enforced in
// one place so the boundary cannot leak at the spot someone forgot, and swapping
// the forge never reopens the hole.
//
// Two guards, kept distinct:
//   - TRANSLATION governs WHAT crosses — re-author for the remote audience,
//     stripping local paths, provenance, and Ward's internal machinery (persona
//     names + the CLOSED role vocabulary). Strictly OUTWARD-guarding.
//   - AUTHORITY (§18) governs WHETHER it crosses now — a human or delegated grant.
//
// FAIL-CLOSED: nothing is emitted unless the gate can affirmatively verify it is
// clean. The role vocabulary being CLOSED is what makes redaction EXHAUSTIVE
// rather than best-effort; persona names are supplied to the gate as data.

import { ROLES } from '../store/schemas.ts';

declare const sanitizedBrand: unique symbol;
/** Text that has passed the gate. Only `translateOutward` produces it, so a raw
 * string cannot be handed to the remote provider — the single gate, enforced by types. */
export type Sanitized = string & { readonly [sanitizedBrand]: true };

declare const authorityBrand: unique symbol;
/** A §18 grant to take a gated outward action. Only the constructors below mint it. */
export type Authority = { readonly grantedBy: string; readonly [authorityBrand]: true };

export function humanAuthority(): Authority {
  return { grantedBy: 'human' } as unknown as Authority;
}

export function delegatedAuthority(scope: string): Authority {
  return { grantedBy: scope } as unknown as Authority;
}

export interface Redaction {
  kind: 'role' | 'persona' | 'path' | 'provenance';
  match: string;
}

export interface Translation {
  clean: Sanitized;
  redactions: Redaction[];
}

export interface TranslateOptions {
  /** The workspace's persona names — internal machinery, supplied as data (§4). */
  personaNames: readonly string[];
  /** Local paths that must never appear outward (e.g. the workspace root, home). */
  localPaths?: readonly string[];
}

const PLACEHOLDER = '[redacted]';

// The CLOSED role vocabulary, expanded to every prose form. Because ROLES cannot
// grow at a workspace's whim, this enumeration is EXHAUSTIVE — the property §4
// leans on for a guaranteed-complete redaction rather than a best-effort one.
const ROLE_FORMS: Record<(typeof ROLES)[number], readonly string[]> = {
  'house-supervisor': ['house-supervisor', 'house supervisor', 'supervisor'],
  attending: ['attending physician', 'attending'],
  'charge-nurse': ['charge-nurse', 'charge nurse'],
  resident: ['resident'],
  'medical-student': ['medical-student', 'medical student', 'med student'],
};

const ROLE_WORDS: readonly string[] = ROLES.flatMap((r) => ROLE_FORMS[r]);

/** Absolute-looking local paths (POSIX and Windows) — never valid in a remote artifact. */
const ABSOLUTE_PATH = /(?:[A-Za-z]:\\|\/)[\w./\\-]+/g;

/**
 * Re-author local text for the remote audience, then VERIFY it is clean.
 * Returns the sanitized text and what was stripped. Throws (fail-closed) if any
 * forbidden token survives — the gate never emits text it cannot prove clean.
 */
export function translateOutward(text: string, opts: TranslateOptions): Translation {
  const redactions: Redaction[] = [];
  let out = stripFrontMatter(text, redactions);

  for (const word of ROLE_WORDS) {
    out = redactPhrase(out, word, 'role', redactions);
  }
  for (const name of opts.personaNames) {
    out = redactPhrase(out, name, 'persona', redactions);
  }
  for (const local of opts.localPaths ?? []) {
    out = redactPhrase(out, local, 'path', redactions);
  }
  out = out.replace(ABSOLUTE_PATH, (m) => {
    redactions.push({ kind: 'path', match: m });
    return PLACEHOLDER;
  });

  assertClean(out, opts); // fail-closed verification
  return { clean: out as unknown as Sanitized, redactions };
}

/**
 * Throw if any forbidden token (role word, persona name, local path) remains.
 * This is the fail-closed check `translateOutward` runs on its own output, and a
 * standalone assertion the rest of the system can call before any crossing.
 */
export function assertClean(text: string, opts: TranslateOptions): void {
  const lower = text.toLowerCase();
  for (const word of ROLE_WORDS) {
    if (matchesWord(lower, word.toLowerCase())) {
      throw new Error(`privacy gate refused to cross: role word "${word}" present`);
    }
  }
  for (const name of opts.personaNames) {
    if (matchesWord(lower, name.toLowerCase())) {
      throw new Error(`privacy gate refused to cross: persona name "${name}" present`);
    }
  }
  for (const local of opts.localPaths ?? []) {
    if (lower.includes(local.toLowerCase())) {
      throw new Error(`privacy gate refused to cross: local path present`);
    }
  }
}

/** Read the sanitized text back as a plain string (for storage/echo). */
export function sanitizedText(value: Sanitized): string {
  return value;
}

function redactPhrase(
  text: string,
  phrase: string,
  kind: Redaction['kind'],
  redactions: Redaction[],
): string {
  if (phrase.length === 0) {
    return text;
  }
  const re = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi');
  return text.replace(re, (m) => {
    redactions.push({ kind, match: m });
    return PLACEHOLDER;
  });
}

function stripFrontMatter(text: string, redactions: Redaction[]): string {
  const normalized = text.replace(/\r\n/g, '\n');
  if (!normalized.startsWith('---\n')) {
    return normalized;
  }
  const end = normalized.indexOf('\n---', 4);
  if (end === -1) {
    return normalized;
  }
  redactions.push({ kind: 'provenance', match: 'front-matter block' });
  const rest = normalized.slice(end + 4);
  return rest.startsWith('\n') ? rest.slice(1) : rest;
}

function matchesWord(haystackLower: string, needleLower: string): boolean {
  if (needleLower.length === 0) {
    return false;
  }
  return new RegExp(`\\b${escapeRegExp(needleLower)}\\b`).test(haystackLower);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
