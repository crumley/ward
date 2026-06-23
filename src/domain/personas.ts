// The default persona cast Ward injects at workspace creation. Names come from a static, curated
// list (scopes-and-personas: stable, memorable, internal). From creation they are living workspace
// artifacts (persona docs) that reflection may add/modify/retire — not fixed in the CLI. Names and
// roles are INTERNAL and must never cross the privacy boundary (§4).

import type { PersonaDoc } from "../store/schemas.ts";

export type CastMember = { name: string; role: string; disposition: string; modelTier: string };

// Defaults follow the persona's job: fast/shallow for status+routing, deep for reasoning+hands-on
// (model-selection seam). Concrete model ids live in workspace.modelDefaults, never here.
export const DEFAULT_CAST: CastMember[] = [
  {
    name: "Sam",
    role: "house-supervisor",
    disposition: "Tracks status across the whole workspace; routes; owns no project outcome.",
    modelTier: "fast",
  },
  {
    name: "Avery",
    role: "attending",
    disposition: "Owns a project's outcome; sets standards; gives final approval; delegates.",
    modelTier: "deep",
  },
  {
    name: "Charlie",
    role: "charge-nurse",
    disposition: "Tracks status across a project; dispatches and routes; never descends into detail.",
    modelTier: "fast",
  },
  {
    name: "Riley",
    role: "resident",
    disposition: "Owns a task; briefs and directs rooms; evaluates results; does not do the work.",
    modelTier: "deep",
  },
  {
    name: "Morgan",
    role: "medical-student",
    disposition: "Does hands-on deep work inside a room, under the resident's direction.",
    modelTier: "deep",
  },
];

export function castToPersonaDocs(): PersonaDoc[] {
  return DEFAULT_CAST.map((m) => ({
    type: "persona" as const,
    schemaVersion: 1,
    name: m.name,
    role: m.role,
    disposition: m.disposition,
    modelTier: m.modelTier,
  }));
}

export function defaultFor(role: string): CastMember {
  const m = DEFAULT_CAST.find((c) => c.role === role);
  if (!m) throw new Error(`no default persona for role ${role}`);
  return m;
}
