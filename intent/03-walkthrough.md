# End-to-End Walkthrough

> **Layer:** intent · walkthrough (optional). One scenario threaded through the concepts and seams.
> **Status:** living.

One concrete scenario threaded through the whole model, naming the **records written** at each step.
This is **illustrative, not normative**: it deliberately names mechanisms (so it spans intent and
design) and exists to make the model concrete and to surface gaps. Where it conflicts with an intent
slice, the intent slice wins.

> **Scenario.** A human, on their personal workspace, adds a small feature to a shared service —
> _"export meal plans as CSV"_ — touching one repository, `meal-planner`.

## 0. Cold open — the workspace

The workspace already exists, tracked as a git repository (`00-foundation/01-principles.md` §15),
knowing one repository `meal-planner` whose canonical main checkout is kept current on a cadence
(`01-concepts/03-work-lifecycle.md`, refresh). It carries a **version stamp**
(`01-concepts/04-reflection-and-evolution.md`). The **house supervisor** persona
(`01-concepts/01-scopes-and-personas.md`) can already answer "what's in flight?" by _deriving_
status across projects (`01-concepts/00-domain-model.md`, status) — right now, nothing.

## 1. Open a project — floor 1

The human starts a project, _meal-plan-exports_. It is given identity **slug + code `1`** (its floor
number, `01-concepts/00-domain-model.md`). An **attending** persona owns its outcome and a **charge
nurse** tracks its status (`01-concepts/01-scopes-and-personas.md`).

**Records written:** a _project record_ on floor `1` (type from the document catalog,
`02-subsystems/00-metadata-store.md`); a _session log_ entry as the human opens the attending's
project-scope session — sessions are agent episodes the human opens and attaches to
(`01-concepts/02-sessions-and-lifecycle.md`) — capturing persona, working directory (the workspace
root, for breadth), model, and **harness handle**.

> _Lightweight variant:_ for a one-off, the human could skip the project and open the task directly
> under the workspace — levels are elided, not faked (`01-concepts/00-domain-model.md`).

## 2. Open a task

Under floor `1`, the human opens a task _csv-export_, **local-only** for now
(`01-concepts/03-work-lifecycle.md`). A **resident** persona owns it. The task record captures its
scope, success criteria ("a CSV endpoint, tested, merged"), and that it touches `meal-planner`.

**Records written:** a _task record_ with its identity and recorded intent; a _session log_ entry
for the resident's task-scope session.

## 3. Create a worktree (setup hooks fire)

The resident creates a worktree off `meal-planner`'s refreshed main — branch `csv-export`. Its
**idempotent setup hooks** run (`design/`): install dependencies, apply the worktree's **accent
color and type glyph** so its windows are recognizable — and so the human can later say "the blue
one" and have an agent resolve it (`02-subsystems/05-visual-theming.md`). Because the work is never
committed to main directly, this branch is the only path to the main line
(`01-concepts/03-work-lifecycle.md`, never-merge-to-main).

**Records written:** the _worktree_ registered against the task (natural key: repo + branch); a
record (or marker) that each setup hook is satisfied, so a later resume is a no-op.

## 4. Brief and open a room — 1A1

The resident writes a **brief** — the artifact that conjures and orients the hands-on agent: what
the room is for, where it operates (the worktree directory), what "done" means
(`01-concepts/00-domain-model.md`, briefs). It opens **room `1A1`** (floor 1, first room) on the
worktree — which **mints the room's first session**, since a room is opened with its work, never
empty (`01-concepts/00-domain-model.md`, room) — and **dispatches** the brief down into it
(`01-concepts/01-scopes-and-personas.md`) — a **direct** dispatch, since the resident knows its own
room; a sender that does _not_ know its target routes instead through the scope's status persona —
the charge nurse, or the house supervisor across the workspace
(`02-subsystems/02-messaging-coordination.md`). The resident then **detaches** and arms a
**milestone wake**: "notify me when `1A1` **reports** done" — the flavor that fires on a matching
report and re-arms for the next cycle, chosen because the resident expects to evaluate and iterate
while the room stays open; the other flavor, a **completion wake**, would fire only when the room
frees (`02-subsystems/02-messaging-coordination.md`). It does not sit blocked.

**Records written:** a _brief artifact_ with provenance (which persona, working dir, session, why);
the _room record_ `1A1` on the worktree — occupied by derivation from its freshly-minted session,
never as a stored flag (`01-concepts/00-domain-model.md`, status); the _dispatch record_; the _wake
condition_ (milestone flavor) against `1A1`'s identity; a _session log_ entry for the room's first
session (minted by the open).

## 5. Deep work in the room

In the session opened with room `1A1`, the **medical student** persona does the actual work in the
worktree's own working directory, loading _that_ directory's `AGENTS.md` context and skills
(`01-concepts/05-context-loading.md`) — its whole context spent on the code, not the project. It
writes the endpoint, adds tests, and may produce its own **artifacts** (a decision note, a data
sample) that persist beyond the session.

**Records written:** appended _session log_ entries as work proceeds; any _artifacts_ the room
creates, each with provenance; commits on the `csv-export` branch (in the repo, not the metadata
store).

