# Principles & Constraints

> **Layer:** intent · foundation (global). The what & why; every concept and seam honors these. **Status:** living.

These are the cross-cutting invariants. They apply everywhere and outrank local
convenience. Every concept and every subsystem in Ward is expected to honor them. Each
carries its *why*, because the reasoning is what lets you apply the principle to a case it
does not literally name.

## 1. Context management is the prime directive

The system exists to keep each scope's context focused on what that scope is for. Deep
work belongs in scopes built for deep work; high-level judgment belongs in scopes kept
free to think. **Why:** attention is the scarce resource; everything else is in service of
spending it well. When two designs compete, prefer the one that better preserves and
focuses context.

## 2. Specialization is a feature, not an accident

Each scope, persona, and agent harness should be able to **specialize** — to be shaped
tightly to its job. The scopes whose job is depth are given room to go deep; the scopes
whose job is breadth are kept from being dragged into depth. **Why:** focus (§1) is
achieved in practice by letting each part be narrow and good at one thing.

## 3. The workspace is self-sufficient

Everything needed to understand and resume the state of work lives in the workspace. A
cold start — new agent, rebooted machine, weeks elapsed — must be recoverable from what is
recorded there, with no reliance on a human's memory or on ephemeral terminal state.
**Why:** work is paused and resumed constantly; only what is written down survives.

## 4. Locality and privacy: the local↔remote boundary

The workspace is local and personal. Remote artifacts (issues, PRs, comments) are shared
and read by people who do not have our local context. **Local, personal context must never
leak across the boundary into remote artifacts** — not local paths, not private notes, and
not Ward's internal machinery, including **persona names and roles**. **Why:** remote
readers are on other machines with other context; leaking ours confuses them and exposes
us. Crossing the boundary is always an explicit, deliberate act of translation.

## 5. Harness- and model-agnostic by construction

The workspace and its structures must not assume a particular agent harness *or* a
particular model. Shared context is expressed in **harness-neutral form** (e.g.
`AGENTS.md`, not a harness-specific file); model and harness are selectable per scope.
**Why:** harnesses and models change fast and differ in strengths; the workspace must
outlive any one of them and be free to mix them (a fast model for bookkeeping, a deep one
for hard work).

## 6. Determinism and idempotency

Agents and humans must be able to rely on Ward behaving predictably.

- **Deterministic inspection.** "What is the state of X" returns the same answer for the
  same state, in a form agents can parse and humans can read.
- **Idempotent lifecycle and actions.** Operations that resume, open, or wake a thread —
  and setup/teardown actions (`../01-concepts/03-work-lifecycle.md`) — are safe to repeat. Repeating one
  validates the result and becomes a no-op rather than doing damage.

**Why:** in a world of constant pause/resume and partial failure, the only safe operation
is one you can run again without thinking.

## 7. Separation of what from how

The concepts are defined independently of the mechanisms that realize them. The choice of
multiplexer, store, harness, model, and theming are *hows*, confined to named seams
([`../02-subsystems/`](../02-subsystems/)) — each stating the contract any design must honor —
with the build choices planned in [`../../design/`](../../design/). **Why:** a concept that
cannot be stated without naming a tool has been modeled at the wrong level, and will break when
the tool is swapped.

## 8. Two audiences, always

Every artifact — CLI output, metadata, skills, docs — serves both a **human** and an
**agent**. Human-facing output leans into readability (and visual cues like color);
agent-facing output leans into determinism and parseability. **Why:** both audiences act
on the same state; a form that serves only one forces the other to guess. Where one form
cannot serve both, the tool offers both — and, importantly, the **human is the default
audience** unless the caller declares itself an agent (`../02-subsystems/07-human-shell.md`).

## 9. Scope and working directory are explicit and bounded

Every agent session is started at a **specific scope** (what it is responsible for) and a
**specific working directory** (where it operates and from which it loads context). A
session does not silently widen either. **Why:** an unbounded session is an unfocused one;
bounding both axes is how placement and focus (§1) become operational.

## 10. Teaching and learning flow both ways

The senior personas teach and the junior personas learn — and learning flows back up. A
senior persona may be surprised by something a junior discovered and, through that, decide
a skill, a persona, or the workspace itself should improve. **Why:** the people (and
agents) closest to the work see things their supervisors cannot; capturing that is a
primary source of compounding (§12, `../01-concepts/04-reflection-and-evolution.md`).

