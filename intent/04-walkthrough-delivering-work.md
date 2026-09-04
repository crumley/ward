# Walkthrough: Delivering Work

> **Layer:** intent · walkthrough (optional). The second of two scenarios; the workspace it runs in
> was stood up in [`03-walkthrough-getting-started.md`](03-walkthrough-getting-started.md).
> **Status:** living.

One unit of work threaded end to end, naming the **records written** at each step. This is
**illustrative, not normative**: it deliberately names mechanisms (so it spans intent and design)
and exists to make the model concrete and to surface gaps. Where it conflicts with an intent slice,
the intent slice wins.

It is deliberately **the minimum spine** — the smallest path that still delivers work: a project, a
task, one worktree, one session, a pull request, a close. The machinery it does not use — rooms,
briefs and dispatch, wakes and detach, the full persona cast — is real and specified; _The growth
path_ at the end names each and where it lives. **Why walk the spine and not the whole cast:** the
hierarchy is built to scale down as gracefully as it scales up (`00-foundation/00-vision.md`), and a
walkthrough that only showed the heavyweight shape would misrepresent levels as required when they
are **elided, not faked** (`01-concepts/00-domain-model.md`).

> **Scenario.** Continuing in the workspace from
> [`03-walkthrough-getting-started.md`](03-walkthrough-getting-started.md), the human adds a small
> feature to the `ward` repository — _machine-readable output for one command_ — through one
> worktree and one pull request.

## 0. Where we are

A healthy workspace, tracked in git (`00-foundation/01-principles.md` §15), carrying its version
stamp (`01-concepts/06-workspace-lifecycle.md`) and knowing one repository, `ward`, whose canonical
main checkout is kept current on a cadence (`01-concepts/03-work-lifecycle.md`, refresh). Nothing is
in flight.

## 1. Open a project — floor 1

The human starts a project, _agent-facing output_: success is not "are these commands done" but "can
an agent drive Ward without parsing prose written for a human" — which is what makes it a
**project** rather than a loose pile of tasks (`01-concepts/00-domain-model.md`, the existence
test). It takes identity **slug + code `1`** — its floor number, monotonic and never reused.

In this minimal cast the **human** owns the project's direction and holds its gated authority
(`01-concepts/01-scopes-and-personas.md`, the human). The attending and charge nurse personas that
would normally own the outcome and track status are **elided** — there is one task and one human
watching it, so neither has earned its keep yet (_The growth path_, below).

**Records written:** a _project record_ on floor `1` (type from the document catalog,
`02-subsystems/00-metadata-store.md`).

> _Lightweight variant:_ for a one-off, the human could skip the project and open the task directly
> under the workspace — the **task** is the universal quantum, and levels are elided, not faked
> (`01-concepts/00-domain-model.md`).

## 2. Open a task

Under floor `1`, the human opens a task _json-output_, **local-only** for now
(`01-concepts/03-work-lifecycle.md`). Its address **composes its floor and its room** — `f1t1` — and
the bare room addresses it for every later operation while it stays unique among the workspace's
open tasks (`01-concepts/00-domain-model.md`, Identity). A **resident** persona owns it. The task
record captures its scope, its success criteria, and that it touches `ward`. Opening it makes it
`active` — there is no separate "drafted" state (`01-concepts/03-work-lifecycle.md`, task states).

**Records written:** a _task record_ with its identity and recorded intent; a _session log_ entry
for the resident's task-scope session, capturing persona, working directory, model, and **harness
handle** (`01-concepts/02-sessions-and-lifecycle.md`).

## 3. Create a worktree (setup hooks fire)

The resident creates a worktree off `ward`'s refreshed main line — branch `json-output`, disposition
**`deliverable`**, fixed at creation (`01-concepts/00-domain-model.md`, Anchor). Its **idempotent
setup hooks** run (`design/`): install dependencies, apply the worktree's **accent color and type
glyph**, recorded at creation so the window stays recognizable across reboots
(`02-subsystems/05-visual-theming.md`) — and so the human can later say "the blue one" and have an
agent resolve it. Because work is never committed to main directly, this branch is the only path to
the main line (`01-concepts/03-work-lifecycle.md`, never-merge-to-main).