## 6. Report up, evaluate, iterate

The room reports **done** upward. This **satisfies the milestone wake** — it fires on the report,
while the room is still open — so the detached resident is nudged back
(`02-subsystems/02-messaging-coordination.md`). The resident evaluates the result against the bar;
suppose it asks for clearer error handling. It dispatches the revision back into `1A1` (still the
same room, `01-concepts/01-scopes-and-personas.md`) and detaches again — the milestone wake
**re-arms** for the next report. The room revises and reports done; the resident is satisfied.

**Records written:** _report_ and updated _session log_; a re-armed _milestone wake_; on acceptance,
the room's session moves toward close — which will free `1A1` for reuse
(`01-concepts/00-domain-model.md`, room).

## 7. Present to the attending; open the PR

The resident presents the task to the **attending** for final approval
(`01-concepts/01-scopes-and-personas.md`). Opening the PR is a **gated action** — outward-facing —
so it goes out with the human's (or delegated) authority (`00-foundation/01-principles.md` §18).
Anything in the PR description is **re-authored for the remote audience**, stripped of local paths,
notes, and **persona names** (`02-subsystems/06-remote-provider.md`, privacy translation). The task
becomes **remote-linked**; identity is unchanged (`01-concepts/03-work-lifecycle.md`).

**Records written:** the task's _remote link_ (an attribute, not its identity); a _PR-tracking_
entry (status: open).

## 8. Drive the PR to merge; keep current

Ward tracks the PR and can answer "what's left to complete this task?" at any moment
(`01-concepts/03-work-lifecycle.md`). While it is open, main may move, so the worktree is
**rebased** onto the refreshed main line (`01-concepts/03-work-lifecycle.md`, rebase). Review comes
back approved; **merging** is again a gated action taken with authority.

**Records written:** updated _PR-tracking_ status (open → approved → merged); rebase reflected in
the worktree record.

## 9. Close the task — disposition, cleanup, reflect

With the PR merged, the resident closes the task (`01-concepts/03-work-lifecycle.md`):

1. **Disposition artifacts.** Decide if any room artifact deserves a wider home — committed into the
   repo, posted to the issue, or promoted to a floor-`1` artifact — each **re-authored, not copied**
   across the boundary (`01-concepts/00-domain-model.md`).
2. **Close.** The task closes; **closed stays closed** (`01-concepts/02-sessions-and-lifecycle.md`).
   Room `1A1`'s session closes and the room is **freed** — its code reusable
   (`01-concepts/00-domain-model.md`, room); its worktree tears down via **idempotent teardown
   hooks** (`design/`); the main checkout is refreshed.
3. **Scope-boundary reflection.** Closing the task triggers a reflection on _that task's arc_
   (`01-concepts/04-reflection-and-evolution.md`, `design/`): it reads the task's sessions via their
   **harness handles**, chunks and distills if needed, and **proposes** improvements (a CSV-export
   skill, a sharper brief template) — asynchronously, without blocking. Its **reflection cursor**
   advances so the next run starts where this one stopped.

**Records written:** artifact disposition decisions; the task record marked closed (outcome:
**delivered** — `01-concepts/03-work-lifecycle.md`, task states); `1A1`'s last session closed and
the room freed; teardown-satisfied markers; a _reflection output_ (proposals) and an advanced
_reflection cursor_.

## 10. Reboot test — does it all come back?

Suppose the machine had rebooted at step 6 (room mid-revision, resident detached). On cold start,
recovery (`01-concepts/02-sessions-and-lifecycle.md`) enumerates sessions, keeps the **open, not
closed** ones, re-attaches each via its **harness handle**, **re-arms the resident's wake** so it is
still notified when `1A1` finishes, and **re-validates** the setup hooks of **live** worktrees
(no-ops if satisfied; a torn-down worktree of closed work is skipped). Recovery then ends with
**rounds**: the house supervisor takes stock and nudges the charge nurse, who confirms `1A1` and its
waiting resident are genuinely back in good order — judgment on top of the mechanical re-arm
(`01-concepts/02-sessions-and-lifecycle.md`). The recovery itself is **recorded** — per-thread
outcomes, the re-armed wake, the rounds' conclusions — and queues a **recovery reflection** over
that episode (`01-concepts/04-reflection-and-evolution.md`), so even a recovery that struggled
leaves reflection everything it needs to find the friction. The human returns to exactly the threads
in flight — `1A1` and its waiting resident — told where they stand, and nothing that was already
closed.

---

### What this exercises (and where it would catch a gap)

It threads every seam and every settled decision: floor/room identity, harness handle, derived
status (rolled up to the house supervisor's workspace-wide view), brief-as-orientation, dispatch
(direct here, status-persona routing the settled alternative) and wake with detach, gated outward
actions, privacy translation on _both_ the PR text and the committed artifacts, idempotent hooks,
scope-boundary reflection with a cursor, and reboot recovery. If a future change to intent breaks
one of these, re-running this walkthrough on paper is the cheapest way to find it.
