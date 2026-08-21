# 0023 — Global configuration and the machine-level workspace registry

> Ward grows a per-user axis: preferences under `$XDG_CONFIG_HOME/ward/`, and a registry of the
> machine's workspaces under `$XDG_STATE_HOME/ward/` with a default and most-recently-used ordering
> — so `ward` answers from **any** directory, not only from inside a workspace.
> `workspace
> register|unregister|list|default` maintain it; `workspace path` and `repo path` print
> absolute paths a shell can use directly. All of it is convenience: every file here can be deleted
> without losing anything about the work, which is the constraint the whole entry is designed under.
>
> **Status:** accepted · **Started:** 2026-08-21

The human-shell contract has always named two configuration axes and Ward had only one of them — the
workspace-local record. This entry builds the **global** axis, and with it the thing the global axis
makes possible: Ward answering `where is my workspace?` and `where is that repository?` from a cold
shell in `$HOME`. That is the foundation a fish shell layer (a stacked task) stands on, since a
shell function can only `cd` somewhere Ward can name.

It is also the first state Ward keeps **outside** a workspace, so it lands against the sharpest
boundary in the intent — and most of the decisions below are that boundary, applied.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _Opinionated configuration, global
  and workspace-local_: the global axis, built. Also _Workspace- and scope-aware from any working
  directory_, extended one step past the walk-up: the registry is what lets Ward answer when the
  walk finds nothing, and the clause's own §8 asymmetry decides who gets that (a human, echoed; a
  declared agent, refused). _Verbs read true to the operation_ governs the nouns: `register` and
  `unregister` act on the registry, `path` prints a path, and neither pretends to touch a workspace.
  The **guided setup** the same slice describes is explicitly out of scope (below).
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the **global-state
  boundary**, verbatim: "global state may hold preferences and conveniences only — never anything
  the understanding or resumption of work depends on." Every design decision here is checked against
  it, and the entry answers the slice's own open question — _More than one workspace on a machine …
  whether Ward may keep a machine-level registry_ — with a build (SF-001). Also _Identity_
  ([`domain-model`](../../intent/01-concepts/00-domain-model.md)): a workspace is identified by its
  **location**, which is why entries are keyed by path and names are only labels.
- [`principles`](../../intent/00-foundation/01-principles.md) — §3 (self-sufficiency: nothing here
  may become load-bearing for recovery); §6 (a deterministic resolution order, and idempotent
  registry verbs whose repeat is a visible no-op); §8 (the fallback is a human affordance, the path
  verbs serve both audiences); §17 (recency is **derived** from timestamps, not maintained as an
  order; the whole-document rewrites are serialized); §20 (every global file degrades to "no
  preferences" / "no registry" at the point of use, and doctor names the break and its remedy — both
  halves of the loop).
- [`store-stack`](../decisions/0005-store-stack.md) (ADR) — the global files are ordinary store
  documents: YAML front matter, zod-validated, written by staging and renaming.

## Scope

