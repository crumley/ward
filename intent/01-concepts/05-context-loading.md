# Context Loading & Token Economy

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

How an agent session **acquires its context**, and how Ward keeps that assembly economical and
recoverable. This is the concrete face of several principles —
[`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §3 (self-sufficiency), §5
(harness-/model-agnostic), §9 (scope + working directory), and §12 (token economy). The constraints
below are durable; the **build** (the exact ordering algorithm, field conventions, handle formats)
is left to [`design/`](../../design/).

## Context loads downward from the workspace root, along the path a session works in

A session's default context is assembled from **harness-neutral `AGENTS.md` files arranged through
the filesystem hierarchy**, read **from the workspace root down** to the directory the session works
in ([`00-domain-model.md`](00-domain-model.md), the two axes).

- **Every session starts at the workspace root**, whatever its scope, so the workspace-level
  `AGENTS.md` and the top-level skills it points to are the first context any session loads.
- **Its scope comes from its identity, not its location.** A session learns what it is responsible
  for (the workspace, a project, a task) from its own record, which its declared identity names,
  never by inferring it from the directory it stands in.
- **Before it works in a directory, it reads each `AGENTS.md` on the path from the root down to that
  directory**, broadest first and nearest last. A narrow-scope session working in a repository or
  anchor directory thereby loads _that_ directory's `AGENTS.md` and _its_ skills after everything
  above it, and stays specialized.
- **The layout makes the path carry the context.** A project's working places sit beneath a
  directory that carries the project's `AGENTS.md`, so the path down to any anchor passes through
  every level whose guidance applies to the work there. No level is reached by a pointer, a
  variable, or a file named for one harness.

Each `AGENTS.md` is the **manifest for its level**: it names the artifacts, skills, and records to
load for that scope, rather than relying on the agent to discover them. An anchor's `AGENTS.md` is
its repository's own: Ward writes nothing inside an anchor, because the level above it already
carries what the workspace knows about the work there.

**Why harness-neutral (`AGENTS.md`, not a harness-specific file).** Per §5: whichever harness
operates the session must find the right context, and harnesses must be mixable. Standardizing on
`AGENTS.md` keeps the workspace portable. A harness that reads only its own filename is served by an
**adapter, not a copy**: the expected name may be satisfied by a link onto `AGENTS.md` that carries
no content of its own — the guidance still lives in one harness-neutral file, nothing can drift, and
no harness is privileged in substance.

**Why downward from the root.** It is the one direction every harness follows. Harnesses agree on
loading the guidance of the directory they start in and of its parents; they disagree on what, if
anything, they load below it, and on whether moving to another directory later loads anything at
all. A session that starts at the root is therefore guaranteed the workspace's manifest under any
harness, and that manifest can state one rule (read downward to where you work) that holds under all
of them. A harness that loads nested guidance natively does part of that reading for the agent; it
never has to do all of it. The alternative, starting low and loading upward, reads a level's
guidance only where a session happens to start: a session whose scope and starting directory differ
misses its own level, and each such case then needs a mechanism of its own (a pointer file, an
environment variable, a harness's local file) that is custom, harness-specific, and only as reliable
as the convention it leans on. **Why scope from identity.** The scope is a recorded fact; a
directory is only where the work happens to be. Read from the record, the scope is exact for every
session, wherever it works next. **Why the layout carries it.** A rule to read downward is only as
good as the path it walks. When a level's working places sit beneath that level's directory, walking
the path is the whole mechanism, and nothing has to be kept in step with it — so a room is
specialized to its anchor while the attending sees the project.

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

**The same ordering serves authorship.** Where an artifact is composed from a Ward-provided part and
the human's own ([`06-workspace-lifecycle.md`](06-workspace-lifecycle.md)), Ward's part loads
**first**: it is identical across every workspace at that version, so it caches, while the human's
part — the one that actually changes — belongs behind it. That the same order is independently
required so the human's content can **override** Ward's is what makes it a rule rather than a
convention.

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

- **Context assembly** — the downward-from-the-root model (every session starts at the workspace
  root, takes its scope from its identity, and reads each `AGENTS.md` from the root down to where it
  works, in a layout whose paths carry each level's guidance; an anchor's `AGENTS.md` is its
  repository's; a harness-specific filename served by an adapter onto `AGENTS.md`, never a copy),
  the deterministic/append-oriented bias for cache sharing, the **two-zone model** (stable prefix +
  mutable tail, graduation, adoption boundaries) **and its ordering, which serves authorship as well
  as volatility** (Ward's part first, the human's after —
  [`06-workspace-lifecycle.md`](06-workspace-lifecycle.md) owns the ownership split), and the
  harness-handle-per-session rule.

Other slices reference these; the _working directory_ axis itself is defined in
[`00-domain-model.md`](00-domain-model.md), and the economy principle in
[`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §12.

## Left to implementation

- The precise `AGENTS.md` field conventions and how skills are referenced/resolved; the on-disk
  layout that puts each level's working places beneath it, and how the downward reading is offered
  to an agent (a harness's native nested loading, a verb that names the chain); the **exact ordering
  algorithm** within each zone and which document types classify into prefix vs. tail; the
  **graduation mechanics** (who decides a document has stabilized, and how); the per-harness handle
  formats and history locations; any caching configuration. Bound: the result must stay
  harness-neutral, deterministic for the cacheable prefix, and append-biased — with prefix rewrites
  confined to adoption boundaries. Planned in [`design/`](../../design/).

## Open questions

- None currently. The append-vs-rewrite line is settled as the **two-zone model with adoption
  boundaries** (above).
