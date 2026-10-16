// The declared agent caller (intent/02-subsystems/07-human-shell.md): the
// human is the default; an agent declares itself through an ambient
// environment signal. Presence of WARD_AGENT is the declaration — Ward gives
// a declared agent deterministic output (no ANSI, no interactive affordance),
// per the two-audiences asymmetry (intent/00-foundation/01-principles.md §8).
// Every interactive affordance the shell ever grows must branch on this
// predicate; see design/0005-agent-audience/.

/**
 * True when the caller has declared itself an agent by setting WARD_AGENT to
 * any non-empty value — by convention its Ward session id, but the value is
 * not verified at this version. Absence of the signal *is* "human"; nothing
 * more is ever asked of a human caller.
 */
export function callerIsAgent(env: Record<string, string | undefined> = process.env): boolean {
  const value = env.WARD_AGENT;
  return value !== undefined && value !== '';
}

/**
 * The session the caller declares itself to be (design/0052-session-parent-link/):
 * WARD_AGENT's value, which a Ward-launched run is born holding as its own
 * session id. Unverified here, deliberately — `1` and an id from another
 * workspace are both legitimate declarations, and only the store can say
 * whether the value names a session (src/workspace/sessions.ts, the parent
 * link). Undefined when nothing is declared.
 */
export function declaredSession(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  return callerIsAgent(env) ? env.WARD_AGENT : undefined;
}