- **In:**
  - **Two directories, XDG-conventional** (`src/global/paths.ts`): preferences in
    `$XDG_CONFIG_HOME/ward/` (default `~/.config/ward/`), machine state in `$XDG_STATE_HOME/ward/`
    (default `~/.local/state/ward/`). A relative `XDG_*_HOME` is ignored, as the basedir spec
    requires. `WARD_CONFIG_DIR` / `WARD_STATE_DIR` override both — the hermeticity seam every test
    uses, so no test reads or writes the machine's real `$HOME`.
  - **Global configuration** (`src/global/config.ts`): `config.md`, front matter as the settings
    tree, so a dotted key is its path through the document. Ships with `repo.refresh.stash`
    (boolean) validated and defaulted; **not wired into `ward repo refresh`** — the flag that reads
    it is a parallel task's, and this entry deliberately does not touch that code path.
  - **The workspace registry** (`src/global/registry.ts`): `workspaces.md` — entries of
    `{name, path, registeredAt, lastUsedAt?}`, a `default` pointer, MRU order derived from the
    timestamps. Verbs: `ward workspace register [PATH]` (idempotent; the first registered becomes
    the default), `unregister NAME|PATH`, `list` (`--json`, MRU-ordered, default marked, stale
    flagged), `default NAME|PATH`.
  - **MRU maintenance**: every invocation from inside a registered workspace notes recency — with
    two rules that keep it off the hot path and off the critical path: a workspace already at the
    head of the order is not rewritten, and no failure here ever reaches the command. A completion
    callback is machinery, not usage ([0022](../0022-shell-completion/README.md) SF-002), so it
    never churns the order.
  - **Resolution from anywhere** (`src/cli/index.ts`, `src/global/locate.ts`): standing inside a
    workspace always wins; standing nowhere, a **human** gets the default (else most recently used),
    echoed on stderr, and a **declared agent** is refused, exactly as cwd task derivation refuses it
    ([0006](../0006-scope-from-cwd/README.md)).
  - **The two path verbs**: `ward workspace path [NAME]` and
    `ward repo path NAME
    [--workspace NAME]`, both working from any directory, both printing
    **nothing but the path** on stdout, both with a `--json` shape in the registry. `repo path`'s
    search order is current → default → MRU, first workspace whose record registers the name wins,
    and a crossing is echoed on stderr.
  - **Completion** for the new nouns (`src/cli/suggest.ts`): registered workspace names (with their
    paths, and `(stale)` where that is true), and repository names unioned across exactly the
    workspaces `repo path` would search, cued by the workspace that would answer.
  - **Doctor**, two machine-level findings: the global config's state (absent → defaults, unreadable
    → warn with the reason, present → the resolved values) and the registry's (absent, unreadable,
    or the count with the stale entries named and the remedy). Never `error`: a convenience cannot
    make a machine unhealthy.
  - **Serialized, atomic, non-fatal writes**: the store's own lock primitive, parameterized by site
    (`src/store/lock.ts`), and `writeDocument`'s staging directory made overridable
    (`src/store/document.ts`) so a document outside a workspace can still be written atomically.
