# 0034 — The workspace session shorthand: `wws`, and a purpose nobody has to invent

> `wws [NAME] [ARGS…]` takes the shell to a workspace root — the default one when nothing is named
> and nothing can pick — and runs `ward session open` there, so starting an agent in a workspace is
> one word from any directory. To make that word enough, `ward session open` no longer requires
> `--purpose` at workspace scope: an omitted purpose is recorded as
> `Coordinating work · opened <time>`. The workspace resolution `wwcd` carried moves into one helper
> both shorthands call.
>
> **Status:** built — awaiting review · **Started:** 2026-09-02

[0029](../0029-launched-sessions/README.md) made starting an agent in a workspace one command. The
command is `cd ~/w/main && ward session open --purpose "…"`: a directory to remember and a phrase to
invent before anything runs, paid at exactly the moment the launched open was built for — a human
who wants to stand in the workspace and start firing work off through a session. Meanwhile the shell
layer ([0025](../0025-fish-shell-layer/README.md)) has answered "which workspace?" from any
directory since it existed, with a picker, a default, and a `cd` — and the two were never joined.

The purpose is the harder half, and it is a question about sessions rather than about shells. A
workspace-scope session is opened to **receive** work, not to perform one named piece of it: the
tasks it opens and the sub-agents it dispatches carry the purposes. Requiring a phrase there
produces `--purpose "start work"` — a filled field, not a fact — and the friction it adds is the
whole reason the shorthand would otherwise need a prompt.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _mnemonic shorthands … thin
  plumbing_: a fourth one, whose every line asks Ward or moves the shell; _churn must be
  deliverable_: it lands in both installed forms at once, and the one existing shorthand it changes
  (`wwcd`) surfaces through the per-alias staleness [0027](../0027-shell-adoption/README.md) built;
  _supply nouns by recognition_: the workspace completes and is picked exactly as for `wwcd`.
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — the session
  log's minimum keeps its **purpose**: the record always carries one, and the JSON shape is
  unchanged. What changes is who supplies it for one kind of session (Design, below), and
  [`spec-feedback.md`](spec-feedback.md) names the friction that kind exposes in the slice.
- [`scopes-and-personas`](../../intent/01-concepts/01-scopes-and-personas.md) — the two axes, chosen
  explicitly by a shorthand: scope is the workspace (no TASK is passed), and the working directory
  is its root, where the calling shell is moved to and left.
- [`principles`](../../intent/00-foundation/01-principles.md) — **§9**: the shorthand names both
  axes rather than inferring either. **§16**: a purpose the human did not type is still on the
  record, stable and greppable, never an empty field. **§20**: no picker means the default
  workspace, said on stderr, never a hang; an unresolvable name means the listing and a nonzero
  return before any `cd`, so nothing is ever opened in the wrong place. **§8**: the parser is the
  same for both audiences, and the option's own help says which scope may leave it out.

## Scope

- **In:**
  - **`--purpose` optional at workspace scope** (`src/cli/index.ts`, `src/workspace/sessions.ts`):
    `ward session open` with no TASK and no `--purpose` records `defaultWorkspaceSessionPurpose` —
    `Coordinating work · opened <time>`, the instant being the record's own `openedAt` — on both the
    launched path and the `--handle` record-only path. With a TASK and no `--purpose`, a refusal
    naming the exact invocation; no record is written and nothing is launched. The option carries
    its own help line saying so.
  - **`wws`** (`src/shell/shorthands.ts`): `wws [NAME] [ARGS…]`. The first argument names the
    workspace unless it begins with `-`; every remaining argument reaches `ward session open`
    untouched. The workspace resolves as `wwcd`'s does — by name, else the picker, else (no picker)
    the default, said out loud — then the calling shell `cd`s there and `command ward session open`
    runs. Completion over the workspace feed, like `wwcd`.
  - **`__ward_workspace_root`**, a new helper holding the resolution `wwcd` used to inline; `wwcd`
    becomes three lines over it. Both shorthands need it transitively, so adopting either writes it.
  - **Both assemblies grow** with no other edit: the monolith (`ward shell init fish`) and adoption
    (`ward shell adopt fish wws`), the offering, doctor's per-alias findings, the `--json` shape's
    rows — all table-driven off the catalog.
  - **Docs and the manifest**: the shorthand table in `README.md`; the `init` brief; the workspace
    `AGENTS.md` template's first Sessions bullet says `--purpose` is optional at workspace scope and
    what an omitted one records — with the outgoing default's fingerprint appended to the lineage so
    every workspace still on it upgrades ([0020](../0020-deterministic-upgrade/README.md)).
  - **Tests**: the workspace default on both open paths and the task-scope refusal
    (`test/agent/launch.test.ts`); the four functions, the shared helper defined once above both
    callers, and `wws` run by a real fish — named with pass-through, flag-first with the default,
    unresolvable with no `cd` (`test/cli/shell.test.ts`); the file sets and findings for the new
    catalog (`test/cli/shell-adopt.test.ts`); the manifest repin (`test/workspace/lineage.test.ts`).
