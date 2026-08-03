# Walkthrough: Getting Started

> **Layer:** intent · walkthrough (optional). The first of two scenarios; the work itself is
> [`04-walkthrough-delivering-work.md`](04-walkthrough-delivering-work.md). **Status:** living.

The scenario **before** there is anything to work in: a human puts Ward on their machine and stands
up a workspace with its first repository. Like its companion, this is **illustrative, not
normative** — it names mechanisms deliberately, so it spans intent and design, and exists to make
the model concrete and to surface gaps. Where it conflicts with an intent slice, the intent slice
wins.

> **Scenario.** A human installs Ward and creates their first workspace. The first repository they
> register is **Ward itself** — so that from the next walkthrough onward, Ward is used to build
> Ward. Two names are in play throughout: **Ward the installed CLI** operating the workspace, and
> **`ward` the repository** registered inside it. They are the same software at different moments in
> its life. Nothing requires this pairing: no workspace is obliged to contain the `ward` repository
> — no repository is special (`01-concepts/06-workspace-lifecycle.md`, the repository set) — and it
> is first here only because this human's work happens to be building Ward.

## 0. Get Ward onto the machine

The human installs the Ward CLI. **How it is distributed and installed is a _how_** (`design/`);
what intent fixes is only that Ward is a **command-line tool** (`00-foundation/00-vision.md`) whose
interaction surface is the human shell (`02-subsystems/07-human-shell.md`), and that it is
**separate from any workspace** — one CLI, many possible workspaces, each recording which version
made it (`01-concepts/06-workspace-lifecycle.md`).

**Records written:** none. There is no workspace yet, and Ward has nowhere to record anything —
which is exactly why the next step must work without one.

## 1. `doctor` on a bare machine

Before creating anything, the human runs the **self-diagnosis command**
(`02-subsystems/07-human-shell.md`). Outside a workspace it can only check the **machine**: the
**required** preconditions (git, an agent harness, the multiplexer) and the **optional** tools Ward
takes advantage of when present, plus the git and forge **credentials** Ward will _use_ but never
store (`01-concepts/06-workspace-lifecycle.md`, preconditions). It reports what is healthy and
recommends what to add.

This is the practical face of a distinction that is easy to miss: a workspace is self-sufficient
about its **record**, not about the **machine** (`00-foundation/01-principles.md` §3, read through
`01-concepts/06-workspace-lifecycle.md`). Doctor is where the second is checked against what the
first needs.

**Records written:** none — deliberately. A health check that required a workspace could not
diagnose the machine a workspace is about to be created on.

## 2. Create the workspace

The human asks for a workspace **at a location** — a deliberate, located act, never a side effect of
running a command somewhere that lacks one (`01-concepts/06-workspace-lifecycle.md`). Creation puts
in place everything a cold reader needs (§3), and the workspace begins tracking **itself** in git
(§15).

**Established:** the **metadata root** and the seeded **artifact-type catalog**
(`02-subsystems/00-metadata-store.md`); the **version stamp** naming the Ward version that created
it (`01-concepts/06-workspace-lifecycle.md`) — both _records_; the **guidance an agent needs to work
here** — the root **`AGENTS.md`** (`01-concepts/05-context-loading.md`) and Ward's **workspace
skill**, so an agent started at the root knows how to operate rather than inferring it from the
directory; Ward's opinionated defaults as **installed artifacts** — the **workflow policy**
(`01-concepts/03-work-lifecycle.md`), the **lifecycle hooks**, and (next step) the persona cast; and
the workspace's first git commit (§15).

> _Three kinds of thing, deliberately not one._ **Records** are the data Ward writes, **installed
> artifacts** are the instructional and executable content Ward ships, and the commit is version
> control over both (`01-concepts/06-workspace-lifecycle.md`; `02-subsystems/00-metadata-store.md`).
> Later steps say "Records written" only where actual records are written.

> _All of that is yours to change._ Everything installed here except Ward's small owned tier is a
> **starting point** the human and their agents are expected to edit — a sharpened `AGENTS.md`,
> skills of their own, a policy that fits their work (`01-concepts/06-workspace-lifecycle.md`, the
> two tiers). Where an artifact can be **composed**, Ward's part and the human's stay separately
> addressable, Ward's ordered first — so a later upgrade replaces Ward's part without touching
> theirs, and most divergence never arises at all. Where it cannot, Ward records what it installed
> so an upgrade can tell a deliberate change from an untouched default and **reconcile** rather than
> clobber.