- **Deferred:**
  - **The guided setup wizard** (`ward setup`) the same intent slice describes. _Why safe:_ this
    entry builds what a wizard would edit — a validated schema, stated defaults, an inspect-read
    that reports both value and provenance — and a wizard with nothing to configure would have been
    scaffolding. Nothing here is shaped to preclude it.
  - **Writing the config file** — there is no `ward config set`. _Why safe:_ the file is optional
    and hand-editable, every key resolves to a default without it, and the write path already exists
    (`writeGlobal`) for the setup verb that will own it. Inventing a second configuration-editing
    surface before the guided one would be the drift the four-leg discipline warns about.
  - **Wiring `repo.refresh.stash` into `ward repo refresh`.** _Why safe:_ a parallel task is
    changing that verb's internals; the key exists and validates, and the one-line read is a
    follow-up PR with no schema change.
  - **Auto-registering on `ward workspace create`.** _Why safe:_ creation is a located, deliberate
    act on a directory; making it write machine-level state as a side effect would put a global
    write inside a workspace-local verb, and `ward workspace register` is one line of the same
    session. Revisit if telemetry says everyone types it.
  - **Workspace-local configuration** (the other half of the intent clause) and precedence between
    the two layers. _Why safe:_ the workspace already carries its own record; the layering question
    ("later wins", and what an agent does when layers disagree) is an open question in the intent
    itself, and answering it needs a second axis with real keys in it.
  - **A "where am I?" form of `workspace path`** — with no NAME the verb means the **default**, not
    the workspace the caller happens to stand in. _Why safe:_ the shell layer's `wcd` with no
    argument means "take me to my default", which is the useful reading; a caller who wants the root
    of the workspace they are already in is asking a different question (the walk-up's answer), and
    inventing a spelling for it before the shell layer needs one would guess at its shape.
  - **A registry entry richer than name + path** (last-status caches, per-workspace preferences).
    _Why safe:_ every field added is a field the boundary must be re-argued for; nothing yet needs
    one, and a cache of workspace state would be exactly the "recovery depends on global state"
    failure §3 forbids.
- **Acceptance:** `mise run check` green, and the two new suites proving: registry CRUD and its
  idempotency; MRU ordering (and that the head-of-order touch writes nothing); default resolution
  and the hand-off when the default is unregistered; a stale entry reported, skipped, and refused by
  name; `repo path`'s search order across three arrangements; the fallback echoed for a human and
  refused for a declared agent; the path verbs' stdout being exactly one path; a corrupt file and an
  unwritable directory both degrading to "no registry" without failing a command; and the XDG/env
  path table.

## Design

- **Decisions:** no new ADRs — [ADR 0005](../decisions/0005-store-stack.md) already decides the
  document stack, and this entry extends its reach rather than choosing again. Entry-local:
  - **Two files, split by write frequency, not by topic.** Preferences are hand-tended and rarely
    written; the registry is machine-written on registration and on recency. Putting them in one
    file would mean rewriting a human's configuration on every workspace switch — and would make
    "delete the machine state, keep my preferences" impossible. This is exactly what the XDG split
    between `config` and `state` is for, so the split is the spec's, not an invention.
  - **The default lives in the registry, not in the config.** Setting a default is a deliberate
    human act, which argues for "preference"; but a default is a **pointer into the entry set** —
    naming a workspace that is not registered means nothing — and splitting a pointer from its
    target across two files makes an incoherent state representable, and a two-file join necessary
    to read one answer. In one document the incoherence is unrepresentable and the read is one file.
  - **Markdown documents, like every other record.** Front matter + prose body, through the same
    `readDocument`/`writeDocument` the store uses: one validation path, one atomic-write path, one
    error vocabulary — and a human who opens `~/.local/state/ward/workspaces.md` finds a paragraph
    telling them the file is a convenience they may delete. A bare JSON/TOML file would have been
    fewer characters and a second serialization story.
  - **`writeDocument` takes a staging directory instead of assuming `.ward/tmp/`.** The atomic
    rename needs a staging dir on the same filesystem; for a workspace that is `.ward/tmp/`, for a
    global file it is `<dir>/tmp/`. One optional parameter, no behavior change, versus a second
    atomic-write implementation that would drift from the first.
  - **One lock primitive, parameterized by site.** The registry's read-modify-write is precisely the
    shared write §17 says must be serialized, and the store's lock already solves it with legible
    contention, fail-safe takeover, and a bounded wait. Reusing it (a `LockSite`) beats a second,
    subtly different contention story in the same codebase. The global site takes a shorter bound
    (5s, and 1s for a recency touch): nothing here is worth stalling a command for.
  - **Recency is derived, not maintained.** Entries carry `lastUsedAt`; the order is computed from
    it (falling back to `registeredAt`, ties broken by path). §17's first bias — derive shared state
    rather than store it — applied to an ordering: two writers can never disagree about "the order",
    because nobody writes it.
  - **The head-of-order touch writes nothing.** Recency exists to order the list, so re-touching the
    workspace already at the head changes no answer. A day of work in one workspace writes the
    registry once; the steady state is one small read per invocation. This is what makes an
    every-invocation MRU affordable at all — and it is a correctness-preserving optimization, not a
    staleness trade, because the derived order is identical either way.
  - **Awaited, not fire-and-forget.** The touch runs before the parser, awaited. A detached promise
    would race the `process.exit()` several verbs call, making the write happen or not depending on
    which verb ran — nondeterminism (§6) in exchange for microseconds.
  - **Entries are keyed by path; names are labels.** Identity is location (domain model), so
    re-registering the same path converges rather than renaming, and two workspaces with the same
    basename get `alpha` and `alpha-2` rather than a refusal. A name collision is not a conflict
    worth spending the human's attention on.
  - **The first registration becomes the default.** A registry holding one workspace and no default
    would make `ward workspace path` fail with nothing the human could act on. Later registrations
    do not steal it — `ward workspace default` is how it moves.
  - **Unregistering the default hands it on.** To the next most recent, so the machine keeps
    answering. A dangling default would degrade every later fallback for no reason the human caused.
  - **The fallback is human-only; the path verbs are not.** The fallback is an _implicit_ input —
    the same class as inferring a task from the cwd, and 0006's argument transfers exactly: an
    agent's cwd is incidental state its harness manages, and letting a machine-level preference
    choose the target of a _mutation_ is silent mis-targeting. `workspace path` and `repo path` are
    the opposite: the registry is not an inference there, it is the **subject** of the query, which
    is why both audiences may ask them from anywhere.
  - **The fallback echo goes to stderr always** (0006 echoed to stdout when not `--json`). _Why the
    difference:_ these answers are substituted into shell commands, and a second stdout line would
    land in the caller's argument. stderr keeps stdout to exactly what was asked for, in both modes.
  - **`repo path` names its workspace only when the answer crossed one.** Standing in a workspace
    and getting its own repository is not an implicit input; getting another workspace's is. Echoing
    always would make `cd (ward repo path x)` noisy in the common case and train the human to ignore
    the line that matters.
  - **A registered repository with no checkout errors rather than printing its path.** The record
    claims it, the world does not have it, and handing a shell a path that is not there is the wrong
    kind of honesty — the message names `ward workspace restore` (§20).
  - **Stale entries are reported, skipped, and refused — never pruned.** Doctor and `list` say so,
    resolution passes over them, `workspace path NAME` refuses one by name. Ward does not delete a
    human's entry because a directory is missing today (the repair posture: report all, repair only
    the local and reversible, and this one is ambiguous — a stale path is as likely an unmounted
    disk as a deleted workspace).
  - **Explicit writes throw; implicit writes swallow.** A caller who _asked_ to register is owed the
    truth if it did not happen (a legible `WardError` naming the file); the recency touch nobody
    asked for is silent on failure. Both are §20 — the difference is who is waiting for an answer.
  - **`pathVerbShapes`, a third registry group.** The read-verb schema table derives each verb's
    argv from its key alone; `workspace path` and `repo path` take identities and answer from
    machine state, so they get their own group in `src/cli/schema.ts` and their live proof in this
    entry's suite — the same split the mutation verbs already have. `jsonVerbShapes` still holds
    everything, so `ward schema` and completion are unchanged.
