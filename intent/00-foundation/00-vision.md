# Vision & Purpose

> **Layer:** intent · foundation (global). The what & why; applies to every slice. **Status:**
> living.

## What Ward is

Ward is a command-line tool and an accompanying toolset that sets up and operates **opinionated,
structured workspaces** in which humans and agents work together on software.

A Ward workspace is **self-sufficient**: at any point in time, a person or an agent can start at the
root of the workspace and, from what is recorded there, understand the full state of all work in
progress — what is underway, which agents are working on it, where each piece stands, and how to
move any of it forward. Moving it forward means picking up an in-flight task, starting a new one, or
closing one out.

For this to hold, the workspace carries both **metadata** (a deterministic, discoverable record of
the state of work) and the **tooling and skills** that make that metadata easy for agents to find
and act on without guesswork.

## The problem it solves

The scarce resource in agent-assisted work is **attention/context**, on both sides:

- An agent has a finite context window. Deep work consumes it. An agent that does the deep work
  itself cannot also think clearly at a high level about outcomes.
- A human, returning to work after an interruption of minutes or weeks, has paged out the state.
  Reconstructing "where was everything?" is expensive and error-prone.
- Work spreads across many repositories, branches, and concurrent threads. Without structure, the
  state lives only in someone's head or in a dozen scattered terminals.

Ward exists to **manage context** so that deep work happens in places designed for deep work,
high-level thinking happens in places designed for high-level thinking, and the boundary between
them is explicit, recorded, and resumable.

> **The prime directive: context management.** Nearly every design choice in Ward serves the goal of
> putting the right work in the right scope, keeping each scope's context focused on what that scope
> is for, and making it cheap to hand work down, report results up, and resume any of it later. When
> a design decision is unclear, ask which option better preserves and focuses context.

Context management has several dimensions, all of which Ward pursues:

- **Placement** — the right work in the right scope.
- **Focus** — each scope spends its context only on what that scope is for.
- **Specialization** — each scope, persona, and agent harness can specialize, and the ones whose job
  is depth are given room to go deep without that depth bleeding into scopes that must stay broad.
- **Economy** — context is built deliberately and token usage is treated as a real cost to be
  managed (see `../01-concepts/05-context-loading.md`).

## The setting: local and personal, working on the shared and remote

A workspace is **local and personal** — it belongs to one human and the agents running on their
machine. Through it, those agents work on **remote repositories** that may be shared with many other
humans and agents elsewhere.

This creates a hard boundary Ward must respect: **local, personal context must not leak into shared,
remote artifacts.** Not local paths. Not private notes. And not the internal machinery of how the
work was produced — for example, the **names and roles of personas are internal** and must never
appear in a commit message, PR, or issue ("the resident asked me to do this" must never be written
to a remote). When we reflect progress outward, the content is composed for people and agents on
_other_ machines who do not share our local context. The translation between _local task_ and
_remote work item_ is a first-class concern, not an afterthought.

## Pause and resume as a baseline assumption

Any thread of work may be **paused** — for an hour, or for weeks. The machine may reboot with a
dozen agent sessions open. Ward assumes work is interrupted constantly and resumed cold. So the
workspace records enough about each thread that a human or agent can return and quickly reconstruct:
what was being done, under **which harness handle** (which harness, which native run), in what state
— and resume exactly there, without re-doing finished work and without burning tokens restarting
things that already completed. Because each harness stores its own session history in its own
format, Ward records this handle for each thread, so any of them can be located again — to resume,
or to reflect.

## The metaphor: a hospital ward

Ward is named for the hospital model, and we lean into it deliberately. A ward has an **attending
physician** who owns outcomes for a service; a **charge nurse** who knows the status of every
patient without doing the procedures; **residents** who own a case and direct the work; and
**medical students** who do hands-on work under supervision. The senior roles preserve their
judgment by _not_ doing the detailed work themselves — they delegate it and evaluate the result.
Just as important: the ward is a **teaching environment**. The senior roles teach, the students
learn, and what is learned flows back up — improving how the ward itself operates. This division of
labor and this teaching loop are the heart of Ward's strategy. (Full role model:
`../01-concepts/01-scopes-and-personas.md`.)

The metaphor also pays off in the **everyday vocabulary**: rooms and floors map onto naming and
identity that humans can keep in their heads (`../01-concepts/00-domain-model.md`), which is itself
a context-management win.

## A workspace that compounds — on a cadence _and_ at scope boundaries

A workspace should get **better the longer it is used**. As humans and agents work in it, patterns
emerge: tools that help, skills that recur, friction that repeats. Compounding happens two ways, and
Ward pursues both:

- **On a cadence** — regular reflection over the interval since the last reflection.
- **At scope boundaries** — when a scope reaches a natural close (a project finishes, a task
  closes), reflect over _that scope's_ arc specifically: what went well, what didn't, what to
  improve, change, create, or do differently next time.

These are different _kinds_ of reflection with different goals, and that difference is itself an
application of the prime directive: a reflection focused on a specific scope and interest yields
**focused, actionable** improvements, where an undirected reflection over everything yields only
**generalized** ones. So reflection is not one fixed routine — it is a family of goal-directed
routines that is itself evolvable (see `../01-concepts/04-reflection-and-evolution.md`). The
teaching loop feeds all of them: a surprise learned in a room can become an improvement to a skill
or a persona.

## Weight: from one-off to long-lived

Not all work is heavy. Ward must support **ad hoc, lightweight tasks and projects** — quick, one-off
work that should not pay the ceremony of long-lived structure — as well as durable, long-running
efforts. The structure scales down as readily as it scales up; a throwaway task should be cheap to
start and cheap to discard.

## Non-goals

- **Not a hosted/multi-user service.** A workspace is local and personal. Collaboration with others
  happens through the remote repositories, not through a shared Ward.
- **Not a replacement for git, the forge, or the agent harness.** Ward orchestrates these; it does
  not reimplement them.
- **Not a single-agent assistant.** Ward's reason for existing is coordinating _multiple_ agents at
  different scopes. A design that only made sense for one agent doing everything would be missing
  the point.
- **Not locked to today's tools.** No concept in Ward depends on a particular multiplexer, store,
  harness, or model being the implementation. Those are swappable (see
  [`../02-subsystems/`](../02-subsystems/)).

## Canonical home for

- **The prime directive — context management.** The single lens every other slice serves; when a
  choice is unclear, the tie-breaker is "which option better preserves and focuses context?"
  Principles elaborate it; concepts apply it; everything links here for the _why_.
- **The hospital-ward metaphor.** Floors/rooms, the senior-delegates-and-evaluates role model, and
  the teaching environment — the source the vocabulary and roles draw on
  ([`../01-concepts/01-scopes-and-personas.md`](../01-concepts/01-scopes-and-personas.md)).
- **The problem, the setting (local↔remote), the baseline (pause/resume), and the non-goals.**

## Open questions

- None specific to vision. Cross-cutting tensions live in [`open-questions.md`](open-questions.md).
