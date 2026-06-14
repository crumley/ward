# Glossary

A quick reference for Ward's vocabulary. Defining files are noted; those files are
authoritative.

| Term | Meaning | See |
|------|---------|-----|
| **Workspace** | The local, personal, self-sufficient root in which a human and their agents work. Holds all metadata, tooling, and skills. | `02` |
| **Project** | A coherent body of work with its own definition of success; heavyweight or ad hoc. | `02` |
| **Floor** | A project in the room-numbering metaphor: its short code is a floor letter (`A`, `B`…) and its rooms are numbered on it (`A1`, `A2`…). | `02` |
| **Task** | One unit of trackable, deliverable work; started, paused, resumed, closed. May span repos/worktrees; local-only or remote-linked; heavyweight or ad hoc. | `02`, `05` |
| **Worktree** | A branch of one repository, checked out to be changed independently of its main line. | `02` |
| **Room** | The innermost scope, on a worktree, where deep hands-on work happens. | `02` |
| **Repository** | A project repo the workspace knows and keeps a current main checkout of. | `02` |
| **Main line** | A repository's default branch; the canonical checkout tracks it, refreshed on a cadence. Work never merges to it except via PR (or explicit human permission). | `05` |
| **Refresh** | Pulling the workspace's canonical main checkouts from origin on a cadence, so new worktrees branch from current code. | `05` |
| **Rebase** | Rebasing an existing worktree onto the refreshed main line, so work in progress stays current and merge surprises shrink. | `05` |
| **Scope** | The level in the hierarchy an agent is responsible for (project / task / room) — *what* it attends to. One of a session's two axes, alongside working directory. | `02`, `03` |
| **Working directory** | Where a session stands and loads context from — *where* it operates; chosen independently of scope (root for broad scopes, a repo/worktree dir for narrow ones). | `02`, `03` |
| **Agent** | A running AI instance doing work within one scope and working directory. | `02` |
| **Persona** | A named role definition (a **name** plus a **role**) that shapes an agent's behavior; tailored to a scope; open/configurable set. Name and role are internal and must not leak. | `02`, `03` |
| **House supervisor** | Status/routing persona at **workspace** scope; knows where every project stands and routes between them; owns no project outcome (the human owns workspace direction); favors a fast model. "Supervisor" for short. | `03` |
| **Attending** | Teacher persona at project scope; owns the project outcome; gives final approval. | `03` |
| **Charge nurse** | Teacher persona that tracks status across a project's work and routes/dispatches; never descends into detail; favors a fast model. | `03` |
| **Resident** | Teacher persona at task scope; owns the task outcome; briefs and directs rooms and evaluates them rather than doing the work. | `03` |
| **Medical student** | Learner persona doing hands-on work inside a room. | `03` |
| **Teaching loop** | Seniors teach, juniors learn, and learning flows back up — feeding reflection and the system learning about itself. | `03`, `06` |
| **Session** | One bounded episode of an agent working at a scope; opened, running, closed, resumed, woken; recorded with a **harness handle** for recovery and reflection. Has exactly one identity. | `04` |
| **Open vs. running** | *Open* = a live thread, started and not closed, regardless of any attached process. *Running* = an active process attached on this machine right now. | `04` |
| **Status (derived)** | Each leaf records its own state; a containing scope's status is **derived** from its children, never stored as a separate field. Non-derivable judgments (priority, blocked-reason) are recorded where they apply. | `02` |
| **Open / Close / Resume / Wake** | The session lifecycle operations; resume is idempotent and turns open into running; closed stays closed. | `04` |
| **Harness** | The agent runtime behind a session; stores its own session history; pluggable and selectable per scope. | `04`, `07` |
| **Harness handle** | A session's stored locator for its underlying harness run (harness type + native run id) — a recorded *attribute*, not an identity; used to resume the run and locate it for reflection. Analogous to a task's remote-work-item link. | `04` |
| **Dispatch** | Handing work or context *downward* to something within a scope. | `02`, `03` |
| **Report** | Sending status *upward* to the containing scope. | `02`, `03` |
| **Wake / nudge** | Notifying a scope when a condition is met, so it can detach instead of blocking. | `04` |
| **Fork (side quest)** | A bounded detour that inherits a scope's context, resolves a sub-problem (possibly at a different scope/persona), and returns a clean result — protecting the origin's context. Inherits by **exact-clone** (harness-dependent) or **distilled brief** (harness-neutral baseline). | `02`, `03` |
| **Artifact** | *Any* durable output meant to be shared across sessions/agents (briefs, decisions, datasets, scripts, …). Carries provenance; discoverable across its scope; owned by its origin. | `02` |
| **Provenance (lineage)** | The recorded who/persona, working directory, session, why, and source-artifacts behind an artifact — so it can be traced and trusted later. | `02`, `01` |
| **Brief** | An artifact type: a handoff document that conjures and orients another agent (what, where, why, what's expected). | `02` |
| **Identity (slug + code)** | A human-memorable name: a meaningful slug plus a short code, easy to say and type. Not always globally unique — prefer memorable codes sized to real cardinality (a project's code is a floor letter; a room's is floor + number, e.g. `A3`). Identity need not mirror containment. | `02` |
| **Local↔remote boundary** | The privacy boundary between the personal workspace and shared remote artifacts; local/personal/internal context (incl. persona names) must not leak outward. | `01`, `05` |
| **Lifecycle hooks** | Customizable, **idempotent** setup/teardown actions for transitions (e.g. worktree dependency init, applying a theme); validated as done-or-not on resume and no-op if satisfied. | `05` |
| **Workflow policy** | Ward's opinionated, workspace-encoded, evolvable rules for committing and merging (e.g. never-merge-to-main); reconciled on upgrade. | `05` |
| **Gated action** | An outward-facing or irreversible action (merge/push to main, create/comment on a remote item, delete unmerged work) that requires the human or explicitly delegated authority; local + reversible actions are autonomous. | `01` |
| **Reflection** | A *family* of goal-directed routines that turn experience and the teaching loop into better skills, tooling, personas, and Ward improvements; runs on a cadence and at scope boundaries; chunked and rolled up to scale. | `06` |
| **Scope-boundary reflection** | Reflection triggered when a scope closes (project/task), focused on that scope's arc for focused, actionable improvements. | `06` |
| **Reflection cursor** | The per-(scope, reflection-goal) marker recording how far a reflection has already processed, so the next run handles only what is new. | `06` |
| **Update vs. migrate** | *Update* brings artifacts in line with the current CLI; *migrate* transforms structure/schema forward. You can update without migrating. | `06` |
| **Reconciliation** | The agent-guided process for folding new Ward defaults into a workspace that has diverged from them. | `05`, `06` |
| **Seam** | A boundary along which the implementation may vary; a contract in the *what*, with its durable choice in `../how/`. | `07` |
| **What-intent / how-intent** | The two symmetric layers of intent: concepts/invariants + why (`what/`) and durable design/technology choices + why (`how/`). Both sit above the implementation plan. | `../README` |
