// Global configuration (design/0024-global-config-registry/): the preferences
// axis of "opinionated configuration, global and workspace-local"
// (intent/02-subsystems/07-human-shell.md). One document,
// `$XDG_CONFIG_HOME/ward/config.md`, whose front matter is the settings tree —
// so a dotted key IS its path through the document: `repo.refresh.stash` is
//
//     repo:
//       refresh:
//         stash: true
//
// Every key is optional and every absence resolves to the built-in default, so
// there is exactly one description of what Ward does by default (DEFAULTS
// below) and a config file is never required. A file that will not parse
// degrades to those same defaults, loudly through doctor and silently at the
// point of use (§20): a preference file is not something a workspace command
// may die on.
import { z } from 'zod';
import type { DocumentType } from '../store/document.ts';
import { configDir } from './paths.ts';
import { type GlobalRead, readGlobal } from './store.ts';

export const globalConfigSchema = z.object({
  type: z.literal('ward-config'),
  repo: z
    .object({
      refresh: z
        .object({
          /**
           * `repo.refresh.stash` — whether `ward repo refresh` stashes a
           * dirty canonical checkout instead of refusing to touch it. The key
           * and its validation land here; the flag that reads it is a
           * separate, parallel piece of work, so today this is a preference
           * Ward records and does not yet act on.
           */
          stash: z.boolean().optional(),
        })
        .optional(),
    })
    .optional(),
});
export type GlobalConfigRecord = z.infer<typeof globalConfigSchema>;

export const globalConfigType: DocumentType<GlobalConfigRecord> = {
  name: 'ward-config',
  relPath: 'config.md',
  schema: globalConfigSchema,
};

/** The resolved settings: every key answered, whatever the file says or lacks. */
export interface GlobalConfig {
  readonly repo: { readonly refresh: { readonly stash: boolean } };
}

/**
 * Ward's opinions, in one place. A key's default is stated here and nowhere
 * else, so "what does Ward do when nothing is configured?" has one answer that
 * cannot drift from what the code does.
 */
export const CONFIG_DEFAULTS: GlobalConfig = { repo: { refresh: { stash: false } } };

/** The settings as resolved for this invocation — never throws (§20). */
export async function readConfig(dir: string = configDir()): Promise<GlobalConfig> {
  return resolveConfig(await readGlobal(dir, globalConfigType));
}

/**
 * The config read as doctor needs it: the resolved settings AND how they were
 * arrived at, so the diagnostic surface can name a broken file rather than
 * green-lighting defaults that silently replaced it (§20's loop).
 */
export async function inspectConfig(
  dir: string = configDir(),
): Promise<{ config: GlobalConfig; read: GlobalRead<GlobalConfigRecord> }> {
  const read = await readGlobal(dir, globalConfigType);
  return { config: resolveConfig(read), read };
}

function resolveConfig(read: GlobalRead<GlobalConfigRecord>): GlobalConfig {
  if (read.state !== 'read') return CONFIG_DEFAULTS;
  const record = read.document.data;
  return {
    repo: {
      refresh: { stash: record.repo?.refresh?.stash ?? CONFIG_DEFAULTS.repo.refresh.stash },
    },
  };
}
