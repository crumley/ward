// Caller identity (human-shell seam): the human is the DEFAULT caller and declares nothing; an agent
// caller declares itself via an ambient env signal Ward sets when it starts an agent. When the
// signal is present, agent context (persona/scope/cwd) is available and the caller gets deterministic
// handling — never a blocking interactive prompt (§8).

export type Caller = {
  agent: boolean;
  json: boolean;
  persona?: string;
  scope?: string;
  cwd: string;
};

export function detectCaller(flags: { json?: boolean }): Caller {
  const agent = process.env.WARD_AGENT === "1" || !!process.env.WARD_PERSONA;
  return {
    agent,
    // Humans get text by default; agents get deterministic JSON by default; --json forces it.
    json: !!flags.json || agent,
    persona: process.env.WARD_PERSONA,
    scope: process.env.WARD_SCOPE,
    cwd: process.env.WARD_CWD ?? process.cwd(),
  };
}
