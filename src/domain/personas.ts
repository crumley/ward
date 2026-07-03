// The persona cast (01-scopes-and-personas). ROLES are a closed vocabulary
// (schemas.ts); PERSONAS are the open, evolvable cast — a name + role +
// disposition, injected at workspace setup from a static name list and, later,
// tunable by reflection. Many personas may share one role.

import { readdir } from 'node:fs/promises';
import { readAs, writeDocument } from '../store/doc.ts';
import { personaDoc, personasDir } from '../store/paths.ts';
import { type Persona, personaSchema } from '../store/schemas.ts';

/** Curated, memorable, role-neutral names — a stable pool workspace setup draws from. */
export const NAME_POOL = [
  'morgan',
  'avery',
  'casey',
  'riley',
  'quinn',
  'sage',
  'jordan',
  'devon',
] as const;

/** The default cast injected at `ward init`: one persona per role, from the name pool. */
export const DEFAULT_CAST: readonly Persona[] = [
  {
    type: 'persona',
    name: 'morgan',
    role: 'house-supervisor',
    disposition: 'Calm, workspace-wide awareness; routes without descending into detail.',
  },
  {
    type: 'persona',
    name: 'avery',
    role: 'attending',
    disposition: 'Owns project outcomes; sets and evolves the bar; gives final approval.',
  },
  {
    type: 'persona',
    name: 'casey',
    role: 'charge-nurse',
    disposition: 'Fast, precise status and routing across a project; never does the work.',
  },
  {
    type: 'persona',
    name: 'riley',
    role: 'resident',
    disposition: 'Owns a task; briefs and evaluates rooms rather than doing the deep work.',
  },
  {
    type: 'persona',
    name: 'quinn',
    role: 'medical-student',
    disposition: 'Hands-on depth in a room, under direction; surfaces what it learns.',
  },
];

export async function writePersona(root: string, persona: Persona): Promise<void> {
  await writeDocument(personaDoc(root, persona.name), persona);
}

export async function loadPersona(root: string, name: string): Promise<Persona> {
  return (await readAs(personaDoc(root, name), personaSchema)).doc;
}

export async function listPersonas(root: string): Promise<Persona[]> {
  const names = await readdir(personasDir(root)).catch(() => [] as string[]);
  const personas: Persona[] = [];
  for (const file of names.filter((n) => n.endsWith('.md'))) {
    personas.push((await readAs(personaDoc(root, file.replace(/\.md$/, '')), personaSchema)).doc);
  }
  return personas.sort((a, b) => a.name.localeCompare(b.name));
}

/** The default persona for a role, from the shipped cast (used when a scope names no one). */
export function defaultPersonaForRole(role: Persona['role']): Persona {
  const persona = DEFAULT_CAST.find((p) => p.role === role);
  if (persona === undefined) {
    throw new Error(`no default persona for role ${role}`);
  }
  return persona;
}
