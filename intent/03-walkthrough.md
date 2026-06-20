# End-to-End Walkthrough

> **Layer:** intent · walkthrough (optional). One scenario threaded through the concepts and seams.
> **Status:** living.

One concrete scenario threaded through the whole model, naming the **records written** at each
step. This is **illustrative, not normative**: it deliberately names mechanisms (so it spans
intent and design) and exists to make the model concrete and to surface gaps. Where it conflicts
with an intent slice, the intent slice wins.

> **Scenario.** A human, on their personal workspace, adds a small feature to a shared service —
> *"export meal plans as CSV"* — touching one repository, `meal-planner`.

## 0. Cold open — the workspace

The workspace already exists, tracked as a git repository (`00-foundation/01-principles.md` §15),
knowing one repository `meal-planner` whose canonical main checkout is kept current on a cadence
(`01-concepts/03-work-lifecycle.md`, refresh). It carries a **version stamp**
(`01-concepts/04-reflection-and-evolution.md`). The **house supervisor** persona can already
answer "what's in flight?" by *deriving* status across projects
(`01-concepts/00-domain-model.md`, status) — right now, nothing.

## 1. Open a project — floor 1

The human starts a project, *meal-plan-exports*. It is given identity **slug + code `1`** (its
floor number, `01-concepts/00-domain-model.md`). An **attending** persona owns its outcome and a
**charge nurse** tracks its status (`01-concepts/01-scopes-and-personas.md`).

**Records written:** a *project record* on floor `1` (type from the document catalog,
`02-subsystems/00-metadata-store.md`); a *session log* entry as the human opens a project-scope
session (`01-concepts/02-sessions-and-lifecycle.md`), capturing persona, working directory (the
workspace root, for breadth), model, and **harness handle**.

> *Lightweight variant:* for a one-off, the human could skip the project and open the task
> directly under the workspace — levels are elided, not faked (`01-concepts/00-domain-model.md`).

## 2. Open a task

Under floor `1`, the human opens a task *csv-export*, **local-only** for now
(`01-concepts/03-work-lifecycle.md`). A **resident** persona owns it. The task record captures its
scope, success criteria ("a CSV endpoint, tested, merged"), and that it touches `meal-planner`.

**Records written:** a *task record* with its identity and recorded intent; a *session log* entry
for the resident's task-scope session.

## 3. Create a worktree (setup hooks fire)

The resident creates a worktree off `meal-planner`'s refreshed main — branch `csv-export`. Its
**idempotent setup hooks** run (`../design/lifecycle-hooks.md`): install dependencies, apply the
worktree's **accent color** so its windows are recognizable (`02-subsystems/05-visual-theming.md`).
Because the work is never committed to main directly, this branch is the only path to the main
line (`01-concepts/03-work-lifecycle.md`, never-merge-to-main).

**Records written:** the *worktree* registered against the task (natural key: repo + branch); a
record (or marker) that each setup hook is satisfied, so a later resume is a no-op.

## 4. Brief and open a room — 1A1

The resident writes a **brief** — the artifact that conjures and orients the hands-on agent: what
the room is for, where it operates (the worktree directory), what "done" means
(`01-concepts/00-domain-model.md`, briefs). It opens **room `1A1`** (floor 1, first room) on the
worktree and **dispatches** the brief down into it (`01-concepts/01-scopes-and-personas.md`). The
resident then **detaches** and arms a **wake**: "notify me when `1A1` reports done"
(`02-subsystems/02-messaging-coordination.md`) — it does not sit blocked.

**Records written:** a *brief artifact* with provenance (which persona, working dir, session,
why); the *room record* `1A1` (active, on the worktree); the *dispatch record*; the *wake
condition* against `1A1`'s identity; a *session log* entry for the room's first session.

## 5. Deep work in the room

In room `1A1`, a **medical student** persona does the actual work in the worktree's own working
directory, loading *that* directory's `AGENTS.md` context and skills
(`01-concepts/05-context-loading.md`) — its whole context spent on the code, not the project. It
writes the endpoint, adds tests, and may produce its own **artifacts** (a decision note, a data
sample) that persist beyond the session.

