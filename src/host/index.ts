// The host registry (design/0031-detached-session-hosting/): the one place
// that knows which detached hosts exist. A launch selects one by the resolved
// `agent.host` (or `--detach`); everything after it — resume's gate, close's
// teardown, show's live block — selects by the host the latest launch event
// RECORDS, so a run is always looked for where it was put.
import type { HostedKind } from '../store/types.ts';
import type { SessionHost } from './host.ts';
import { tmuxHost } from './tmux.ts';

type Env = Record<string, string | undefined>;

/** The host a kind names, over this environment. */
export function hostFor(kind: HostedKind, env: Env = process.env): SessionHost {
  switch (kind) {
    case 'tmux':
      return tmuxHost(env);
  }
}