**Records written:** the _worktree_ registered against the task (natural key: repo + branch, with
its disposition); a record that each setup hook is satisfied, so a later resume is a no-op.

## 4. Do the work — one session on the anchor

The resident works **directly on the worktree**: with directing and doing not yet separated, no room
has earned its keep, and the session **acts directly** as the anchor's occupant
(`01-concepts/00-domain-model.md`, occupancy). Elision changes ceremony, never semantics — the
anchor still has **at most one occupant**, and is still **written only through that occupant**.

The session runs in the worktree's own working directory, loading _that_ directory's `AGENTS.md`
context and skills (`01-concepts/05-context-loading.md`) rather than the workspace's — its whole
context spent on the code. It writes the output mode, adds tests, and may produce **artifacts** (a
decision note, a sample of the new output) that persist beyond it, each with provenance
(`01-concepts/00-domain-model.md`, artifacts).

**Records written:** appended _session log_ entries as work proceeds — including the session's
**purpose** and, where the harness exposes it, the **resources it consumed**
(`01-concepts/02-sessions-and-lifecycle.md`); any _artifacts_ it creates; commits on the
`json-output` branch (in the repo, not the metadata store).

## 5. Open the pull request

The work meets the bar, so it goes out. Opening a PR is a **gated action** — outward-facing — so it
carries the human's (or explicitly delegated) authority (`00-foundation/01-principles.md` §18). Its
description is **re-authored for the remote audience**, stripped of local paths, private notes, and
**persona names and roles**, at the single upstream gate where that translation is enforced
(`02-subsystems/06-remote-provider.md`). The task becomes **remote-linked**; its identity is
unchanged (`01-concepts/03-work-lifecycle.md`).

**Records written:** the task's _remote link_ (an attribute, not its identity); a _PR-tracking_
entry (status: open). The task is now **`in-review`** — derived from the open-PR set, never stored
(`01-concepts/03-work-lifecycle.md`).

## 6. Drive it to merge

Ward tracks the PR's review state and its checks, and can answer "what is left to complete this
task?" at any moment (`01-concepts/03-work-lifecycle.md`). While it is open, main moves, so the
worktree is **rebased** onto the refreshed main line — but only when that is safe: the toil never
mutates an **occupied** anchor, and independently treats **uncommitted changes as occupancy**
whatever the record says (`01-concepts/03-work-lifecycle.md`). Review comes back approved;
**merging** is again a gated action taken with authority.

**Records written:** updated _PR-tracking_ status (open → approved → merged); the rebase reflected
in the worktree record.

## 7. Close the task

With the PR merged, the task closes (`01-concepts/03-work-lifecycle.md`):

1. **Disposition artifacts.** Decide whether any artifact deserves a wider home — committed into the
   repo, posted to the remote item, or promoted to a floor-`1` artifact — each **re-authored for its
   destination, not copied** (`01-concepts/00-domain-model.md`).
2. **Close.** The PR set is **resolved** (every PR merged), so the task may close, with outcome
   **delivered** (`01-concepts/03-work-lifecycle.md`, task states). Its session closes; **closed
   stays closed** (`01-concepts/02-sessions-and-lifecycle.md`). The worktree tears down via
   **idempotent teardown hooks** (`design/`) and the main checkout is refreshed.
3. **Scope-boundary reflection.** Closing triggers a reflection on _that task's arc_
   (`01-concepts/04-reflection-and-evolution.md`): it reads the task's sessions via their **harness
   handles**, distills, and **proposes** improvements — a skill, a sharper default — asynchronously,
   without blocking. Its **reflection cursor** advances so the next run starts where this one
   stopped. Adopting any proposal is a separate, deliberate act — the **adoption boundary** where
   the stable context prefix may be rewritten (`01-concepts/05-context-loading.md`).

