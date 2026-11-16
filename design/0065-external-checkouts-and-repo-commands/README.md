# 0065 — External checkouts and a repository's own commands

> A repository can be registered against a canonical checkout that stands outside the workspace, and
> a machine can name the commands that make its worktrees, remove them, and bring its main line up
> to date — so Ward can run work against a repository whose checkout and tooling it does not own.
>
> **Status:** built — awaiting review · **Started:** 2026-11-15

Every repository verb since [0003](../0003-repository-set/README.md) has assumed two places and two
mechanisms: the canonical checkout is a clone Ward made at `repos/<name>/`, brought current by
`git fetch` and a fast-forward, and a task's worktree is a `git worktree add` under the workspace
([0057](../0057-context-from-root/README.md) put it under its floor). That fits a repository Ward
can treat as its own. It does not fit one that is owned by something else: a checkout large enough
that a second clone is a real cost and that already stands on the machine, a repository whose
worktrees are made by its own tool (its own layout, its own setup steps), or one whose main line is
brought up to date by something other than a fetch and a fast-forward. Today such a repository
cannot be registered at all without Ward cloning it again and making its worktrees the wrong way.

The working assumption about use, stated because nothing in the system yet exercises it: these are
repositories **owned by tooling Ward does not control**, on a machine where that tooling already
works, and what is wanted is for Ward's record, toil, and gates to run against them unchanged. That
assumption shapes two choices below — the result of a custom command must still be a git worktree of
the canonical checkout, and an external checkout is treated as its owner's working place — and both
would be revisited if the real case turns out to be a repository that is not git-shaped at all.

This entry adds three capabilities, each usable alone, per repository: an **external canonical
checkout**, a **worktree command** (with an optional removal command), and an **update command**. A
repository that uses none of them behaves exactly as before.

## Serves intent

- [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md)
  — the repository set: a repository still joins and leaves by a deliberate act, and its record
  still resolves it; what changes is that containment becomes the default rather than the rule
  ([IF-001](intent-feedback.md)). The global-state boundary decides where the machine-shaped parts
  live ([IF-003](intent-feedback.md)).
- [`intent/01-concepts/03-work-lifecycle.md`](../../intent/01-concepts/03-work-lifecycle.md) — the
  maintenance toil and its fail-safe keep their meaning for a checkout and a worktree Ward did not
  make ([IF-002](intent-feedback.md)), and the customizable setup and teardown the slice promises
  gets its first realization, as replacement commands rather than hooks
  ([IF-004](intent-feedback.md)).
