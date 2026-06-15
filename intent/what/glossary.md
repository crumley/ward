# Glossary

A quick reference for Ward's vocabulary. The defining file in each `See` is authoritative.

| Term | Meaning | See |
|------|---------|-----|
| **Workspace** | The local, personal, self-sufficient root where a human and their agents work; holds all metadata, tooling, and skills. | `02` |
| **Project** | A coherent body of work with its own definition of success; heavyweight or ad hoc. | `02` |
| **Floor** | A project in the room-numbering metaphor: its code is a floor letter (`A`, `B`…), its rooms numbered on it (`A1`, `A2`…). | `02` |
| **Task** | One unit of trackable, deliverable work — started, paused, resumed, closed; may span repos/worktrees; local-only or remote-linked. | `02`, `05` |
| **Worktree** | A branch of one repository, checked out to be changed independently of its main line. | `02` |
| **Room** | The innermost scope, on a worktree, where deep hands-on work happens. | `02` |
| **Repository** | A repo the workspace knows and keeps a current main checkout of. | `02` |
| **Main line** | A repository's default branch; work reaches it only via PR (or explicit human permission). | `05` |
| **Refresh** | Pulling canonical main checkouts from origin on a cadence, so new worktrees branch from current code. | `05` |
| **Rebase** | Rebasing an existing worktree onto the refreshed main line to keep work in progress current. | `05` |
| **Scope** | The hierarchy level an agent is responsible for (project / task / room) — *what* it attends to; one of a session's two axes. | `02`, `03` |
| **Working directory** | Where a session stands and loads context from — *where* it operates; chosen independently of scope. | `02`, `03` |
| **Agent** | A running AI instance working within one scope and working directory. | `02` |
| **Persona** | A named role definition (name + role) that shapes an agent's behavior; tailored per scope; internal and must not leak. | `02`, `03` |
| **House supervisor** | Status/routing persona at **workspace** scope; favors a fast model. "Supervisor" for short. | `03` |
| **Attending** | Teacher persona at project scope; owns the project outcome; gives final approval. | `03` |
| **Charge nurse** | Teacher persona that tracks status across a project and routes/dispatches; favors a fast model. | `03` |
| **Resident** | Teacher persona at task scope; owns the task outcome; briefs and evaluates rooms rather than doing the work. | `03` |
| **Medical student** | Learner persona doing hands-on work inside a room. | `03` |
| **Teaching loop** | Seniors teach, juniors learn, and learning flows back up — feeding reflection. | `03`, `06` |
| **Session** | One bounded episode of an agent working at a scope; opened, running, closed, resumed, woken; has exactly one identity. | `04` |
| **Open vs. running** | *Open* = started and not closed, regardless of any attached process; *running* = a process attached on this machine now. | `04` |
| **Status (derived)** | Each leaf records its own state; a containing scope's status is **derived** from its children, never stored. | `02` |
| **Open / Close / Resume / Wake** | The session lifecycle operations; resume is idempotent and turns open into running; closed stays closed. | `04` |
| **Harness** | The agent runtime behind a session; stores its own history; pluggable and selectable per scope. | `04`, `07` |
| **Harness handle** | A session's recorded locator for its harness run (type + native run id) — an *attribute*, not an identity. | `04` |
| **Dispatch** | Handing work or context *downward* to something within a scope. | `02`, `03` |
| **Report** | Sending status *upward* to the containing scope. | `02`, `03` |
| **Wake / nudge** | Notifying a scope when a condition is met, so it can detach instead of blocking. | `04` |
| **Fork (side quest)** | A bounded detour that inherits context, resolves a sub-problem, and returns a clean result; inherits by **exact-clone** (harness-dependent) or **distilled brief** (harness-neutral baseline). | `02`, `03` |
| **Artifact** | Any durable output meant to be shared across sessions/agents; carries provenance; owned by its origin. | `02` |
| **Provenance (lineage)** | The recorded who / working-dir / why / source-artifacts behind an artifact, so it can be traced and trusted later. | `02`, `01` |
| **Brief** | An artifact type: a handoff that conjures and orients another agent (what, where, why, what's expected). | `02` |
| **Identity (slug + code)** | A human-memorable name — a meaningful slug plus a short code; not always globally unique; need not mirror containment. | `02` |
| **Local↔remote boundary** | The privacy boundary between the personal workspace and shared remote artifacts; local context must not leak outward. | `01`, `05` |
| **Lifecycle hooks** | Customizable, **idempotent** setup/teardown actions for transitions; validated done-or-not on resume. | `05` |
| **Workflow policy** | Ward's opinionated, workspace-encoded, evolvable commit/merge rules (e.g. never-merge-to-main); reconciled on upgrade. | `05` |
| **Gated action** | An outward-facing or irreversible action requiring the human or delegated authority; local + reversible actions are autonomous. | `01` |
| **Reflection** | A *family* of goal-directed routines turning experience into better skills, tooling, personas, and Ward; chunked and rolled up to scale. | `06` |
| **Scope-boundary reflection** | Reflection triggered when a scope closes (project/task), focused on that scope's arc. | `06` |
| **Reflection cursor** | The per-(scope, goal) marker of how far a reflection has processed, so the next run handles only what is new. | `06` |
| **Update vs. migrate** | *Update* aligns artifacts with the current CLI; *migrate* transforms structure/schema forward. | `06` |
| **Reconciliation** | The agent-guided folding of new Ward defaults into a workspace that has diverged from them. | `05`, `06` |
| **Seam** | A boundary along which the implementation may vary; a contract in the *what*, with its durable choice in `../how/`. | `07` |
| **What-intent / how-intent** | The two layers of intent: concepts/invariants + why (`what/`) and durable design/technology choices + why (`how/`). | `../README` |
