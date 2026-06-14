# How-Intent: Context Loading, Token Economy & Session Tracking

Durable choices about *how* an agent session acquires its context and how Ward tracks the
underlying agent run. This cuts across the **agent harness**, **session multiplexer**, and
**metadata store** seams. It is the mechanism behind several what-intent statements:
self-sufficiency, harness-/model-agnosticism, scope-plus-working-directory, and token economy
(`../what/01-principles.md` §3, §5, §9, §12).

> This doc is the **canonical example** of the how-intent conventions: it fixes the
> *constraints* on context assembly and deliberately leaves the *exact algorithm* to the
> implementation (see "For the implementation plan" below).

## Choice: context loads from an `AGENTS.md` hierarchy keyed to the working directory

A session's default context is assembled from **harness-neutral `AGENTS.md` files arranged
through the filesystem hierarchy**, loaded relative to the session's **working directory**
(`../what/02-domain-model.md`).

- A broad-scope session started near the **workspace root** loads the workspace-level
  `AGENTS.md` and the top-level skills it points to.
- A narrow-scope session started in a **repository or worktree directory** loads *that*
  directory's `AGENTS.md` and *its* skills, staying specialized.

Each `AGENTS.md` is the **manifest for its level**: it tells the agent what artifacts, skills,
and records to load for that scope, rather than relying on the agent to discover them.

**Why harness-neutral (`AGENTS.md`, not a harness-specific file).** `../what/01-principles.md`
§5: whichever harness operates the session must find the right context, and harnesses must be
mixable. Standardizing on `AGENTS.md` keeps the workspace portable.

**Why keyed to working directory.** It makes "scope + working directory" operational: where you
start determines what you load, so a room is specialized to its worktree while the attending
sees the project.

## Choice: build context from stable artifacts in a deterministic order

When a session's context is assembled, it is built from **stable, append-only artifacts loaded
in a deterministic order**, so two sessions at the same scope assemble an identical prefix.

**Why — token caching.** Identical, identically-ordered prefixes let sessions at the same scope
**share token caches** — a direct, measurable form of token economy (§12). Non-deterministic
ordering or churn in early context defeats the cache and wastes tokens (and money, and
attention).

**Implication — prefer immutability and append over rewrite.** As a scope's context evolves,
prefer **appending** new stable artifacts over **rewriting** existing ones, unless a rewrite is
genuinely necessary. Append preserves the cacheable prefix; rewrite invalidates it.

> **Tension to manage (open).** Reflection and the teaching loop *want* context to evolve,
> while caching wants it stable. Where evolving, rewritable context lives relative to the
> stable cacheable prefix is unresolved (`../what/08-open-questions.md`). The durable choice is
> the *bias*: append by default, rewrite only when warranted.

## Choice: record a harness handle for every session

For every session, Ward records a **harness handle** — which harness produced it and that
harness's native run id — in the session log (`../what/04-sessions-and-lifecycle.md`). The
handle is a recorded *attribute*, not a second identity (`harness.md`).

**Why.** Each harness stores its conversation history in its own format and location. The
recorded handle is the only reliable way to **locate the underlying run again** — to *resume* it
after a reboot, and to *reflect* over it later (`../what/06-reflection-and-evolution.md`).
Without it, reflection could not span a mix of harnesses, and recovery would depend on a human
remembering which run was which.

## Guardrails — what this is, and what it is not

- **Is:** harness-/model-neutral context, loaded by working directory through an `AGENTS.md`
  hierarchy, assembled deterministically from stable artifacts, with the harness handle always
  recorded.
- **Is not:** a fixed ordering algorithm, a fixed set of `AGENTS.md` fields, or a mandate on
  how skills are referenced — those are the implementer's to design.
- **Is not:** a ban on evolving context. Context *does* evolve (reflection, teaching); the
  guardrail is only the **bias** toward append over rewrite to protect the cache.
- **Is not:** a requirement to use a specific harness's run-id format. What must survive is that
  the handle is **recorded and resolvable** back to the underlying run.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the precise `AGENTS.md` field conventions; how skills are referenced and
resolved; the **exact ordering algorithm** for the cacheable prefix and where the mutable tail
begins; the per-harness handle formats and history locations; and any caching configuration.
These are the focus areas; this doc fixes the constraints, not the answers.