- **Layout:** new `src/global/` — `paths.ts` (XDG + overrides), `store.ts` (the three-state read,
  the throwing write, the lock site), `config.ts` (schema, defaults, `inspectConfig`), `registry.ts`
  (schema, CRUD, MRU, `resolutionOrder`), `locate.ts` (`locateWorkspace`, `locateRepo`,
  `searchOrder`). Changed: `src/store/document.ts` (`stageIn`), `src/store/lock.ts` (`LockSite`,
  `withLock`, `inspectLock`; `withStoreLock` unchanged in behavior), `src/cli/index.ts` (nine new
  commands, `requireWorkspace` now async and registry-backed, the MRU touch), `src/cli/schema.ts` +
  `json.ts` (four shapes), `src/cli/suggest.ts` (two suggesters), `src/cli/telemetry.ts` (the verb
  tree), `src/workspace/doctor.ts` (two findings), `test/helpers.ts` (the hermetic global-dir pin
  every suite inherits). Tests: `test/global/registry.test.ts` and `test/cli/global.test.ts`.
- **Mechanisms:**
  - _Read:_ `readGlobal` returns `absent | read | unreadable(reason)`; the point of use takes the
    honest bit, doctor takes the reason — and `viewRegistry` carries one bit of it further, so a
    surface with an empty list never tells a human "nothing is registered" when the truth is "the
    file would not parse".
  - _Write:_ read under the lock → change → `writeGlobal` (stage in `<dir>/tmp/`, rename) → report
    the entry as it now reads. Any non-`WardError` failure (unwritable directory, unbreakable lock)
    is converted to one sentence naming the file and the stake.
  - _Resolution:_ `discoverWorkspace(cwd)` → if null and human → `resolutionOrder(listWorkspaces())`
    → echo → root. `repo path`: `searchOrder(cwd, --workspace)` → first workspace whose
    `listRepositoryNames` holds the name → `checkoutPath`.
  - _Recency:_ read → if this workspace already leads, stop → else lock, re-read, stamp
    `lastUsedAt`, write.

