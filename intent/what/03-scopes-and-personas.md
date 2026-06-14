# Scopes & Personas

This file describes the **role model**: who operates at each scope, what each is
responsible for, and how work, information, and learning flow between them. The personas
are named after roles in a hospital ward. The set is **open and configurable** — personas
can be added, changed, or retired; what follows is the current intent, with its reasoning,
not a closed list.

The whole model serves the prime directive: **keep senior judgment free of detail by
delegating detail downward and evaluating what returns** — and, because the ward is a
teaching environment, **let learning flow back up.**

## Scope and working directory: the two axes of a session

A session is bound on two independent axes (`02-domain-model.md`):

- **Scope** — the level in the hierarchy it is responsible for (project / task / room).
  *What* it is responsible for.
- **Working directory** — where it stands and loads its context from. *Where* it operates.

The two are chosen independently when a session starts, and together they bound what an
agent attends to. **Why two:** what an agent is responsible for and where it stands are
genuinely different choices — separating them is what lets a project-scope agent read
broadly while a room stays narrow.

How an agent attends — whether it reasons about outcomes and delegates, or does the
hands-on work — is shaped by its **persona**, not by a further axis.

## Personas have names

Each persona has a **name** in addition to a **role**. The name personalizes the agent and
makes it easy to address ("ask the resident on A3"). But the name and role are **internal
to the workspace** and must never appear in remote artifacts (`01-principles.md` §4): a
commit or PR never says "the resident did this." **Why a name at all:** humans (and agents)
reason better about a named collaborator than an anonymous one; the cost is only that the
name must be kept inside the boundary.

## The roles

### House supervisor — workspace scope, status across everything

Holds the **status of the whole workspace** — every project and how each is moving — without
owning any one project's outcome and without descending into detail. The workspace's
**direction** is the human's to set (`00-vision.md`: the workspace is personal to one human);
the house supervisor is the human's counterpart for *awareness and routing* — pointing work
and questions to the right project and surfacing where things stand across all of them. It is
the charge nurse's function raised one level, from a project to the workspace. **Why a fast
model:** like the charge nurse, the job is status and routing, not deep reasoning. (Call it
"house supervisor," or just "supervisor.")

### Attending physician — project scope, teacher

Owns the outcome of a **project**. Understands deeply what success means and how the tasks
fit together to achieve it. Sets direction and gives the **final approval** that a unit of
work is good to go. Delegates and evaluates; does not do the hands-on work. As a teacher,
raises the standard of everyone beneath it.

### Charge nurse — status across a project's work, teacher

Holds the **status of everything** within a project without doing the work. Pure
bookkeeping and routing: knows which agents are involved in each task, what state each is
in, and where to point a human or agent who needs detail. **Dispatches** work to the right
place and **redirects** queries to where the detail lives — but never descends into detail.
**Why a fast model:** the job is status and routing, not deep reasoning, so it should be
fast and cheap rather than deep. Commonly works shoulder-to-shoulder with the attending and
residents (see "multiple personas per scope").

### Resident — task scope, teacher

Owns the **outcome of a task** on a specific worktree/branch. Responsible for the task
being done well, but **does not do the work itself**. Directs one or more **rooms**: decides
what work the room should do, briefs it, and evaluates whether the output meets the bar. If
not, tells the room how to change it — and stays at its scope while the room revises. When
the task is done to the resident's satisfaction, presents it to the attending for final
approval.

### Room and medical students — worktree scope, learners

A **room** is scoped to a worktree and is where **deep work happens**. Within it, hands-on
agents (medical students) do the detailed work under the resident's direction, in the
worktree's own working directory with its own specialized context. **Why guarded:** the room
is the scope most protected for focused context; the resident guides it from outside so the
room can spend its whole context on the work.

> The roles above are the current model. The workspace-wide coordinator (house supervisor)
> and the charge nurse's per-project span are now settled; the remaining soft spot — whether
> exactly one persona "owns" a shared scope while others assist — is tracked in
> `08-open-questions.md`.

