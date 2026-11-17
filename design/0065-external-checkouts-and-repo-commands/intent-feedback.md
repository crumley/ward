# 0065 — Intent feedback

> Intent frictions found while building external checkouts and a repository's own commands.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

What was built, in one paragraph: a repository can be registered against a canonical checkout that
already stands outside the workspace (`ward repo add PATH --external`), which Ward reads and
refreshes and never clones, moves, or deletes; and a machine's own configuration can name, per
repository, the command that makes a task's worktree (possibly outside the workspace), the one that
removes it, and the one that brings the main line up to date, each run in place of Ward's own git.

## IF-001 — the canonical checkout is stated as contained, without exception

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  "The repository set" ("The canonical checkout lives inside the workspace", "Both adoption and
  cloning must be possible, and both converge on the contained checkout");
  [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md),
  "Repositories and the main line"; the glossary's _Canonical checkout_;
  [`intent/03-walkthrough-getting-started.md`](../../intent/03-walkthrough-getting-started.md).
- **Friction:** containment is stated as a property of every registered repository, and adoption is
  defined as converging on the contained checkout ("the destination is still Ward's"). A repository
  whose checkout must not be duplicated or moved — too large, or owned by tooling that expects it
  where it is — cannot be registered under that rule at all. The slice argues containment from three
  benefits; two survive an external checkout (an agent in a worktree still reads the current main
  line locally, and the toil still has one known target per repository) and one weakens (a cold
  reader no longer finds every main line at the same place in every workspace — the record says the
  checkout is external and `ward repo list` says where it stands on this machine).
- **Assumption made to keep moving:** containment is the **default**, and a repository may be
  registered as an explicit, recorded exception: the workspace does not contain its checkout, Ward
  never clones, moves, or deletes it, and where it stands is each machine's fact. Registration stays
  a deliberate, local, autonomous act; removal of such a repository forgets it and touches nothing
  in it.
- **Proposed revision:** in "The repository set", restate the containment bullet as the default and
  add a bullet for the exception: a repository may be registered against a checkout the workspace
  does not contain; the record says so; the checkout's location is machine state under the
  global-state boundary; Ward reads and refreshes it and never clones, moves, or deletes it; and the
  third containment benefit is traded, knowingly, for not duplicating what its owner already keeps.
  Adjust the domain model's sentence, the glossary entry, and the adopt-or-clone bullet ("converge
  on the contained checkout, unless the repository is registered external") to match.
- **Status:** pending — ruled by Ryan 2026-11-16, awaiting the intent edit: containment is the
  default, and a repository may be registered external as a recorded exception that names its cost
  ([#146](https://github.com/crumley/ward/pull/146))

## IF-002 — "never worked in directly" and the dirty-tree fail-safe assume the checkout is Ward's

- **Slice:**
  [`intent/01-concepts/03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md), the
  maintenance toil and its fail-safe;
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  "The repository set" ("never worked in directly"; removal refused over a dirty tree, a stash, an
  unlanded branch).
- **Friction:** the canonical checkout is described as never worked in directly, so evidence of
  unrecorded work in it is an anomaly and the toil refuses over it. An external checkout is its
  owner's own working place: dirty, mid-merge, or on another branch for reasons that are none of
  Ward's. Refusing to refresh over that would make the repository unusable (every rebase and every
  close gate stands on a refresh); fast-forwarding through it would be Ward working in somebody's
  tree.
- **Assumption made to keep moving:** the fail-safe is about **what Ward touches**. For an external
  checkout Ward always fetches — which moves the main line's remote-tracking ref, the only thing
  worktree creation, rebase, freshness, and the close gate read — and fast-forwards the working tree
  only when it is clean and on the main line; it never refuses over the owner's state. A machine's
  own update command is still never run through a dirty tree. Removal of an external repository runs
  no unrecorded-work gate, because nothing is deleted; it still refuses while an open task's
  worktree stands on the checkout.
- **Proposed revision:** in the fail-safe, say that it guards what the toil would _modify_: reading
  and fetching are always allowed, and a working tree Ward does not own is modified only when it
  carries no evidence of anyone's work. In "The repository set", scope "never worked in directly" to
  contained checkouts, and say of an external one that it is its owner's and that Ward itself never
  works in it.
- **Status:** pending — ruled by Ryan 2026-11-16, awaiting the intent edit: the fail-safe guards
  what the toil would modify, not what it reads, and an external repository leaves without the
  unrecorded-work gate ([#146](https://github.com/crumley/ward/pull/146))

## IF-003 — the global-state boundary, stretched to hold a binding work depends on

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  "What may live outside the workspace".
- **Friction:** global state "may hold preferences and conveniences only — never anything the
  understanding or resumption of work depends on", with the allowance that a key whose validity
  depends on the machine is a preference whose "failure costs a launch". An external checkout's path
  and a repository's commands are exactly machine-dependent keys, and cannot live in the record (a
  path is false on the next machine; a command in the record is a command a pull can change —
  IF-004). But their absence costs more than a launch: with no binding, every verb that needs that
  repository refuses until one command is run; with no command, Ward quietly makes the worktree with
  its own git, which for a repository whose worktrees must come from its tool is the wrong worktree,
  not a missing convenience.
- **Assumption made to keep moving:** both are machine facts in the boundary's sense, because the
  record still carries everything needed to _understand_ the work (that the checkout is external;
  where a worktree was made and on which machine) and resumption on a new machine costs one named
  command. The record does not say that a repository expects commands, so their absence is not
  detectable and falls back to Ward's git.
- **Proposed revision:** extend the paragraph to name this class: a machine may hold **where
  something the record names stands, and how it is made, on that machine**, provided the record
  names the dependency so that its absence is refused with the remedy rather than silently guessed
  around. Under that wording the binding already conforms; the commands would conform once a record
  can say "this repository's worktrees are made by a machine-configured command" — a rule this item
  asks for a ruling on, since it decides whether falling back to git is acceptable.
- **Status:** pending — ruled by Ryan 2026-11-16, awaiting the intent edit: a machine may hold where
  a recorded thing stands and how it is made there, provided the record names the dependency
  ([#146](https://github.com/crumley/ward/pull/146))

## IF-004 — customizable lifecycle steps have no stated home, and §18 does not cover whose text runs

- **Slice:**
  [`intent/01-concepts/03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md),
  "Lifecycle hooks: customizable, idempotent setup and teardown";
  [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) §18;
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  the installed artifacts (hooks among the human's tier).
- **Friction:** the slice promises hooks that are "Ward-provided extension points, customized per
  workspace", and lists hooks among the artifacts installed into a workspace — which reads as
  executable text living in the workspace record, travelling by git. A command that arrives by pull
  and is then executed by Ward is execution nobody on that machine reviewed. §18 sorts actions by
  local/reversible versus outward/irreversible and has no word for this: running a local tool is
  local and reversible, yet who authored the text is the whole risk. Separately, what was needed
  here is not a hook _around_ Ward's step but a **replacement of** it (make the worktree with this
  tool instead), which the slice does not describe.
- **Assumption made to keep moving:** Ward executes only commands named in **this machine's own
  configuration**; no record carries one, and no `ward` verb writes one. They replace three steps
  (make a worktree, remove one, update the main line) rather than wrapping them, under a stated
  contract per step, and Ward verifies the result instead of trusting the exit code. The idempotence
  the slice requires is met by Ward, not asked of the command: a worktree already recorded and on
  disk is never made twice.
- **Proposed revision:** in the hooks section, distinguish a step's **replacement** (a contract Ward
  verifies) from a hook around it, and state where executable customization may live: text Ward
  executes is set on the machine that runs it, or, if it is ever to travel in the record, runs only
  after that machine's human has accepted that exact text. Add to §18 (or beside it) that
  **executing text is authorised by where the text came from**, not only by what the action does.
- **Status:** pending — ruled by Ryan 2026-11-16, awaiting the intent edit: a step may be replaced
  under a contract Ward verifies, and text Ward executes is set on the machine that runs it
  ([#146](https://github.com/crumley/ward/pull/146))

## IF-005 — a working place that cannot sit beneath its floor's directory

- **Slice:**
  [`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md),
  "Context loads downward from the workspace root" ("A project's working places sit beneath a
  directory that carries the project's `AGENTS.md` … No level is reached by a pointer, a variable,
  or a file named for one harness");
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  "Contained is not tracked" (worktrees within the workspace).
- **Friction:** a worktree made by a repository's own tool may have to stand where that tool puts
  it, outside the workspace, so it is not beneath its floor's directory and the path from the root
  never reaches it. The slice rules out pointers as a way to reach a _level_; it does not say
  whether a working place may itself be reached through a link.
- **Assumption made to keep moving:** the worktree's placement under its floor's view holds a
  symbolic link onto it, at the path it would have had. The path from the root through that link
  passes every level, so the reading rule is unchanged, and `ward context` answers with the same
  chain for either spelling of the path. This is the slice's own "an adapter, not a copy" move (a
  link that carries no content), applied to a directory. Nothing is written inside the anchor.
- **Proposed revision:** add to the layout bullet that a working place which must stand elsewhere is
  **reached** beneath its level's directory through a link, and that the chain is the one the link's
  path walks — keeping "no level is reached by a pointer" for levels, which is what it protects. In
  the lifecycle slice, say worktrees are contained by default and may stand outside when a
  repository's own command makes them, the record naming where and on which machine.
- **Status:** pending — ruled by Ryan 2026-11-16, awaiting the intent edit: a working place that
  must stand elsewhere is reached through a link beneath its level, and worktrees are contained by
  default ([#146](https://github.com/crumley/ward/pull/146))
