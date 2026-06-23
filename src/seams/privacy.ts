// The privacy translation gate — the SINGLE upstream place where local content is re-authored for a
// remote audience (§4; remote-provider seam). Enforcement is strictly OUTWARD-guarding and
// FAIL-CLOSED: after stripping, the result is scanned for any residual leak and the gate THROWS
// rather than emit it. Every outward path (a remote comment AND an artifact committed into a
// worktree) must pass through here, so the forge adapter downstream can assume clean input and add
// no leak surface of its own.

import { homedir } from "node:os";

export type PrivacyCtx = {
  personaNames: string[]; // the cast — names must never cross (§4)
  workspaceRoot: string; // local path that must never cross
};

// Role words are internal machinery too ("the resident asked me to do this" must never appear).
const ROLE_WORDS = [
  "house supervisor",
  "attending physician",
  "attending",
  "charge nurse",
  "residents",
  "resident",
  "medical students",
  "medical student",
];

// Theme glyphs are local navigation cues; they never cross either (theming seam).
const GLYPHS = ["🏢", "🗂️", "🌳", "🚪", "👤"];

// Local absolute paths beyond the workspace root / home.
const PATH_PATTERNS = [
  /\/Users\/[^\s)]+/g,
  /\/home\/[^\s)]+/g,
  /\/private\/[^\s)]+/g,
  /\/var\/folders\/[^\s)]+/g,
  /(?<![\w/])\/tmp\/[^\s)]+/g,
];

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripFrontmatter(s: string): string {
  return s.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

export type Translation = { text: string; stripped: string[] };

// Re-author local content for a remote audience: drop front matter (internal), redact local paths,
// neutralize persona names and role words, strip glyphs, then VERIFY clean (fail-closed).
export function translate(content: string, ctx: PrivacyCtx): Translation {
  let text = stripFrontmatter(content);
  const stripped = new Set<string>();

  for (const p of [ctx.workspaceRoot, homedir()]) {
    if (p && text.includes(p)) {
      text = text.split(p).join("<redacted-path>");
      stripped.add("local-path");
    }
  }
  for (const re of PATH_PATTERNS) {
    if (re.test(text)) stripped.add("local-path");
    text = text.replace(re, "<redacted-path>");
  }
  for (const name of ctx.personaNames) {
    const re = new RegExp(`\\b${escapeRe(name)}\\b`, "gi");
    if (re.test(text)) {
      text = text.replace(re, "the team");
      stripped.add(`persona:${name}`);
    }
  }
  for (const role of ROLE_WORDS) {
    const re = new RegExp(`\\b${escapeRe(role)}\\b`, "gi");
    if (re.test(text)) {
      text = text.replace(re, "the team");
      stripped.add("role");
    }
  }
  for (const g of GLYPHS) {
    if (text.includes(g)) {
      text = text.split(g).join("");
      stripped.add("glyph");
    }
  }
  text = text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();

  assertClean(text, ctx); // fail-closed: never return content that still leaks
  return { text, stripped: [...stripped] };
}

// Independent verifier: throws if any forbidden token survives. Exported so the remote adapter can
// re-assert at the boundary, and so tests can prove the gate fails closed.
export function assertClean(text: string, ctx: PrivacyCtx): void {
  const leaks: string[] = [];
  for (const name of ctx.personaNames) {
    if (new RegExp(`\\b${escapeRe(name)}\\b`, "i").test(text)) leaks.push(`persona:${name}`);
  }
  if (ctx.workspaceRoot && text.includes(ctx.workspaceRoot)) leaks.push("local-path");
  if (text.includes(homedir())) leaks.push("local-path");
  for (const re of PATH_PATTERNS) {
    if (text.match(new RegExp(re.source, "g"))) leaks.push("local-path");
  }
  for (const g of GLYPHS) if (text.includes(g)) leaks.push("glyph");
  if (leaks.length) {
    throw new Error(`privacy gate refused: content would leak ${[...new Set(leaks)].join(", ")}`);
  }
}