## Why senior roles delegate rather than do

A concrete failure mode this prevents: a resident that takes on the detailed work itself,
consuming 80% of its context window, and can no longer think clearly about *what outcome we
want* and *how to get the room to produce it*. By delegating deep work to a room and
validating the result, the resident keeps its context free for judgment. The same logic
applies at every boundary — specialization (`01-principles.md` §2) made concrete: depth
lives where depth belongs.

## Teaching and learning — and how it feeds the system

The ward is a **teaching environment**. Attending, charge nurse, and resident are
**teachers**; the medical students in a room are **learners**. But learning is **not
one-directional**:

- A resident may be **surprised** by something a medical student discovered or worked out.
- Through that surprise, the resident learns — and may decide that a **skill**, a **persona
  document**, or the **workspace itself** should improve.
- That decision becomes input to reflection (`06-reflection-and-evolution.md`).

So teaching and learning is also the act of the **system learning about itself**. **Why it
matters:** every supervisory interaction is a potential source of compounding, not just the
scheduled reflection pass.

## Flow of work and information

The hierarchy is a two-way communication structure (concepts in `02-domain-model.md`):

- **Downward — dispatch.** Any scope hands work or context to something within it and sees
  where it landed. The charge nurse dispatches across tasks; a resident dispatches into
  rooms (with a brief).
- **Upward — report.** A scope reports status to the scope that contains it. A room tells
  its resident "done"; a resident updates the charge nurse; the charge nurse reflects
  current status without holding detail.
- **Return — wake.** A senior scope can wait on a junior one, or detach and be woken when
  it finishes, rather than blocking (`04-sessions-and-lifecycle.md`).

Ward makes both directions **deterministic and consistent**: one well-defined way to
dispatch into a scope, one well-defined way for it to report back (mechanism:
`../how/messaging-dispatch-wake.md`).

## Multiple personas at one scope

It is common — not exceptional — for **several personas to operate at the same scope**. The
charge nurse, attending, and residents collaborate closely around a project's work. The
model treats this as normal: a scope is a place where one or more personas coordinate, not a
slot for a single agent.

## Forking for side quests

When work in a scope uncovers a sub-problem that would derail it, the scope **forks**:

1. A new context inherits the relevant context of its origin.
2. The fork resolves the side quest in isolation — possibly at a **different scope and/or
   persona** if that better fits the sub-problem.
3. The fork reports back a clean result — "done, to your satisfaction."
4. The origin's context stays focused; it simply learns the side quest is resolved.

A fork inherits its origin's context in one of **two modes**:

- **Exact-clone** — branch the origin's *actual* session state, so the fork begins knowing
  everything the origin knew. High fidelity, but **harness-dependent**: available only where
  the harness can fork a session (`07-subsystem-seams.md`).
- **Brief (distilled)** — open a *fresh* session seeded by a **brief** that compacts the
  relevant context (`02-domain-model.md`). Lower fidelity but **harness-neutral** and more
  focused, since the brief carries only what the side quest needs.

Both share the same return contract. The brief mode is the universal baseline; exact-clone is
an optimization where the harness offers it. (Which to lean on, and which ships first, is open
— `08-open-questions.md`.)

Forking exists to protect context; it should be cheap to start and cheap to return from. It
is distinct from dispatch (ongoing work handed *down* the hierarchy); a fork is a bounded
detour that returns its result to its origin.

## Per-scope configuration

Several things are configurable **per scope** (settable at workspace, project, task, or room
level, narrower overriding broader):

- **Persona** — which role (and name) shapes the agent.
- **Model / thinking depth** — fast and shallow for bookkeeping; deep and high-thinking for
  hard work.
- **Agent harness** — which agent runtime backs the session.
- **Working directory** — where the session runs and loads context from.

These are *what* can vary per scope; the mechanism that applies them is a *how*
(`07-subsystem-seams.md`, `../how/`).