> _Run it twice._ Asked to create a workspace where one already exists, Ward **converges** — it
> validates what is there, adds what is missing, and leaves customized artifacts alone — because
> that is the update path, not a second mechanism (`01-concepts/06-workspace-lifecycle.md`;
> `00-foundation/01-principles.md` §6). Nothing is adjudicated: at the same version no default has
> moved, so the only differences are the human's own, and reconciliation triggers on **a default
> that moved**, never on a file that merely differs.

## 3. Accept the cast

The human picks or accepts the **persona cast** — names drawn from a static list, paired with the
closed **role** vocabulary (`01-concepts/01-scopes-and-personas.md`). The set is evolvable later; a
reflection may propose changes to it (`01-concepts/04-reflection-and-evolution.md`).

Two constraints meet here: names and roles are **internal** and must never reach a remote artifact
(`00-foundation/01-principles.md` §4), and the role vocabulary's closedness is what makes that
leak-guard **exhaustively enforceable** at the crossing (`02-subsystems/06-remote-provider.md`).

**Established:** the workspace's persona cast, as an installed artifact the workspace owns.

## 4. Register the first repository — `ward` itself

The human registers the repository the workspace will work in. Ward either **adopts** the human's
existing checkout — its content moved or locally cloned into place, nothing on disk fetched again —
or **clones** afresh; either way the **canonical checkout lands inside the workspace**, contained
but ignored by the workspace's own git (`01-concepts/06-workspace-lifecycle.md`). The workspace
records the repository's identity, its remote, and the **name of its main line** — read from the
repository, not assumed. That contained checkout is what the toil keeps fresh, what new worktrees
branch from (`01-concepts/03-work-lifecycle.md`, refresh), and where an agent standing in any
worktree reads the current main line without leaving its branch.

Registration is **local and reversible**, so no authority is required (§18); fetching reads from the
remote, and nothing crosses the boundary outward.

**Records written:** a _repository record_ (identity, remote, main line). **Established on disk:**
the contained canonical checkout.

## 5. `doctor` again — now inside a workspace

Run from inside the workspace, doctor answers a strictly larger question. It still checks the
machine (step 1), and now also checks **integrity** — the agreement between the record and the world
(`01-concepts/06-workspace-lifecycle.md`): anchors the record knows versus what is on disk, sessions
whose harness handles still resolve, the registered repository's remote and main line, and **version
skew** between this CLI and this workspace.

On a freshly-created workspace all of these are trivially clean, which is the point of running it
here: the human sees what healthy looks like before there is anything to confuse it with. Whatever
doctor cannot safely fix itself, it **reports** — repairing only what is local and reversible, and
routing the rest to the human as a gated action (§18).

**Records written:** none required — doctor reports; it is not the operation that changes state.

## 6. Where the human stands now

An empty, healthy workspace with one repository. The **house supervisor**
(`01-concepts/01-scopes-and-personas.md`) can already answer "what's in flight?" by _deriving_
status across projects (`01-concepts/00-domain-model.md`, status) — right now, nothing, and a
workspace with no projects is **`active`**, not idle: there is nothing blocking it
(`01-concepts/00-domain-model.md`, derivation rule).

The next walkthrough starts exactly here.

---

### What this exercises (and where it would catch a gap)

The workspace's own arc: creation as a deliberate act, what creation establishes, the
credentials-are-not-workspace-state line, repository registration with adopt-or-clone converging on
the workspace-contained canonical checkout, the no-repository-is-special rule, the
record-versus-machine reading of self-sufficiency, doctor at both scopes (machine-only outside a
workspace, machine plus integrity inside), and the empty-container-is-active rule at the root.

Two things it deliberately does **not** reach, both later in the workspace's life: the **upgrade
arc** — version skew, migration, and the **reconciliation task** an upgrade opens over the artifacts
the human has customized, whose `delivered` close asserts that the changes were presented and
decided, declined ones included (`01-concepts/06-workspace-lifecycle.md`) — since there is only one
version so far; and everything that needs work to exist (`04-walkthrough-delivering-work.md`).

One friction it surfaces rather than resolves: once `ward` is the repository under work, the CLI
operating the workspace and the code being changed are the same software. Which build a session runs
— the installed one, or the one in the worktree — is a real question the bootstrap will have to
answer, and it belongs to `design/`.
