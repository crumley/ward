// The agent configuration, resolved from a workspace root alone
// (design/0028-launched-sessions/). Entry 0027 deliberately shipped no reader:
// its resolution is pure and takes the two layers, because its only caller
// (doctor) already held both. The launch is the caller that does not — it
// starts from a root and a session record — so the reader lands here, with it,
// and the precedence rule stays exactly where 0027 put it.
//
// It lives beside `settings.ts` rather than inside it because `settings.ts`
// imports nothing but zod: the workspace record's schema embeds the agent
// block, so a reader in that file would close an import cycle
// (settings → store/types → settings).
import { readConfig } from '../global/config.ts';
import { readDocument } from '../store/document.ts';
import { workspaceRecordType } from '../store/types.ts';
import type { AgentSettings } from './settings.ts';
import { type ResolvedAgentConfig, resolveAgentConfig } from './settings.ts';

/**
 * What Ward would start an agent with, here. Both layers are read and merged
 * per key — workspace over global over Ward's own defaults, `absent` where
 * nobody chose (design/0027-agent-configuration/).
 *
 * A workspace record that will not parse degrades to "no workspace layer"
 * rather than failing the launch (§20, and doctor's own posture on the same
 * file): the human's global defaults still answer, doctor already names the
 * broken record precisely, and a preference file must never be the reason an
 * agent cannot be started.
 */
export async function readAgentConfig(root: string): Promise<ResolvedAgentConfig> {
  const global = (await readConfig()).agent;
  const workspace = await readWorkspaceAgent(root);
  return resolveAgentConfig({ workspace, global });
}

async function readWorkspaceAgent(root: string): Promise<AgentSettings | undefined> {
  try {
    return (await readDocument(root, workspaceRecordType)).data.agent;
  } catch {
    return undefined;
  }
}