## Build log

### 2026-08-21 — The whole entry in one iteration

**Goal.** Everything in Scope. **What was done.** Read the governing intent and the two precedents
this entry leans on (0006's derivation echo and agent refusal; 0022's completion contracts and its
telemetry rule) before designing. Then, in order: the XDG paths and their env seam; the three-state
global read and the throwing write; the lock's site parameterization and `writeDocument`'s staging
option (both proven by the untouched existing suites); the config schema and defaults; the registry
document, its CRUD, derived MRU order and resolution order; `locate.ts`; the nine CLI commands and
the async, registry-backed `requireWorkspace`; the two suggesters; the two doctor findings; and the
hermetic global-directory pin in `test/helpers.ts`, which is what keeps every pre-existing suite
from touching the developer's own registry.

**What works now — with the exact commands that prove it** (Bun 1.3.14, git 2.54.0, Linux):

- **Dogfood, in a scratch tree** (`WARD_STATE_DIR`/`WARD_CONFIG_DIR` pinned, two workspaces `alpha`
  and `beta`, a bare remote registered as `demo` in beta):
  - `ward workspace register` in alpha → `registered alpha /tmp/…/alpha (default)`; again →
    `unchanged …`; in beta → `registered beta …` with no star.
  - `ward workspace list` → `beta` first (registered later), `* alpha` — then, after
    `ward task list` inside alpha, `* alpha` first: the MRU order moved and the default did not.
  - `ward workspace path` → `/tmp/…/alpha` alone on stdout; `ward workspace path beta` →
    `/tmp/…/beta`.
  - `ward status` from `/tmp` → `workspace alpha — /tmp/…/alpha (from the registry)` on **stderr**,
    the ordinary status on stdout. `WARD_AGENT=1 ward status` from `/tmp` → exit 1,
    `a declared agent stands in one explicitly`.
  - `ward repo path demo` from `/tmp` → the echo on stderr and `/tmp/…/beta/repos/demo` on stdout —
    the search passed the default and found beta. `ward repo path nope` → exit 1 naming both
    workspaces it searched.
  - `ward workspace default beta` → `default set beta …`; `ward workspace unregister beta` →
    `unregistered beta …`, and `ward workspace list` shows `* alpha` — the default was handed on.
  - The written registry is a legible document: front matter with `default:` and the entry array,
    body prose stating that the file is a convenience and may be deleted.
- **No lost updates under real concurrency:** five `ward workspace register` runs launched in
  parallel from five different workspaces → five `registered` lines and a `ward workspace list` of
  exactly five entries, the first still holding the default. Whole-document rewrites, serialized on
  the shared lock (§17).
- `bun test test/global/registry.test.ts` → `28 pass, 0 fail`.
- `bun test test/cli/global.test.ts` → `16 pass, 0 fail`.
- `bun test` → `381 pass, 0 fail, 1559 expect() calls` across 37 files, from `332 / 1403 / 35` at
  this branch's base ([0022](../0022-shell-completion/README.md)'s count, re-measured by stashing
  this entry). **No existing case changed:** 44 of the 49 new cases are this entry's two suites, and
  the other five appeared in the existing schema tables by themselves, from the four new registry
  rows — the one-place growth [0008](../0008-json-shape-home/README.md) designed for.
- `mise run check` → exit 0 (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).

**Decisions** (found while building, all recorded under Design → Decisions): the head-of-order touch
rule came out of asking what an MRU write per invocation would cost, and it turned out to be
free-of-charge rather than a trade — the derived order is identical either way. Two bugs worth
recording so the next builder does not re-introduce them: (1) `{...record, ...maybeDefault}` cannot
_remove_ a key, so unregistering the last workspace left a dangling `default` — the record is now
rebuilt explicitly rather than spread; (2) a raw `EACCES` out of the lock's `mkdir` escaped as a
stack trace from a convenience, which is exactly the failure §20 forbids, so every non-`WardError`
from a registry write is now converted at one seam.

