// Artifacts (domain-model). Any durable output shared across sessions/agents,
// carrying provenance (who/where/why + derived-from). A BRIEF is one artifact
// type: the handoff that conjures and orients another agent. Artifacts live at a
// scope and are discoverable across it.

import { readdir } from 'node:fs/promises';
import { readAs, writeDocument } from '../store/doc.ts';
import { artifactDoc, artifactsDir } from '../store/paths.ts';
import { type Artifact, artifactSchema, type Provenance, type ScopeRef } from '../store/schemas.ts';
import { resolveScopeDir } from '../store/workspace.ts';

export interface WriteArtifactInput {
  scope: ScopeRef;
  name: string;
  artifactType: Artifact['artifactType'];
  provenance: Provenance;
  forScope?: ScopeRef;
  summary?: string;
  body?: string;
}

export async function writeArtifact(root: string, input: WriteArtifactInput): Promise<Artifact> {
  const scopeDir = await resolveScopeDir(root, input.scope);
  const artifact: Artifact = {
    type: 'artifact',
    name: input.name,
    artifactType: input.artifactType,
    scope: input.scope,
    provenance: input.provenance,
    ...(input.forScope === undefined ? {} : { forScope: input.forScope }),
    ...(input.summary === undefined ? {} : { summary: input.summary }),
  };
  await writeDocument(artifactDoc(scopeDir, input.name), artifact, input.body ?? '');
  return artifact;
}

export async function listArtifacts(root: string, scope: ScopeRef): Promise<Artifact[]> {
  const scopeDir = await resolveScopeDir(root, scope);
  const files = await readdir(artifactsDir(scopeDir)).catch(() => [] as string[]);
  const artifacts: Artifact[] = [];
  for (const file of files.filter((n) => n.endsWith('.md'))) {
    artifacts.push(
      (await readAs(artifactDoc(scopeDir, file.replace(/\.md$/, '')), artifactSchema)).doc,
    );
  }
  return artifacts.sort((a, b) => a.name.localeCompare(b.name));
}
