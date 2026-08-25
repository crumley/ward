# 0032 — Spec-feedback

> Intent frictions found while building the task-scope session launch.

This file is the entry's adjudication surface and is read on its own. Context for both SFs:
[0032](README.md) made `ward session open TASK --purpose TEXT` launch the agent at **task scope**,
standing in the task's worktree — the task's sole worktree when it has exactly one, `--dir` when it
has none or several — extending the workspace-scope launch
([0029](../0029-launched-sessions/README.md)) to a second scope. Both frictions were surfaced by the
same design question: where does a task's agent stand, and who decides?

- **SF-001** — [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md), _Scope
  and working directory: the two axes of a session_. _Friction:_ the slice says the two axes "are
  chosen independently when a session starts", and its why is real — responsibility and standing are
  different choices. But this entry (and 0029 before it, silently) has Ward **derive** the directory
  from the scope when the opener does not choose: workspace scope stands in the root, task scope in
  the task's sole worktree, and an ambiguous derivation is refused rather than guessed. Nothing in
  the slice says who chooses, or what an unchosen directory means at each scope — read literally,
  "chosen independently" could demand that every open name both axes, which would cost the launched
  open its one-command shape for no gain in the ordinary case. _Assumption to keep moving:_
  independence means the axes **can** be set independently (`--dir` overrides at either scope), not
  that Ward may not derive a natural default from the scope's own record; a derivation with more
  than one honest answer is a refusal, never a pick. _Proposed revision:_ one sentence in the
  two-axes section: "Each scope has a natural standing place — the workspace its root, a task its
  worktree, a room its anchor — which Ward may derive when the opener does not choose; where the
  derivation is ambiguous, Ward asks rather than guesses. Independence means the opener can always
  override it." _Why it belongs in intent:_ it holds however the launch is built, and it is the
  difference between a one-command open and a form with two required fields.
- **SF-002** — [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md), _The
  roles_ (resident vs. room) with [`domain-model`](../../intent/01-concepts/00-domain-model.md)'s
  scope vocabulary. _Friction:_ deciding where a task-scope session stands surfaced a boundary the
  role model draws and the session machinery cannot yet honor. In the role model, the **resident**
  (task scope) directs and evaluates but "does not do the work itself"; the hands-on work happens in
  a **room**, standing on the worktree. This entry launches a task-scope session standing **in** the
  worktree to do the hands-on work — the honest shape today, because rooms have no records and
  personas no cast, but it means the one session is both resident and room, and when room-scope
  sessions arrive, every session this entry launched will read as a resident doing student work. The
  intent never says what the role model means for a workspace operating **below** its persona
  machinery. _Assumption to keep moving:_ scope names responsibility, not conduct — a task-scope
  session is responsible for the task's outcome, and until a narrower scope exists to hold the
  hands-on episode, recording it at task scope in the worktree is accurate, not a violation; the
  role model describes the cast Ward is growing toward, not a constraint on a cast-less workspace.
  _Proposed revision:_ a clause where the roles are introduced: "Until a workspace has rooms and a
  cast, sessions at a scope may do the work the role model would delegate below it; the role model
  constrains personas, and a session with no persona is bound only by its scope's responsibility."
  Alternatively, fold it into the existing conditioned-minimum idiom (0029's SF-004): role
  expectations, like persona fields, are conditioned on the cast existing.