**Records written:** appended *session log* entries as work proceeds; any *artifacts* the room
creates, each with provenance; commits on the `csv-export` branch (in the repo, not the
metadata store).

## 6. Report up, evaluate, iterate

The room reports **done** upward. This **satisfies the wake**, so the detached resident is
nudged back (`02-subsystems/02-messaging-coordination.md`). The resident evaluates the result
against the bar; suppose it asks for clearer error handling. It dispatches the revision back into
`1A1` (still the same room, `01-concepts/01-scopes-and-personas.md`) and detaches again. The room
revises and reports done; the resident is satisfied.

**Records written:** *report* and updated *session log*; a re-armed *wake*; on acceptance, `1A1`'s
record moves toward closed.

## 7. Present to the attending; open the PR

The resident presents the task to the **attending** for final approval
(`01-concepts/01-scopes-and-personas.md`). Opening the PR is a **gated action** — outward-facing —
so it goes out with the human's (or delegated) authority (`00-foundation/01-principles.md` §18).
Anything in the PR description is **re-authored for the remote audience**, stripped of local
paths, notes, and **persona names** (`02-subsystems/06-remote-provider.md`, privacy translation).
The task becomes **remote-linked**; identity is unchanged (`01-concepts/03-work-lifecycle.md`).

**Records written:** the task's *remote link* (an attribute, not its identity); a *PR-tracking*
entry (status: open).

## 8. Drive the PR to merge; keep current

Ward tracks the PR and can answer "what's left to complete this task?" at any moment
(`01-concepts/03-work-lifecycle.md`). While it is open, main may move, so the worktree is
**rebased** onto the refreshed main line (`01-concepts/03-work-lifecycle.md`, rebase). Review
comes back approved; **merging** is again a gated action taken with authority.

**Records written:** updated *PR-tracking* status (open → approved → merged); rebase reflected in
the worktree record.

## 9. Close the task — disposition, cleanup, reflect

With the PR merged, the resident closes the task (`01-concepts/03-work-lifecycle.md`):

1. **Disposition artifacts.** Decide if any room artifact deserves a wider home — committed into
   the repo, posted to the issue, or promoted to a floor-`1` artifact — each **re-authored, not
   copied** across the boundary (`01-concepts/00-domain-model.md`).
2. **Close.** The task closes; **closed stays closed** (`01-concepts/02-sessions-and-lifecycle.md`).
   Room `1A1` and its worktree tear down via **idempotent teardown hooks**
   (`../design/lifecycle-hooks.md`); the main checkout is refreshed.
3. **Scope-boundary reflection.** Closing the task triggers a reflection on *that task's arc*
   (`01-concepts/04-reflection-and-evolution.md`, `../design/reflection.md`): it reads the task's
   sessions via their **harness handles**, chunks and distills if needed, and **proposes**
   improvements (a CSV-export skill, a sharper brief template) — asynchronously, without blocking.
   Its **reflection cursor** advances so the next run starts where this one stopped.

**Records written:** artifact disposition decisions; the task and room records marked closed;
teardown-satisfied markers; a *reflection output* (proposals) and an advanced *reflection cursor*.

## 10. Reboot test — does it all come back?

Suppose the machine had rebooted at step 6 (room mid-revision, resident detached). On cold start,
recovery (`01-concepts/02-sessions-and-lifecycle.md`) enumerates sessions, keeps the **open, not
closed** ones, re-attaches each via its **harness handle**, **re-arms the resident's wake** so it
is still notified when `1A1` finishes, and **re-validates** the worktree's setup hooks (no-ops if
satisfied). The human returns to exactly the threads in flight — `1A1` and its waiting resident —
and nothing that was already closed.

---

### What this exercises (and where it would catch a gap)

It threads every seam and every settled decision: floor/room identity, harness handle, derived
status, brief-as-orientation, dispatch/wake with detach, gated outward actions, privacy
translation on *both* the PR text and the committed artifacts, idempotent hooks, scope-boundary
reflection with a cursor, and reboot recovery. If a future change to intent breaks one of these,
re-running this walkthrough on paper is the cheapest way to find it.