**Records written:** artifact disposition decisions; the task record marked closed with outcome
**delivered**; the session closed; teardown-satisfied markers; a _reflection output_ and an advanced
_reflection cursor_.

## 8. Reboot test — does it all come back?

Suppose the machine had rebooted at step 6, with the PR open and the worktree behind main. On cold
start, **recovery** — the `attach` verb (`02-subsystems/07-human-shell.md`) over
`01-concepts/02-sessions-and-lifecycle.md`'s Recovery — enumerates sessions, keeps the **open, not
closed** ones, re-attaches each via its **harness handle** — addressing it by its bare,
workspace-unique id — and **re-validates** the setup hooks of **live** anchors only. It then ends
with **rounds**: the status personas take stock of their spans; in this minimal cast that is the
house supervisor alone, reporting to the human where things stand. The recovery is itself
**recorded** — per-thread outcomes, including any **resume-failed with its cause** — and queues a
**recovery reflection** over the episode (`01-concepts/04-reflection-and-evolution.md`).

The human returns to exactly the thread in flight, told where it stands, and nothing that was
already closed.

## The growth path

Everything above is the spine. What a busier workspace adds, each already specified:

- **Rooms, briefs, and dispatch.** When directing and doing separate, step 4 splits: the resident
  writes a **brief**, opens a **room** on the worktree (which mints the room's first session), and
  **dispatches** the brief into it, while a **medical student** does the hands-on work
  (`01-concepts/00-domain-model.md`, `01-concepts/01-scopes-and-personas.md`).
- **Wakes and detach.** Rather than waiting, the resident arms a **milestone** or **completion**
  wake and detaches, and is nudged back when the condition is met
  (`02-subsystems/02-messaging-coordination.md`).
- **The fuller cast.** An **attending** owning the project's outcome and giving final approval, and
  a **charge nurse** tracking status across its tasks and routing dispatches that do not know their
  target (`01-concepts/01-scopes-and-personas.md`).
- **More anchors.** A **`sandbox`** worktree for work that reads and instruments but never delivers,
  and a **workdir** for deep work that changes no repository (`01-concepts/00-domain-model.md`,
  Anchor).
- **Forks.** A side quest that inherits context, resolves a sub-problem elsewhere, and returns a
  clean result (`01-concepts/00-domain-model.md`).
- **Several repositories and several PRs.** One task spanning multiple worktrees across
  repositories, completing only when the whole PR set resolves (`01-concepts/03-work-lifecycle.md`).
- **The other close.** An **abandoned** close — PRs closed unmerged, artifacts dispositioned anyway,
  reflection fired anyway — gated where it destroys unmerged deliverable work (§18).

## What this exercises (and what it no longer does)

**Exercised here:** the project existence test and floor identity, composed task addresses with the
bare room as a shorthand, worktree disposition and idempotent setup hooks, recorded theming,
elided-room occupancy on an anchor, working-directory-keyed context loading, harness handles with
session purpose and usage, gated outward actions, privacy translation at the single upstream gate,
derived `in-review`, the toil yielding to occupancy and to a dirty tree, the delivered close with
artifact disposition, teardown, scope-boundary reflection with a cursor, and cold-start recovery
with rounds and a recorded episode.

**Deliberately not exercised — the watch-list.** The spine leaves these unchecked by any
walkthrough, so a change to intent that breaks one will not be caught here: **briefs and dispatch
routing** (both direct and via a status persona), **wake arming, firing, and re-arming across a
reboot**, the **room's occupied → free turnover and code reuse**, **status rollup through a
populated project**, **multi-repository PR sets**, **sandbox and workdir anchors**, and **forks**.
_The growth path_ above names where each is specified. Re-running this walkthrough on paper remains
the cheapest way to find a break in what it _does_ cover; the watch-list is the honest accounting of
what it does not.