- **Deferred:**
  - **A positional purpose** (`ward session open "fix the build"`, `wws main "fix the build"`). _Why
    safe:_ `--purpose` passes through `wws` today, so the phrase costs one flag when the human has
    one; and `session open`'s positional is already TASK — a second free-text positional would make
    `ward session open t3` and `ward session open triage` differ only by whether a string happens to
    look like a task code, which is a parse rule nobody can predict from the surface.
  - **A default purpose at task scope.** Recorded as a decision below rather than built: the code
    makes it a one-line change, and the reason not to is about the record, not the code.
  - **Completing `session open`'s flags under `wws`** (`complete -c wws -w 'ward session open'`
    beside the workspace feed). _Why safe:_ the noun that is typed is the workspace, and the flags
    are rare by construction now that the purpose is optional; adding the wrap is one line in the
    catalog if telemetry shows `--purpose` typed under `wws` often enough to want a TAB.
  - **bash and zsh.** [0025](../0025-fish-shell-layer/README.md)'s reasoning, unchanged.
- **Acceptance:**
  1. `mise run check` green.
  2. `bun test test/agent/launch.test.ts` — `session open` with no TASK and no `--purpose` launches
     and records `Coordinating work · opened <time>`; the same with `--handle` records it;
     `session
     open TASK` without `--purpose` is refused with nothing written and nothing
     launched.
  3. `bun test test/cli/shell.test.ts test/cli/shell-adopt.test.ts` — the emitted layer holds all
     four shorthands and one `__ward_workspace_root` above both callers; adopting `wws` or `wwcd`
     writes the helper; `wws` under a real fish: named with pass-through, flag-first to the default,
     unresolvable with exit 127 and no `cd`.
  4. In a throwaway workspace: `WARD_AGENT=1 ward session open --handle test:1` succeeds with no
     `--purpose`; `fish -c 'ward shell init fish | source; functions wws'` prints the function;
     `ward shell init fish | fish --no-execute /dev/stdin` parses clean.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **An optional purpose is safe under the sessions concept because the record still carries one.**
    The slice puts purpose in the per-scope log's minimum so that "what was this thread trying to
    do" is answerable from the record alone, and allows "a one-line goal when neither [brief nor
    dispatch] exists". For a session opened to receive work, the honest one-line answer is the
    **kind** of session it is — and one stable phrase says that better than a phrase the human
    invents differently each morning. The field stays required on the record type
    (`purpose: z.string().min(1)`), the JSON shape is unchanged, and `ward schema session open`
    still documents `purpose` as a string; what moved is the boundary at which the default is
    supplied, from the human's fingers to the parser.
  - **`Coordinating work · opened <time>`.** The first draft recorded
    `interactive workspace
    session`, lowercase, with nothing appended, on the argument that the
    record already carries `openedAt` and a purpose restating it would be a second home for a fact.
    The owner's review turned that around: a session opened to receive work is _for_ coordinating
    it, so the phrase should say so, and the instant belongs in the purpose because that is where a
    human reads it — two such sessions in a `ward status` list read apart by their purpose alone,
    without a column look-up. The one-home rule holds: the instant is `openedAt` itself, formatted
    to the second, never a second clock read, so the two can never disagree.
  - **Task scope keeps requiring a purpose.** Several sessions can run against one task — drive the
    feature, answer review, chase a flaky check — and on the task's session log the purpose is what
    tells them apart; the task record's own purpose says what the _task_ is for, not what _this
    episode_ is for. At workspace scope there is one thing the session can be for, which is why the
    default is honest there and would be a placeholder here. The cost is the asymmetry the help line
    has to explain; it is one sentence, and the refusal names the exact invocation. This is
    reversible in one line of `openSession` if the task-scope launch
    ([0032](https://github.com/crumley/ward/pull/68), in flight) makes a default wanted there. The
    owner affirmed the asymmetry on review: when you open a task, you have a purpose in mind.
  - **A shorthand, not a verb.** `ward workspace session NAME` was the alternative: discoverable
    under `--help`, one place for the resolution. It lost on the two things the shorthand is for. A
    verb cannot `cd` the calling shell — the human would return from the agent to wherever they
    started, which is not the workspace they were just working in — and the only picker Ward has
    runs in the shell layer by [0025](../0025-fish-shell-layer/README.md)'s design, so a verb that
    offered one would have to grow the in-process picker 0025 deferred. The verb that does the
    recording and launching already exists; `wws` is plumbing to it, which is what a shorthand is.
  - **`wws`.** The set reads `w` + noun initial + verb: `wrr` (repo refresh), `wrcd` (repo cd),
    `wwcd` (workspace cd). `wws` is workspace session — three letters, the pattern kept, and typed
    after `wwcd` it is the same hand shape. `wwso` (session open) and `wwa` (agent) were considered;
    the first spends a letter on a verb the noun implies, the second names the process rather than
    the record.
  - **The first argument is the name unless it is a flag.** `wws --purpose "…"` must mean the
    default (or picked) workspace with a purpose, not a workspace named `--purpose`. The rule is one
    `string match` and it makes every other argument free: `wws main t3` passes `t3` as TASK,
    honestly, and whatever `session open` learns to take next passes through with no edit here.
  - **The resolution moves into `__ward_workspace_root`; `wwcd` is rebuilt on it.** The alternative
    — `wws` carrying a copy of `wwcd`'s fifteen lines — was the smaller diff and was rejected for
    the reason the catalog exists: two shorthands that reach a workspace must not hold two answers
    to "which one?", or the day one learns a ladder the other silently does not. The cost is real
    and it is the deliverable kind: every adopted `wwcd` now reads `changed` in doctor, and
    re-adopting it is the remedy 0027 built. The stderr line (`going to the default workspace`) is
    kept verbatim, so nothing that read it changes.
  - **`cd` in the calling shell, before the open.** The launch is foreground; when the agent exits,
    the human is standing in the workspace, exactly where `wwcd` would have left them — and
    `ward
    session open` needs to stand in a workspace anyway, so the `cd` is not a courtesy but
    the mechanism. Ordered so that a name that resolves to nothing returns before any `cd`: a
    session is never opened in the wrong directory by a shorthand that half-ran.
  - **The default is supplied beside the parser, not inside `cmdSessionOpen`.** `sessionPurpose`
    sits next to the `session` parser and is applied at the dispatch line, so the handler's three
    paths are untouched. Partly for the boundary — a default is a parse-time fact, and the handler
    should receive a purpose the way it always has — and partly because 0032 rewrites that handler
    in flight: shaping this entry to leave it alone is what lets both land in either order.
- **Layout:** the catalog (`src/shell/shorthands.ts`) gains one helper and one shorthand; nothing
  else in `src/shell/` changes but comments, because both assemblies and every surface that lists
  the set were table-driven by 0027. The default lives in `src/workspace/sessions.ts` beside the
  workspace-scope open it belongs to; the resolver lives beside the parser in `src/cli/index.ts`.
  Tests extend the suites that own each surface. **Relationship to the session entries:** this sits
  beside [0029](../0029-launched-sessions/README.md) (it changes what the human must supply to the
  verb 0029 built, not how it launches), touches nothing
  [0031](https://github.com/crumley/ward/pull/67) designs (hosting), and is shaped to rebase around
  [0032](https://github.com/crumley/ward/pull/68): the two edit the same manifest bullet list and
  the same lineage tail with an identical outgoing fingerprint, which is a conflict that resolves by
  keeping both, and nothing else overlaps.
- **Mechanisms:** _`wws NAME …`:_ `__ward_workspace_root NAME` prints the root
  (`ward workspace
  path` by name; the picker, prefilled, when that fails or nothing was named; the
  default when there is no picker either) → `cd` → `command ward session open …` with the rest of
  argv → Ward records, launches, waits, prints the resume line; the shell is left in the root. _The
  purpose:_ the parser accepts `--purpose` or nothing; `sessionPurpose(task, purpose)` returns the
  text, the default, or throws the task-scope refusal; `cmdSessionOpen` receives a string as before.
  _Upgrade:_ the manifest's outgoing bytes are a known default, so a workspace still carrying them
  untouched is `stale` and brought forward by `ward workspace upgrade`.
