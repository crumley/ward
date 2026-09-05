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
import { type AgentSettings, agentSettingsSchema } from '../agent/settings.ts';
import type { DocumentType } from '../store/document.ts';
import { configDir } from './paths.ts';
import { type GlobalRead, readGlobal } from './store.ts';

export const globalConfigSchema = z.object({
  type: z.literal('ward-config'),
  /**
   * `agent.*` — the user-level defaults for every agent Ward starts: harness,
   * model, effort, and extra launch flags (design/0028-agent-configuration/).
   * The same block is accepted in a workspace record, which overrides this one
   * per key — the two axes the human-shell contract names, with this one as
   * the broad default ("every session I want … my default model to be Fable").
   */
  agent: agentSettingsSchema.optional(),
  /**
   * `machine` — what this computer is called in a session id
   * (design/0038-machine-bound-sessions/). The global layer is its only home:
   * how a machine is named is a fact about the machine, not about a
   * workspace, and a workspace record carrying it would travel to a machine
   * where it is false. Any non-empty string is accepted and normalized to the
   * slug alphabet by `machineName` — one definition of what a machine name
   * may contain, applied to configured and derived names alike.
   */
  machine: z.string().min(1).optional(),
  repo: z
    .object({
      refresh: z
        .object({
          /**
           * `repo.refresh.stash` — whether `ward repo refresh` stashes a
           * dirty canonical checkout instead of refusing to touch it. The
           * default for a human who left `--stash` off; a declared agent is
           * read from the flag alone (§8 — its invocation means the same
           * thing on every machine).
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
  /**
   * The agent block AS WRITTEN — the one subtree this file does NOT resolve to
   * defaults, because it is only one of two layers: the workspace record
   * overrides it per key, and the merge (and with it the defaulting) belongs to
   * where both layers are in hand (src/agent/settings.ts). Resolving here would
   * mean a global default beating a workspace value, which is precedence
   * exactly backwards. An unset block reads as `{}`: nothing configured.
   */
  readonly agent: AgentSettings;
  /**
   * The machine name AS WRITTEN — the second subtree this file does not
   * resolve, for a variation on the same reason: its default is not a
   * constant but a reading of THIS machine (the hostname), which belongs
   * where the ladder and the override live (src/global/machine.ts), not in a
   * table of Ward's opinions.
   */
  readonly machine: string | undefined;
  readonly repo: { readonly refresh: { readonly stash: boolean } };
}

/**
 * Ward's opinions, in one place. A key's default is stated here and nowhere
 * else, so "what does Ward do when nothing is configured?" has one answer that
 * cannot drift from what the code does. The agent block's own defaults are
 * stated in the same spirit one layer up (AGENT_DEFAULTS), for the reason
 * above; `{}` here is "no agent preferences", not "the agent defaults".
 */
export const CONFIG_DEFAULTS: GlobalConfig = {
  agent: {},
  machine: undefined,
  repo: { refresh: { stash: false } },
};

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
    agent: record.agent ?? CONFIG_DEFAULTS.agent,
    machine: record.machine,
    repo: {
      refresh: { stash: record.repo?.refresh?.stash ?? CONFIG_DEFAULTS.repo.refresh.stash },
    },
  };
}
