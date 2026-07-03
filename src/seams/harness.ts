// Seam: agent harness (03-agent-harness). A thin adapter exposing a small fixed
// surface — start / handle / resume / locate — with everything Ward-specific
// staying in Ward. v2 ships a STUB runtime: enough to exercise the whole
// contract (a recorded, resolvable handle; idempotent resume) without binding to
// a real harness, which is a later adapter swap that must not touch the concepts.

import type { HarnessHandle } from '../store/schemas.ts';

export interface StartOptions {
  /** The Ward session id this run backs — makes the stub handle stable & resolvable. */
  sessionId: string;
  workingDir: string;
}

export interface Harness {
  readonly kind: string;
  /** Start a run and return the handle Ward records (harness type + native run id). */
  start(opts: StartOptions): HarnessHandle;
  /** Re-attach to a recorded run. Idempotent: returns the SAME handle, never a new run. */
  resume(handle: HarnessHandle): HarnessHandle;
  /** A locator for the underlying run's history (for resume and reflection). */
  locate(handle: HarnessHandle): string;
}

/** The v2 stub harness. Its native run id is derived deterministically from the session id. */
export const stubHarness: Harness = {
  kind: 'stub',
  start({ sessionId }) {
    return { harness: 'stub', runId: `run-${sessionId}` };
  },
  resume(handle) {
    return handle;
  },
  locate(handle) {
    return `stub://runs/${handle.runId}`;
  },
};
