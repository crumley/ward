// Seam: remote work-item provider (06-remote-provider). The remote side of the
// local↔remote boundary. It RECEIVES ONLY ALREADY-SANITIZED content: every text
// argument is a `Sanitized` (produced only by the privacy gate), so a raw string
// cannot reach the forge — the provider adds no leak surface of its own. Posting
// is a §18 GATED action: each mutating call demands an `Authority`. v2 ships an
// in-memory stub; a real forge is a thin adapter swap behind this interface.

import { type Authority, type Sanitized, sanitizedText } from './privacy.ts';

export interface RemoteRef {
  provider: string;
  id: string;
  url: string;
}

export type RemotePrState = 'open' | 'changes-requested' | 'approved' | 'merged';

export interface RemotePr {
  number: number;
  state: RemotePrState;
  url: string;
}

export interface RemoteProvider {
  readonly name: string;
  createWorkItem(title: Sanitized, body: Sanitized, auth: Authority): Promise<RemoteRef>;
  comment(ref: RemoteRef, body: Sanitized, auth: Authority): Promise<void>;
  openPr(repo: string, title: Sanitized, body: Sanitized, auth: Authority): Promise<RemotePr>;
  advancePr(pr: number, state: RemotePrState, auth: Authority): Promise<RemotePr>;
}

export interface StubRemote extends RemoteProvider {
  /** Everything the forge received — all already sanitized — for inspection in tests. */
  readonly received: string[];
}

/** An in-memory remote for v2: records what crossed so tests can assert it is clean. */
export function makeStubRemote(name = 'stub'): StubRemote {
  const received: string[] = [];
  let nextItem = 1;
  let nextPr = 1;

  return {
    name,
    received,
    async createWorkItem(title, body, _auth) {
      received.push(sanitizedText(title), sanitizedText(body));
      const id = String(nextItem);
      nextItem += 1;
      return { provider: name, id, url: `${name}://items/${id}` };
    },
    async comment(_ref, body, _auth) {
      received.push(sanitizedText(body));
    },
    async openPr(repo, title, body, _auth) {
      received.push(sanitizedText(title), sanitizedText(body));
      const number = nextPr;
      nextPr += 1;
      return { number, state: 'open', url: `${name}://${repo}/pull/${number}` };
    },
    async advancePr(pr, state, _auth) {
      return { number: pr, state, url: `${name}://pull/${pr}` };
    },
  };
}