## 11. Provenance is recorded

Durable outputs and decisions carry their **lineage**: who (which persona) created them,
in what working directory, from what session, why, and from what prior inputs. **Why:**
months later, the question is always "where did this come from and can I trust it?" —
lineage is what lets a human or agent answer it, trace a result back to its source, and
catch an error at its root (`../01-concepts/00-domain-model.md`, artifacts).

## 12. Be economical with context and tokens

Context is built deliberately and token usage is a real cost. Wherever possible, build
context from **stable, append-only artifacts in a deterministic order**, so sessions at
the same scope can share token caches and context grows by accretion rather than churn.
Prefer immutability and appending over rewriting unless rewriting is genuinely necessary.
**Why:** wasted tokens are wasted attention and money; deterministic, append-oriented
context is the concrete lever (`../01-concepts/05-context-loading.md`).

## 13. The system compounds

Ward improves through use. Reflection — on a cadence and at scope boundaries — turns
accumulated experience and the teaching loop into better skills, tooling, personas, and
improvements to Ward itself. **Why:** a tool used daily should pay back the investment of
using it; a months-old workspace should be visibly better tooled than a fresh one.

## 14. Ward and the workspace evolve independently

Ward (the CLI) ships on its own timeline; a workspace is created by some version and then
persists. Ward must recognize which version created a workspace and **update/migrate** it
forward — structure, skills, and other artifacts — with a reconciliation path when the
workspace has diverged from the defaults. **Why:** workspaces are long-lived and
customized; they must keep working as the platform moves without being clobbered
(`../01-concepts/04-reflection-and-evolution.md`).

## 15. The workspace is versionable and recoverable

The workspace is itself tracked (as a git repository) with a thoughtful ignore policy:
artifacts worth keeping are tracked; transient or regenerable ones are not. **Why:** a
human must be able to roll back if something is corrupted, without losing durable state.

## 16. Prefer recorded state over live state

Live process state (a running terminal, an attached session) is convenient but fragile.
The source of truth is what is **recorded**, because only the recording survives a reboot.
Live state is a cache over the record, never the other way around. **Why:** see §3 — the
record is the only thing that is still there after the lights go out.

## 17. No lost updates

Many agents and sessions write to the workspace at once — multiple personas at one scope is
normal (`../01-concepts/00-domain-model.md`) — and no concurrent writer may silently clobber another's
update. Three biases make this safe: **derive shared state rather than store it** (a parent's
status is a query over its children, not a maintained field — see `../01-concepts/00-domain-model.md`),
**append rather than rewrite** (each writer adds its own entry), and **one owner per mutable
record** (others read it, or request a change, rather than writing it). The unavoidable shared
writes are **serialized** so none is lost. **Why:** a lost update is silent corruption — the
worst kind, because nothing announces it — and the workspace is the source of truth a reboot
restores from (§16). (Mechanism: `../02-subsystems/00-metadata-store.md`.)

## 18. Outward or irreversible actions require explicit authority

Local, reversible actions — create a worktree, open a room, write an artifact, commit to a
task branch — agents take autonomously. A small, named set of **gated actions** that are
**outward-facing or hard to undo** — merging a PR or pushing to a main line, creating or
commenting on a remote work item, deleting a worktree or branch with unmerged work — requires
the **human**, or a scope to whom the human has **explicitly** delegated that specific
authority. **Why:** these are exactly the irreversible, outward-facing mistakes the system
exists to prevent (the never-merge-to-main rule, `../01-concepts/03-work-lifecycle.md`, is the canonical
case); the default for anything crossing the local↔remote boundary or destroying work is
"ask," not "assume." The rule of thumb: **local + reversible = autonomous; outward or
irreversible = gated.**

## Canonical home for

- **The cross-cutting invariants §1–§18.** Every concept and seam honors these; a slice cites a
  principle by number (e.g. "§17, no lost updates") rather than restating it. The *why* on each
  is what lets a reader apply it to a case it does not literally name.

## Open questions

- None specific. Boundary-drift watches (what/why vs. how creep; intent-file granularity) are
  cross-cutting and live in [`open-questions.md`](open-questions.md).
