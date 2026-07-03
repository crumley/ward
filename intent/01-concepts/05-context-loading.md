# Context Loading & Token Economy

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

How an agent session **acquires its context**, and how Ward keeps that assembly economical and
recoverable. This is the concrete face of several principles —
[`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §3 (self-sufficiency), §5
(harness-/model-agnostic), §9 (scope + working directory), and §12 (token economy). The constraints
below are durable; the **build** (the exact ordering algorithm, field conventions, handle formats)
is left to [`design/`](../../design/).

## Context loads from an `AGENTS.md` hierarchy keyed to the working directory

A session's default context is assembled from **harness-neutral `AGENTS.md` files arranged through
the filesystem hierarchy**, loaded relative to the session's **working directory**
([`00-domain-model.md`](00-domain-model.md), the two axes).

- A broad-scope session started near the **workspace root** loads the workspace-level `AGENTS.md`
  and the top-level skills it points to.
- A narrow-scope session started in a **repository or worktree directory** loads _that_ directory's
  `AGENTS.md` and _its_ skills, staying specialized.

Each `AGENTS.md` is the **manifest for its level**: it names the artifacts, skills, and records to
load for that scope, rather than relying on the agent to discover them.

**Why harness-neutral (`AGENTS.md`, not a harness-specific file).** Per §5: whichever harness
operates the session must find the right context, and harnesses must be mixable. Standardizing on
`AGENTS.md` keeps the workspace portable. **Why keyed to working directory.** It makes "scope +
working directory" operational: where you start determines what you load, so a room is specialized
to its worktree while the attending sees the project.

## Context is built from stable artifacts in a deterministic order

When a session's context is assembled, it is built from **stable, append-only artifacts loaded in a
deterministic order**, so two sessions at the same scope assemble an identical prefix.

**Why — token caching.** Identical, identically-ordered prefixes let sessions at the same scope
**share token caches** — a direct, measurable form of token economy (§12). Non-deterministic
ordering or churn in early context defeats the cache and wastes tokens, money, and attention.

**Implication — prefer immutability and append over rewrite.** As a scope's context evolves, prefer
**appending** new stable artifacts over **rewriting** existing ones, unless a rewrite is genuinely
necessary. Append preserves the cacheable prefix; rewrite invalidates it.

> **Tension to manage (open).** Reflection and the teaching loop _want_ context to evolve, while
> caching wants it stable. Where evolving, rewritable context lives relative to the stable cacheable
> prefix is unresolved (see Open questions). The durable commitment is the _bias_: append by
> default, rewrite only when warranted.

## Every session records a harness handle

For every session, Ward records a **harness handle** — which harness produced it and that harness's
native run id — in the session log ([`02-sessions-and-lifecycle.md`](02-sessions-and-lifecycle.md)).
The handle is a recorded _attribute_, not a second identity.

**Why.** Each harness stores its conversation history in its own format and location. The recorded
handle is the only reliable way to **locate the underlying run again** — to _resume_ it after a
reboot, and to _reflect_ over it later
([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)). Without it, reflection could
not span a mix of harnesses, and recovery would depend on a human remembering which run was which.
(The contract a harness must satisfy to expose and resolve the handle is
[`../02-subsystems/03-agent-harness.md`](../02-subsystems/03-agent-harness.md).)

## Canonical home for

- **Context assembly** — the `AGENTS.md`-hierarchy-by-working-directory model, the
  deterministic/append-oriented bias for cache sharing, and the harness-handle-per-session rule.

Other slices reference these; the _working directory_ axis itself is defined in
[`00-domain-model.md`](00-domain-model.md), and the economy principle in
[`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §12.

## Left to implementation

- The precise `AGENTS.md` field conventions and how skills are referenced/resolved; the **exact
  ordering algorithm** for the cacheable prefix and where the mutable tail begins; the per-harness
  handle formats and history locations; any caching configuration. Bound: the result must stay
  harness-neutral, deterministic for the cacheable prefix, and append-biased. Planned in
  [`design/`](../../design/).

## Open questions

- **Append vs. rewrite line.** §12 wants an append-only, deterministically ordered prefix for cache
  sharing; reflection and teaching want context to _evolve_. Where does evolving, rewritable context
  live relative to the stable cacheable prefix? (Cross-cutting — indexed in
  [`../00-foundation/open-questions.md`](../00-foundation/open-questions.md).)
