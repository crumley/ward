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
- A narrow-scope session started in a **repository or anchor directory** loads _that_ directory's
  `AGENTS.md` and _its_ skills, staying specialized.

Each `AGENTS.md` is the **manifest for its level**: it names the artifacts, skills, and records to
load for that scope, rather than relying on the agent to discover them.

**Why harness-neutral (`AGENTS.md`, not a harness-specific file).** Per §5: whichever harness
operates the session must find the right context, and harnesses must be mixable. Standardizing on
`AGENTS.md` keeps the workspace portable. **Why keyed to working directory.** It makes "scope +
working directory" operational: where you start determines what you load, so a room is specialized
to its anchor while the attending sees the project.

## Context is built from stable artifacts in a deterministic order

When a session's context is assembled, it is built from **stable, append-only artifacts loaded in a
deterministic order**, so two sessions at the same scope assemble an identical prefix.

**Why — token caching.** Identical, identically-ordered prefixes let sessions at the same scope
**share token caches** — a direct, measurable form of token economy (§12). Non-deterministic
ordering or churn in early context defeats the cache and wastes tokens, money, and attention.

**Implication — prefer immutability and append over rewrite.** As a scope's context evolves, prefer
**appending** new stable artifacts over **rewriting** existing ones, unless a rewrite is genuinely
necessary. Append preserves the cacheable prefix; rewrite invalidates it.

## Evolving context lives in a mutable tail behind the stable prefix

Caching wants context stable; reflection and the teaching loop want it to evolve
([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)). The resolution: context is
assembled in **two zones, ordered by expected rate of change**.

- The **stable prefix** — identity and scope records, principles, settled skills, closed decisions —
  is append-only and deterministically ordered. This is the zone sessions share token caches on.
- The **mutable tail** — evolving standards, skills under revision, current status — loads **after**
  the stable prefix. Rewrites are legal only here.

**Why this works:** cache invalidation propagates only forward from the first changed position, so
volatile content loaded last leaves the prefix's cache intact. A document **graduates** into the
stable prefix when it stops changing — and graduation is itself an append-shaped change.

**The stable prefix changes only at adoption boundaries.** Rewriting the prefix is not forbidden —
it is **batched**. Reflection produces proposals asynchronously
([`04-reflection-and-evolution.md`](04-reflection-and-evolution.md)); **adopting** them is the
deliberate, rare moment the prefix may be rewritten and the cache knowingly re-primed. **Why:** a
cache bust is a real cost worth paying for a genuine improvement; what the token economy cannot
absorb is _continuous_ churn. Batching rewrites at adoption boundaries turns churn into a
deliberate, priced act.

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
  deterministic/append-oriented bias for cache sharing, the **two-zone model** (stable prefix +
  mutable tail, graduation, adoption boundaries), and the harness-handle-per-session rule.

Other slices reference these; the _working directory_ axis itself is defined in
[`00-domain-model.md`](00-domain-model.md), and the economy principle in
[`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §12.

## Left to implementation

- The precise `AGENTS.md` field conventions and how skills are referenced/resolved; the **exact
  ordering algorithm** within each zone and which document types classify into prefix vs. tail; the
  **graduation mechanics** (who decides a document has stabilized, and how); the per-harness handle
  formats and history locations; any caching configuration. Bound: the result must stay
  harness-neutral, deterministic for the cacheable prefix, and append-biased — with prefix rewrites
  confined to adoption boundaries. Planned in [`design/`](../../design/).

## Open questions

- None currently. The append-vs-rewrite line is settled as the **two-zone model with adoption
  boundaries** (above).
