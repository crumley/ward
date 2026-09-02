// What Ward hands the harness when it starts an agent
// (design/0028-agent-configuration/): which harness, which model, how much
// thinking effort, any extra flags — and, since design/0035-agent-command/,
// how the harness is invoked on this machine. Two axes carry it — the pair the
// human-shell contract names (intent/02-subsystems/07-human-shell.md,
// "Opinionated configuration, global and workspace-local"): a human's
// defaults in the global config, overridden PER KEY by the workspace record.
//
// This module is the vocabulary and the precedence rule, and nothing else:
// one schema shape used by both axes — so a key means the same thing wherever
// it is written — and one pure merge that answers every key with its
// PROVENANCE. It reads no files; `resolveAgentConfig` takes the layers its
// caller already holds, which is what lets doctor resolve from the record it
// has just validated instead of reading it twice, and keeps the precedence
// rule in exactly one place.
//
// The rule the module exists to hold: OMITTED MEANS OMITTED. A key set
// nowhere resolves to `absent`, never to a Ward-invented value, because the
// consumer must then leave the corresponding flag off the launch command
// entirely. Ward has no opinion about which model or effort is right; it has
// a firm opinion about not inventing one.
import { z } from 'zod';

/**
 * The harnesses Ward can start. Enum-validated — and the contrast with
 * `effort` below is the whole point: the harness set is Ward's OWN
 * vocabulary (it is the list of adapters Ward has), so a value outside it
 * names a configuration Ward genuinely cannot honor, and refusing it is not
 * gatekeeping somebody else's namespace. One value today; the key exists so
 * the swappable seam (intent/02-subsystems/03-agent-harness.md — selectable
 * per scope) is visible in configuration from day one rather than appearing
 * as a surprise the day a second adapter lands.
 */
export const agentHarnessSchema = z.literal('claude');
export type AgentHarness = z.infer<typeof agentHarnessSchema>;

/**
 * One agent settings block. The SAME schema is embedded in the global config
 * (`agent:`) and in the workspace record (`agent:`), so the two axes cannot
 * drift into different spellings of the same idea, and a human who learns the
 * block once can write it in either file.
 */
export const agentSettingsSchema = z.object({
  harness: agentHarnessSchema.optional(),
  /**
   * The model, passed to the harness verbatim. Never validated against a list
   * of names: model identifiers are configuration that tracks the best
   * available models over time (intent/02-subsystems/04-model-selection.md),
   * and a Ward-side list would be stale within months.
   */
  model: z.string().min(1).optional(),
  /**
   * Thinking effort, passed verbatim. Deliberately NOT enum-validated against
   * today's levels: that vocabulary belongs to the harness CLI, which owns it,
   * errors clearly on a level it does not know, and will grow new ones on its
   * own schedule. A Ward-side enum would turn the day the harness adds a level
   * into the day Ward rejects a valid configuration — gating a vocabulary we
   * do not own buys no safety and breaks on someone else's release.
   */
  effort: z.string().min(1).optional(),
  /**
   * Extra arguments appended verbatim to the end of the launch command —
   * `['--dangerously-skip-permissions']` the motivating case. Generic on
   * purpose: a `permissions` key would read as a permissions-only knob, while
   * what the mechanism actually IS, is "these strings go on the end of the
   * command", which really could be anything. Entries are non-empty because
   * an empty argv entry is a live hazard on a command line and never a thing
   * anyone means.
   */
  args: z.array(z.string().min(1)).optional(),
  /**
   * How the harness is INVOKED on this machine (design/0035-agent-command/):
   * the program and any leading words, `['npx', 'claude']` the motivating
   * case — a machine where `claude` cannot be run directly and has to be
   * reached through a launcher. Distinct from `harness`, which says WHICH
   * adapter reads the handle and shapes the argv; this says how that adapter's
   * CLI is started here. A list, never one string: splitting a string would
   * mean choosing a quoting rule, and a list is already the shape a spawn
   * takes. At least one entry, because a command with no program runs
   * nothing — there is no "none" escape hatch here the way `args: []` is one;
   * a workspace that wants the default back names it (`command: [claude]`).
   * Absent means the adapter's own default program stands, exactly as before
   * the key existed.
   */
  command: z.array(z.string().min(1)).min(1).optional(),
});
export type AgentSettings = z.infer<typeof agentSettingsSchema>;