**Next.** In dogfood order: the fish shell layer this entry exists for (`wcd`, `wrepo` and friends,
built on the two path verbs); wiring `repo.refresh.stash` into `ward repo refresh` once its parallel
entry lands; the workspace-local configuration axis and the precedence rule between the two; and the
guided `ward setup` that edits both.

## Spec-feedback

- **SF-001** — [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md), _Open
  questions_ → "**More than one workspace on a machine.** Whether that is expected, and whether Ward
  may keep a machine-level registry of workspaces — which would be state outside the workspace and
  must be reconciled with the global-state boundary above." _Friction:_ the question is open, and
  this entry answers it by building. Building against an open question is exactly what the ledger
  rule exists to surface, so it is recorded rather than quietly settled. _Assumption to keep
  moving:_ more than one workspace per machine **is** expected (the bootstrap workspace plus any
  other project's is the ordinary case), and a registry is permitted **because it survives the
  boundary test**: every field in it is derivable by standing in a workspace and reading it, nothing
  in any workspace's record refers to it, and deleting it costs shortcuts only. The entry enforces
  that structurally — resolution never _requires_ the registry (the walk-up always wins and always
  suffices), and every read degrades to "no registry". _Proposed revision:_ close the open question
  in the slice, stating (a) that multiple workspaces per machine are expected, and (b) that a
  machine-level registry is permitted **under a stated test** — it may hold only what is derivable
  from the workspaces themselves, and no verb may depend on it for correctness — with a pointer to
  this entry as the worked instance.
- **SF-002** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _Workspace- and
  scope-aware from any working directory_. _Friction:_ the clause is written entirely about being
  **inside** a workspace ("invoked anywhere inside an initialized workspace … Ward discovers the
  workspace itself, with no flag and no 'which workspace?' prompt"), and says nothing about being
  outside one — where the same sentence's own reasoning applies just as hard: a human in `$HOME` who
  has exactly one workspace is being made to restate what their machine already implies. The slice
  also forbids "which workspace?" as a **prompt** without saying whether a _silent_ answer is
  permitted. _Assumption to keep moving:_ the constraint extends outward with the asymmetry it
  already carries — outside a workspace a **human** gets the registry's answer, never as a prompt
  and never silently (it is echoed on stderr, the 0006 derivation-echo precedent), while a declared
  **agent** is refused and must stand in a workspace explicitly; and the two `path` verbs are
  excluded from the refusal because there the registry is the subject of the query, not an inference
  about the caller's location. _Proposed revision:_ add one paragraph to the clause covering the
  outside-a-workspace case: Ward may resolve to a **registered default** for a human caller, must
  **echo what it resolved**, must not prompt, and must refuse the resolution to a declared agent —
  plus the carve-out that verbs whose _purpose_ is to answer about the registry serve both audiences
  from anywhere.
- **SF-003** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), _Opinionated
  configuration, global and workspace-local_. _Friction:_ the slice names the two axes and the
  quality bar, but leaves unstated the thing a builder most needs: **what may live on the global
  axis**. The answer turned out to live in a different slice
  ([`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md)'s global-state
  boundary), and the two are not cross-linked — so a design could satisfy the configuration clause
  in full while quietly putting resumption-critical state in `~/.config`. _Assumption to keep
  moving:_ read them as one constraint — global configuration is preferences and conveniences,
  bounded by the lifecycle slice's rule — and design every global file so that deleting it loses
  nothing but shortcuts. _Proposed revision:_ one sentence in the configuration clause pointing at
  the global-state boundary as its governing limit ("what may live on the global axis is bounded by
  [`06-workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md): preferences and
  conveniences only"), so the constraint is discoverable from the slice a CLI builder starts in.