- [`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md) — a
  worktree outside the workspace is still reached on a path that passes its floor's manifest
  ([IF-005](intent-feedback.md)).
- [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) — §3 (the
  record stays self-sufficient: it says the checkout is external and where a worktree stands), §17
  (where things are is read off git, never off a command's word), §18 (the trust model below: what
  Ward executes is what this machine's human wrote down), §20 (a machine missing a binding or a
  program is refused or warned precisely, with the command that fixes it).
- [`intent/02-subsystems/00-metadata-store.md`](../../intent/02-subsystems/00-metadata-store.md) —
  the two record changes are additive optional fields, written only through verbs.

## Scope

- **In:**
  - `ward repo add PATH --external [--name NAME]` registers a repository against the checkout at
    PATH: the record gains `checkout: external` and no path; the path is bound in this machine's
    state. The same spelling binds an already-registered external repository on another machine.
  - Every verb that reads the canonical checkout resolves it through one function: refresh, worktree
    create, rebase, freshness, the close gate's reachability check, teardown, restore, doctor,
    `repo list`, `repo path` (and so `wrcd`), the `worktrees/` retirement step.
  - Refresh of an external checkout: its working tree is fast-forwarded only when clean and on the
    main line; otherwise only `origin/<mainLine>` moves.
  - `ward repo remove` of an external repository removes the record and the binding and leaves the
    checkout exactly as it stood.
  - `repositories.<name>.update`, `.worktree.create`, and `.worktree.remove` in this machine's
    global configuration: argument lists run in place of fetch + fast-forward, `git worktree add`,
    and `git worktree remove`.
  - A worktree a command makes outside the workspace: recorded by absolute path with the machine it
    stands on, linked from its placement under its floor's view, and worked by list, freshness,
    rebase, `task show`, close, doctor, and `ward context` like any other.
  - Doctor: an external checkout unbound or missing, an outside worktree missing or unlinked, and
    each configured command (what will run; a program that cannot be found; a value Ward does not
    provide).
  - The root manifest template says all of this in three places; its lineage is re-pinned.
- **Deferred:**
  - **Restore does not rerun a worktree command.** An outside worktree that has gone missing on the
    machine that made it is reported `failed` with the two ways forward. Safe to defer because the
    command's contract is to cut a _new_ branch; re-materializing an existing one is a different
    operation the machine's tool may or may not have, and nothing is lost in the gap — the branch is
    still in the canonical checkout, and the report says how to check it out by hand.
  - **A command's output is captured, not streamed.** A long setup step is silent until it ends.
    Safe to defer because nothing is lost (a failure reports the end of what the command said); it
    costs comfort, and streaming has to be designed against `--json` and the refresh display.
  - **Commands are keyed by repository name alone, for every workspace on the machine.** Two
    workspaces that register different repositories under one name would share commands. Safe to
    defer because the bindings — the part that decides _where_ git runs — are keyed by workspace id,
    doctor prints what will run in each workspace, and a per-workspace key is an additive layer.
  - **A tool that names its own branch, or makes something that is not a git worktree of the
    canonical checkout.** Refused today (nothing recorded). Safe to defer because every guarantee in
    _What Ward still guarantees_ rests on that contract, so supporting such a tool is a second
    design, not a flag.
  - **Scope from the working directory inside an outside worktree.** A human standing there is not
    inside the workspace, so task-addressed verbs need the address (and the workspace, by registry).
    Safe to defer: an explicit address always works, and it is the only spelling an agent has.
  - **Stewardship worktrees and legacy bare tasks get no special handling** — the first is never
    made by a repository command (the workspace's own repository is registered nowhere); the second
    links from `worktrees/`, the same placement function.
- **Acceptance:**
  1. `bun test test/workspace/external.test.ts` — an external checkout is registered unchanged with
     no path in the record; an unbound machine is refused by refresh, create, restore, doctor, and a
     plain `repo add`, each naming the binding command, and that command converges it; refresh
     leaves a dirty or off-main-line external tree alone and still moves `origin/<mainLine>`; a task
     runs create → behind → rebase → close against it; remove keeps it.
  2. Same file — an update command replaces fetch + fast-forward, fails the refresh (and the rebase
     standing on it) when it exits non-zero, cannot start, or asks for a value it is not given, and
     is not run through a dirty tree.
  3. Same file — a worktree command's worktree is recorded at Ward's path or outside it; seven
     misbehaviours (non-zero after making the worktree, non-zero before, exit 0 with nothing, a
     branch of its own, a plain directory, a deleted directory, the wrong place inside the
     workspace) each record nothing and leave the journal untouched; a removal command is run with
     the outcome and refused when it fails or leaves the directory.
  4. `bun test test/workspace/commands.test.ts` — a path with spaces stays one argument; a branch
     name made of shell syntax arrives verbatim as an argument and as environment and executes
     nothing; a substituted value is never expanded twice; an unknown placeholder is refused.
  5. `bun test test/cli/external.test.ts` — the same story through the spawned CLI, every `--json`
     document valid under its registered schema, `ward context` reaching an outside worktree by
     either spelling of its path.
  6. `env -u WARD_AGENT mise run check` — the whole gate, every earlier entry's tests unchanged.

## Design

### Where each setting lives

Three homes, chosen by one question: _on which machines is this true?_

| Fact                                                   | Home                                               | Written by                 |
| ------------------------------------------------------ | -------------------------------------------------- | -------------------------- |
| the checkout is external                               | the repository record (`checkout: external`)       | `ward repo add --external` |
| where it stands here                                   | machine state, `$XDG_STATE_HOME/ward/checkouts.md` | `ward repo add --external` |
| the commands                                           | machine config, `~/.config/ward/config.md`         | the machine's human        |
| where an outside worktree stands, and on which machine | the worktree record (`path`, `machine`)            | `ward worktree create`     |

- **The record says _that_, never _where_.** That the workspace does not contain this repository's
  checkout is true on every machine, and a machine that learns it by pull must not respond by
  cloning — so it travels. A path is true on one machine. _Alternative considered:_ nothing in the
  record, the binding alone deciding. It was attractive because a second machine could choose to let
  Ward clone. It lost because the name alone then cannot say which a workspace means: a machine with
  a binding for `mono` would treat every workspace's `mono` as external, and a machine without one
  would silently clone a repository whose owner said not to. _Cost:_ a repository is external or
  contained for every machine sharing the workspace.
- **Bindings live in state, keyed by workspace id.** They are written by a verb, rewritten as
  workspaces come and go, and re-creatable by one command — the registry's kind of file
  ([0024](../0024-global-config-registry/README.md)), beside it. Keyed by the immutable id
  ([0054](../0054-workspace-id/README.md)) so a moved workspace keeps them and two workspaces never
  share one. _Alternative considered:_ a `checkout` key in `config.md` beside the commands. It lost
  because `config.md` is hand-written and Ward never rewrites it, so registering would become "edit
  a file, then run a verb". _Cost:_ two global files where one would be simpler to explain.
- **Commands live in machine configuration and nowhere else.** See _Trust_.
- **A machine that has neither.** An external repository with no binding is **refused** by every
  verb that needs the checkout, naming `ward repo add PATH --external --name NAME`; doctor and
  restore say the same. A repository with no command configured is made, removed, and updated with
  Ward's own git — the commands are a machine preference, and their absence is not detectable from
  the record. _Alternative considered:_ a record flag (`worktree: custom`) so a machine without the
  command refuses instead of falling back. Attractive for a repository whose worktrees _must_ come
  from its tool. Deferred rather than rejected: it is an additive field, and it should be added on
  evidence that the fallback has bitten ([IF-003](intent-feedback.md) raises it).

### Trust

**Ward executes only what this machine's own configuration names.** A workspace record travels
through git; a command stored in one would be a command a pull can change and Ward then runs without
anyone on this machine having seen it. So no record carries a command, no `ward` verb writes one,
and the root manifest tells an agent never to change one to get past a refusal. The binding is held
to the same line for the same reason — Ward runs git inside the directory it names, and a directory
can make git execute things — so it too is outside anything a pull can rewrite, though a verb (and
so an agent) may set it: pointing Ward at a checkout is no more than `repo add URL` already allows.

What a pull _can_ change is small and named. It can add or drop `checkout: external`: worst case a
refusal, or a contained clone of the recorded remote. And it can change a worktree record's `path`,
which Ward reads git state from and tears down at close — so teardown never trusts it:
`git worktree
remove` refuses a path that is not a worktree of the checkout it runs in, and a
removal command is handed a path only when git lists it as one.

_Alternative considered:_ commands in the record, guarded by a per-machine approval of their hash (a
changed command is not run until a human approves it there). It was attractive because the command
would travel, and one setup would serve every machine. It lost on three counts: the approval store
is itself per-machine state, so nothing is saved; a command naming a program that exists on one
machine is false on the next (the reason `agent.command` is machine configuration,
[0035](../0035-agent-command/README.md)); and "is this diff safe to approve" is a question humans
answer badly at the moment a verb is blocked on it. _Cost:_ each machine sets its commands up by
hand, and a workspace cannot say what they should be.

This squares with §18 as it stands — running a local tool is local and reversible, so autonomous —
but §18 says nothing about _whose text_ is being executed, which is the real question here
([IF-004](intent-feedback.md)).

### The command contract

- **Spelling.** An argument list (`[program, arg, …]`), spawned directly. There is no shell, so a
  substituted value is never parsed: one argument stays one argument whatever a branch name or path
  contains. _Alternative considered:_ a shell string, the familiar form of a git hook or an npm
  script. It lost because every value Ward substitutes would then need quoting Ward gets right for
  every shell, forever. A command that wants a shell says so (`[sh, -c, '…']`) and reads the values
  from its environment, where they are data too.
- **Values.** Each is offered twice: as a `{name}` placeholder inside any argument, and as an
  environment variable. Substitution is one pass (a value containing `{branch}` is not expanded
  again); `{name}` after a `$` is left alone, so a shell's own `${name}` passes through; a
  placeholder the kind is not given is refused before anything runs, and by doctor before that.

  | Placeholder   | Environment          | update | worktree.create | worktree.remove |
  | ------------- | -------------------- | :----: | :-------------: | :-------------: |
  | `{repo}`      | `WARD_REPO`          |   ✓    |        ✓        |        ✓        |
  | `{checkout}`  | `WARD_CHECKOUT`      |   ✓    |        ✓        |        ✓        |
  | `{mainline}`  | `WARD_MAIN_LINE`     |   ✓    |        ✓        |        ✓        |
  | `{remote}`    | `WARD_REMOTE`        |   ✓    |        ✓        |        ✓        |
  | `{workspace}` | `WARD_WORKSPACE`     |   ✓    |        ✓        |        ✓        |
  | `{task}`      | `WARD_TASK`          |        |        ✓        |        ✓        |
  | `{branch}`    | `WARD_BRANCH`        |        |        ✓        |        ✓        |
  | `{base}`      | `WARD_BASE`          |        |        ✓        |                 |
  | `{path}`      | `WARD_WORKTREE_PATH` |        |  ✓ (proposed)   |  ✓ (recorded)   |
  | `{outcome}`   | `WARD_OUTCOME`       |        |                 |        ✓        |

- **Where it runs.** In the canonical checkout, stdin closed, output captured.
- **`worktree.create`.** Contract: make a **git worktree of the canonical checkout on `{branch}`**,
  cut from `{base}` (`origin/<mainLine>`, refreshed first), at `{path}` or anywhere outside the
  workspace. **It does not report where it put it — git is asked.** After the command exits 0, Ward
  reads `git worktree list` in the canonical checkout and takes the worktree on `{branch}`; the
  branch did not exist before (checked, as always), so that worktree is this command's. Nothing is
  recorded unless the command exited 0, git lists that worktree, and its directory is on disk; a
  worktree inside the workspace anywhere but `{path}` is refused. _Alternative considered:_ the
  command prints the path (last line of stdout, or a file Ward names). It was attractive because it
  would admit tools that name their own branch. It lost because a printed path is a claim — it can
  name a directory that does not exist, or one on another branch — and every check that would make
  it trustworthy is the question git already answers. _Cost:_ the tool must use the branch name it
  is given.
- **`worktree.remove`.** Contract: remove the worktree at `{path}`. Ward's own gates run first,
  unchanged. After exit 0 the directory is looked at: still there is a refusal. **With none
  configured, `git worktree remove` in the canonical checkout removes it wherever it stands** —
  which works for a worktree Ward did not make because of the create contract, and is why removal
  need not be configured just because creation is.
- **`update`.** Contract: leave `origin/<mainLine>` in the checkout at the latest. Ward checks that
  the ref resolves and reports whether it moved; what the command does to the working tree is its
  own business.
- **Failure.** A non-zero exit, a program that cannot be started, or a broken contract fails the
  verb with the program, how it ended, and the last lines it wrote. Ward does not clean up after a
  failed create — what is left may be the tool's own state — but it names what is left (a worktree,
  a branch) with the commands that clear it. A failed update is a `failed` refresh, so whatever
  stands on the refresh (a rebase, the close gate's freshness) refuses or degrades exactly as it
  does for a failed fetch. A failed removal refuses the close; the task stays open.
- **The branch is validated before a tool sees it** (`git check-ref-format --branch`): a name
  starting with a dash, or holding whitespace or control characters, never becomes an argument.

### What Ward still guarantees

| Fail-safe                                                  | External checkout                                                                                                                    | Custom-made worktree      |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------- |
| never through a dirty tree (refresh)                       | **holds differently:** Ward's own refresh never touches a dirty or off-main-line tree, and does not refuse over it — it fetches only | n/a                       |
| never through a dirty tree (update command)                | holds: a command is not run through a dirty tree, wherever the checkout stands; `--stash` is still the exception                     | n/a                       |
| never through a dirty tree (rebase, move, delivered close) | n/a                                                                                                                                  | holds, wherever it stands |
| a rebase conflict aborts, tree as found                    | n/a                                                                                                                                  | holds                     |
| never work in the canonical checkout                       | **does not hold:** it is its owner's working place; Ward itself still never works in it                                              | n/a                       |
| delivered means the merge commit reaches the main line     | holds: asked of `origin/<mainLine>` there                                                                                            | holds                     |
| unlanded work refuses a delivered close                    | holds, measured against `origin/<mainLine>` rather than the checkout's HEAD                                                          | holds                     |
| removal refuses over unrecorded work                       | **moot:** nothing is deleted; only open tasks' worktrees still refuse                                                                | n/a                       |

The two that change are the same fact seen twice: a contained checkout is Ward's, kept on its main
line and clean, so dirt in it is an anomaly worth refusing over; an external one is somebody's own,
where dirt and another branch are normal. Everything Ward needs from a refresh is
`origin/<mainLine>` — worktrees are cut from it, rebased onto it, measured against it, and the close
gate asks it — and a fetch moves that ref without touching a file. So Ward fetches always and
fast-forwards the tree only when doing so cannot surprise its owner ([IF-002](intent-feedback.md)).

### Context loading

A worktree outside the workspace is not below the root, so the reading rule's path would never pass
its floor. Its **placement under the floor's view holds a symbolic link onto it** —
`floors/<N>-<slug>/<address>-<branch>`, the path it would have had. Worked through that path, the
chain is root, floor, then the worktree's own `AGENTS.md`, with nothing new to learn. `ward context`
is the contract: given either spelling — the link, or the real path outside — it answers with the
same chain, expressed through the link. The link is derived state in an ignored tree: it is made at
create, removed at close, re-established by re-running create, and named by doctor when it is
missing or the placement is occupied by something else.

_Alternative considered:_ write a pointer file into the outside worktree. It lost to intent's own
rule that Ward writes nothing inside an anchor. _Cost:_ a harness that resolves symlinks before
loading parent guidance loads none of the workspace's from there — which is already true of every
level below the root, and why the rule is "read the chain yourself".

### Layout

- `src/workspace/checkouts.ts` — the one answer to "where is this repository's checkout": contained,
  external and bound, or external and unbound. Synchronous, because the question is asked from
  synchronous code deep in the relocation and teardown paths; it is why the document layer gained a
  blocking read.
- `src/global/checkouts.ts` — the bindings document. A global document like the registry, with the
  registry's posture: unreadable reads as empty, and the verb that writes a binding repairs it.
- `src/workspace/commands.ts` — expansion, the spawn, and the failure sentence. It knows nothing
  about worktrees or refresh; the three call sites own what a failure means where it happened.
- `repos.ts`, `worktrees.ts`, `tasks.ts` keep their verbs; each gained the branch that asks
  `commands.ts`. `worktreeDir` replaces every join of the root onto a record's path.

### Record and JSON changes

All additive. Repository record: `checkout: 'external'` (optional). Worktree record: `path` may be
absolute, and `machine` is present exactly then. `repo add` and `repo list`: `checkout`, `path`.
`repo remove`: `checkout` gains `kept`, plus `path`. `worktree create`, `worktree list`, and the
worktree rows of `status` and `task show`: `machine`. An older `ward` reads both record fields
without error and ignores what it does not know, so it takes an external repository for a contained
one whose checkout is missing and an outside worktree for a missing one — wrong, and its restore
would clone the repository into `repos/`, but nothing is destroyed. Every machine sharing a
workspace should run a `ward` with this entry before one of them registers an external repository.