/**
 * Ward's opinions about the agent, in one place — and note how few there are.
 * `harness` has one because Ward must pick an adapter to run at all; `args`
 * has one because "no extra flags" is the honest empty case. `model` and
 * `effort` are ABSENT from this object, and that absence is the design: Ward
 * states no default for either, so a key nobody set resolves to `absent` and
 * the launch passes no flag (the directive's omitted-means-omitted ask, made structural).
 */
export const AGENT_DEFAULTS: {
  readonly harness: AgentHarness;
  readonly args: readonly string[];
} = { harness: 'claude', args: [] };

/** Which layer answered a key — reported per key, for display and for debugging. */
export type AgentProvenance = 'workspace' | 'global' | 'default' | 'absent';

/**
 * One key's answer. A union rather than `{ value?: T }` so that "set nowhere"
 * is structurally distinct from "set to a default": there is no value to read
 * on an `absent` key, and a consumer that forgets to branch does not compile.
 * That is the whole contract entry 0029's launch rests on.
 */
export type Resolved<T> =
  | { readonly provenance: 'absent' }
  | { readonly provenance: 'workspace' | 'global' | 'default'; readonly value: T };

/** Every key answered, each with the layer that answered it. */
export interface ResolvedAgentConfig {
  readonly harness: Resolved<AgentHarness>;
  readonly model: Resolved<string>;
  readonly effort: Resolved<string>;
  readonly args: Resolved<readonly string[]>;
  /** Absent when nobody set it: the harness adapter's default program then runs. */
  readonly command: Resolved<readonly string[]>;
}

/** The layers, narrowest first when they disagree. Either may be missing. */
export interface AgentLayers {
  readonly workspace?: AgentSettings | undefined;
  readonly global?: AgentSettings | undefined;
}

/**
 * The precedence rule, stated once: workspace beats global beats the built-in
 * default, resolved INDEPENDENTLY PER KEY. Setting `model` in a workspace
 * therefore overrides only the model — the effort and args a human set once,
 * globally, keep answering — which is exactly what "I want my defaults, and
 * in this one workspace the model is different" asks for.
 *
 * `args` — and `command` — replace at the winning level; they never
 * concatenate across levels.
 * A concatenation would be a one-way ratchet: a flag set globally could never
 * be REMOVED for one workspace, only added to, and the way out would be to
 * edit the global file that every other workspace depends on. Replacement
 * makes the escape hatch the obvious one — `args: []` in a workspace record
 * means "none of them here" — and keeps the resolved value something a human
 * can read off a single file rather than assemble in their head.
 */
export function resolveAgentConfig({ workspace, global }: AgentLayers): ResolvedAgentConfig {
  return {
    harness: pick(workspace?.harness, global?.harness, AGENT_DEFAULTS.harness),
    model: pick(workspace?.model, global?.model),
    effort: pick(workspace?.effort, global?.effort),
    args: pick<readonly string[]>(workspace?.args, global?.args, AGENT_DEFAULTS.args),
    // No Ward-side default: which program starts the harness is the ADAPTER's
    // knowledge (src/harness/claude.ts), and this module knows no adapter.
    command: pick<readonly string[]>(workspace?.command, global?.command),
  };
}

/**
 * One key, resolved. The test is `!== undefined`, never truthiness: an
 * explicitly empty `args: []` is a value a human wrote and must win over the
 * global one, which a falsy test would silently skip past.
 */
function pick<T>(workspace: T | undefined, global: T | undefined, fallback?: T): Resolved<T> {
  if (workspace !== undefined) return { provenance: 'workspace', value: workspace };
  if (global !== undefined) return { provenance: 'global', value: global };
  if (fallback !== undefined) return { provenance: 'default', value: fallback };
  return { provenance: 'absent' };
}
