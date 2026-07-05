# Scopes & Personas

> **Layer:** intent · concept. The what & why; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

This file describes the **role model**: who operates at each scope, what each is responsible for,
and how work, information, and learning flow between them. The personas are named after roles in a
hospital ward.

## Role vs. persona — what is fixed, what evolves

A **role** is one of a small, **fixed vocabulary** Ward ships: house supervisor, attending
physician, charge nurse, resident, medical student. A **persona** is a concrete cast member — a
**name** + a **role** + a **disposition**. **Roles are closed; personas are open.** Reflection
(`04-reflection-and-evolution.md`) may **add, modify, retire, or recommend personas**, and **many
personas may share a role** (a hard-nosed charge nurse and an easygoing one are two personas, one
role) — but the role vocabulary itself does not grow at a workspace's whim. The personas are the
opinionated-but-evolvable defaults Ward injects at creation and reconciles on upgrade — the same
pattern Ward applies to everything it ships (`03-work-lifecycle.md`); the roles are the stable frame
they hang on.

**Why roles are fixed — a principled choice, not a limitation.** Three principles pin the
vocabulary:

- **§4, privacy.** Role words are internal machinery that must never reach a remote artifact ("the
  resident asked me to do this"). A **closed** role vocabulary is what lets the privacy gate
  (`../02-subsystems/06-remote-provider.md`) redact them **exhaustively**; a user-extensible role
  set would be an open-ended redaction target that leaks at the first role someone forgot to
  register.
- **§2 + §1, specialization and the prime directive.** Roles map to fixed responsibilities and to
  **model-tier routing** — status roles (supervisor, charge nurse) run a fast model; depth roles run
  a deep one. A fixed set is what lets Ward route models and bound scope deterministically.
- **Context management (the metaphor).** A stable role vocabulary, like floors and rooms, is
  **memorable** — you hold "the resident on `4A12`" in your head with no lookup. Churning roles
  would spend the very attention the system exists to save.

If a workspace's work genuinely needs a role the ward set cannot express, that is a signal to evolve
**Ward's** shipped vocabulary deliberately, with a principled reason — not to let any one workspace
fork it. The same bar applies to every opinion Ward ships.

What follows is the current default cast, with its reasoning. The whole model serves the prime
directive: **keep senior judgment free of detail by delegating detail downward and evaluating what
returns** — and, because the ward is a teaching environment, **let learning flow back up.**

## Scope and working directory: the two axes of a session

A session is bound on two independent axes (`00-domain-model.md`):

- **Scope** — the level in the hierarchy it is responsible for (project / task / room). _What_ it is
  responsible for.
- **Working directory** — where it stands and loads its context from. _Where_ it operates.

The two are chosen independently when a session starts, and together they bound what an agent
attends to. **Why two:** what an agent is responsible for and where it stands are genuinely
different choices — separating them is what lets a project-scope agent read broadly while a room
stays narrow.

How an agent attends — whether it reasons about outcomes and delegates, or does the hands-on work —
is shaped by its **persona**, not by a further axis.

## Personas have names

Each persona has a **name** in addition to a **role**. The name personalizes the agent and makes it
easy to address ("ask the resident on `4A12`"). But the name and role are **internal to the
workspace** and must never appear in remote artifacts (`../00-foundation/01-principles.md` §4): a
commit or PR never says "the resident did this." **Why a name at all:** humans (and agents) reason
better about a named collaborator than an anonymous one; the cost is only that the name must be kept
inside the boundary.

**Names come from a static list, and configuring names + personas is part of workspace setup.** The
human picks (or accepts) the cast when the workspace is created, and can adjust it later (the set is
evolvable, above). **Why a curated list:** a stable, memorable set of names is easier to hold in the
head than ad-hoc or generated ones, and keeps addressing ("the resident on `4A12`") consistent
across sessions.

## The roles

### House supervisor — workspace scope, status across everything

Holds the **status of the whole workspace** — every project and how each is moving — without owning
any one project's outcome and without descending into detail. The workspace's **direction** is the
human's to set (`../00-foundation/00-vision.md`: the workspace is personal to one human); the house
supervisor is the human's counterpart for _awareness and routing_ — pointing work and questions to
the right project, surfacing where things stand across all of them, and **directing a human or agent
to the right session** (see _Flow of work_, below). It is the charge nurse's function raised one
level, from a project to the workspace. After a cold start it anchors the **recovery rounds** —
taking stock of every project and nudging each charge nurse to do the same for its span
(`02-sessions-and-lifecycle.md`). **Why a fast model:** like the charge nurse, the job is status and
routing, not deep reasoning. (Call it "house supervisor," or just "supervisor.")

### Attending physician — project scope, teacher

Owns the outcome of a **project**. Understands deeply what success means and how the tasks fit
together to achieve it. Sets direction and gives the **final approval** that a unit of work is good
to go. Delegates and evaluates; does not do the hands-on work. As a teacher, it **defines the
standards** the project's work is held to and **evolves them** as it notices sessions repeatedly
needing the same correction — feeding those refinements into reflection
(`04-reflection-and-evolution.md`). It raises the standard of everyone beneath it.

### Charge nurse — status across a project's work, teacher

Holds the **status of everything** within a project without doing the work. Pure bookkeeping and
routing: knows which agents are involved in each task, what state each is in, and where to point a
human or agent who needs detail. **Dispatches** work to the right place and **redirects** queries to
where the detail lives — resolving them to the **right session** (see _Flow of work_, below) — but
never descends into detail. During **recovery rounds** it takes stock of its project's re-attached
threads and pending waits and drives them back into good order (`02-sessions-and-lifecycle.md`).
**Why a fast model:** the job is status and routing, not deep reasoning, so it should be fast and
cheap rather than deep. Commonly works shoulder-to-shoulder with the attending and residents (see
"multiple personas per scope").

### Resident — task scope, teacher

Owns the **outcome of a task** on a specific worktree/branch. Responsible for the task being done
well, but **does not do the work itself**. Directs one or more **rooms**: decides what work the room
should do, briefs it, and evaluates whether the output meets the bar. If not, tells the room how to
change it — and stays at its scope while the room revises. When the task is done to the resident's
satisfaction, presents it to the attending for final approval.

### Room and medical students — anchor scope, learners

A **room** is scoped to its anchor — most commonly a worktree; a workdir for deep work that changes
no repository (`00-domain-model.md`) — and is where **deep work happens**. Within it, hands-on
agents (medical students) do the detailed work under the resident's direction, in the anchor's own
working directory with its own specialized context. **Why guarded:** the room is the scope most
protected for focused context; the resident guides it from outside so the room can spend its whole
context on the work.

> The roles above are the current model. The workspace-wide coordinator (house supervisor) and the
> charge nurse's per-project span are now settled; the remaining soft spot — whether exactly one
> persona "owns" a shared scope while others assist — is tracked in
> `../00-foundation/open-questions.md`.

## Why senior roles delegate rather than do

A concrete failure mode this prevents: a resident that takes on the detailed work itself, consuming
80% of its context window, and can no longer think clearly about _what outcome we want_ and _how to
get the room to produce it_. By delegating deep work to a room and validating the result, the
resident keeps its context free for judgment. The same logic applies at every boundary —
specialization (`../00-foundation/01-principles.md` §2) made concrete: depth lives where depth
belongs.

## Teaching and learning — and how it feeds the system

The ward is a **teaching environment**. Attending, charge nurse, and resident are **teachers**; the
medical students in a room are **learners**. But learning is **not one-directional**:

- A resident may be **surprised** by something a medical student discovered or worked out.
- Through that surprise, the resident learns — and may decide that a **skill**, a **persona
  document**, or the **workspace itself** should improve.
- That decision becomes input to reflection (`04-reflection-and-evolution.md`).

**What is learned is broad, and any teaching scope can capture it.** It is not only "this code was
wrong." Learning can be about **how to interact** with residents and students, **how to work within
the ward system** itself, or **how to make future sessions at any scope go better** — sharper
briefs, clearer standards, missing tooling. And **defining and evolving standards is not the
attending's job alone:** a **resident** that keeps correcting the same thing in its rooms evolves
the standard for _that_ work the same way and feeds it to reflection. Any teaching scope that
notices a pattern can turn it into a durable improvement.

So teaching and learning is also the act of the **system learning about itself**. **Why it
matters:** every supervisory interaction is a potential source of compounding, not just the
scheduled reflection pass.

## Flow of work and information

The hierarchy is a two-way communication structure (concepts in `00-domain-model.md`):

- **Downward — dispatch.** Any scope hands work or context to something within it and sees where it
  landed. The charge nurse dispatches across tasks; a resident dispatches into rooms (with a brief).
- **Upward — report.** A scope reports status to the scope that contains it. A room tells its
  resident "done"; a resident updates the charge nurse; the charge nurse reflects current status
  without holding detail.
- **Return — wake.** A senior scope can wait on a junior one, or detach and be woken when it
  finishes, rather than blocking (`02-sessions-and-lifecycle.md`).

**Routing resolves to a session.** A large part of what the **house supervisor** and **charge
nurse** do is point a human or agent to the _right session_ — resolving "who's handling X?" to the
session that holds it. For an **agent**, that routing is a **dispatch**
(`../02-subsystems/02-messaging-coordination.md`). For the **human**, it is handing over the
**command to switch to — attach to — that session**, so they can follow along or interact
(`../02-subsystems/01-session-multiplexer.md`, which keeps sessions attachable). **Why:** finding
the right window among a dozen is exactly the human-side context-management problem the status
personas exist to solve — and an individual session, which knows its neighbors but not the whole
workspace, often cannot resolve a target on its own, so it addresses **by intent** to its scope's
status persona and lets that persona route. Direct addressing still holds when the sender already
knows the target; routing through the status persona is the path when it does not (mechanism:
`../02-subsystems/02-messaging-coordination.md`).

Ward makes both directions **deterministic and consistent**: one well-defined way to dispatch into a
scope, one well-defined way for it to report back (mechanism:
`../02-subsystems/02-messaging-coordination.md`).

## Multiple personas at one scope

It is common — not exceptional — for **several personas to operate at the same scope**. The charge
nurse, attending, and residents collaborate closely around a project's work. The model treats this
as normal: a scope is a place where one or more personas coordinate, not a slot for a single agent.

## Forking for side quests

When work in a scope uncovers a sub-problem that would derail it, the scope **forks**:

1. A new context inherits the relevant context of its origin.
2. The fork resolves the side quest in isolation — possibly at a **different scope and/or persona**
   if that better fits the sub-problem.
3. The fork reports back a clean result — "done, to your satisfaction."
4. The origin's context stays focused; it simply learns the side quest is resolved.

A fork inherits its origin's context in one of **two modes**:

- **Exact-clone** — branch the origin's _actual_ session state, so the fork begins knowing
  everything the origin knew. High fidelity, but **harness-dependent**: available only where the
  harness can fork a session (`../02-subsystems/03-agent-harness.md`).
- **Brief (distilled)** — open a _fresh_ session seeded by a **brief** that compacts the relevant
  context (`00-domain-model.md`). Lower fidelity but **harness-neutral** and more focused, since the
  brief carries only what the side quest needs.

Both share the same return contract. The brief mode is the universal baseline; exact-clone is an
optimization where the harness offers it. (Which to lean on, and which ships first, is open —
`../00-foundation/open-questions.md`.)

Forking exists to protect context; it should be cheap to start and cheap to return from. It is
distinct from dispatch (ongoing work handed _down_ the hierarchy); a fork is a bounded detour that
returns its result to its origin.

## Per-scope configuration

Several things are configurable **per scope** (settable at workspace, project, task, or room level,
narrower overriding broader):

- **Persona** — which role (and name) shapes the agent.
- **Model / thinking depth** — fast and shallow for bookkeeping; deep and high-thinking for hard
  work.
- **Agent harness** — which agent runtime backs the session.
- **Working directory** — where the session runs and loads context from.

These are _what_ can vary per scope; the mechanism that applies them is a _how_
([`../02-subsystems/`](../02-subsystems/), [`../../design/`](../../design/)).

## Canonical home for

- **The role model** — house supervisor, attending physician, charge nurse, resident, and
  room/medical students — what each owns and why seniors _delegate and evaluate_ rather than do.
- **Roles vs. personas.** **Roles are a fixed, closed vocabulary** (the five ward roles); **personas
  are the workspace's opinionated, evolvable cast** (name + role + disposition) — injected at setup
  (names from a static list), then living artifacts reflection can add/modify/retire/recommend.
  **Many personas may share one role.** The _why roles are fixed_ argument (§4 exhaustive redaction,
  §2/§1 model-routing, memorability) lives here.
- **Standards** — that the attending (and residents) **define and evolve** them, feeding reflection.
- **Routing to a session** — the supervisor/charge-nurse job of resolving a human or agent to the
  right session (agent → dispatch; human → an attach/switch command).
- **The teaching-and-learning loop** (and that learning — broad, not just about code — flows back
  _up_ into reflection).
- **Forking for side quests** as a role-level act, and **multiple personas at one scope**.
- **Per-scope configuration** — what can vary per scope (persona, model/depth, harness, working
  directory).

The two axes (scope, working directory) are defined in [`00-domain-model.md`](00-domain-model.md);
the persona-names-are-internal rule is
[`../00-foundation/01-principles.md`](../00-foundation/01-principles.md) §4 — this slice links
rather than restating them.

## Left to implementation

- **The static persona-name list**, and how **workspace setup** presents and applies the default
  cast (names + roles). _Bound:_ a stable, curated list, kept evolvable and reconciled on upgrade
  like every other artifact Ward ships — the same machinery as [`design/`](../../design/).

## Open questions

- **Persona ↔ scope cardinality.** Multiple personas commonly share a scope. Does exactly one
  persona _own_ a scope while others assist, or is it flat?
- **Fork mode first.** Which inheritance mode ships first — harness-neutral _distilled brief_ or
  _exact-clone_ (also tracked under
  [`../02-subsystems/03-agent-harness.md`](../02-subsystems/03-agent-harness.md)).
