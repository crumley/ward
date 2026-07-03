// Seam: model selection (04-model-selection). The durable part is the fast-vs-deep
// intent and the override hierarchy (narrower overrides broader); the concrete
// model ids are config held in the workspace record, never in the concepts.
//
// Defaults follow the persona's job: status/routing roles run fast; depth roles
// run deep. So a new session usually needs no explicit choice — the tier falls
// out of the role.

import type { Role, Tier } from '../store/schemas.ts';

const TIER_BY_ROLE: Record<Role, Tier> = {
  'house-supervisor': 'fast',
  'charge-nurse': 'fast',
  attending: 'deep',
  resident: 'deep',
  'medical-student': 'deep',
};

/** The default tier for a role (defaults follow the persona's job). */
export function tierForRole(role: Role): Tier {
  return TIER_BY_ROLE[role];
}

/**
 * Resolve a session's tier: the first defined override wins, narrowest first
 * (session/room → task → project → persona), falling back to the role default.
 * `undefined` entries mean "no override at that scope" and are skipped.
 */
export function resolveTier(
  role: Role,
  overridesNarrowestFirst: readonly (Tier | undefined)[],
): Tier {
  for (const override of overridesNarrowestFirst) {
    if (override !== undefined) {
      return override;
    }
  }
  return tierForRole(role);
}
