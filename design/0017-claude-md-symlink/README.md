# 0017 — CLAUDE.md is a symlink to AGENTS.md

> `workspace create` lays a relative symlink `CLAUDE.md → AGENTS.md` at the workspace root, so
> Claude Code — the harness actually operating these workspaces today — reads the guidance the
> workspace already ships, with one source of truth and nothing duplicated to drift. A pre-existing
> `CLAUDE.md` of the human's own is never overwritten, and a new `claude guidance` doctor finding
> names the three states — the absent case is deliberately the first concrete **workspace migration
> target**, bridged by an `info` finding carrying its one-line remedy until the upgrade machinery
> exists.
>
> **Status:** accepted · **Started:** 2026-08-12

The workspace's root `AGENTS.md` is its guidance surface for agents — but Claude Code reads
`CLAUDE.md`. The guidance exists and the reader misses it: an agent started at the root of a
pre-0017 workspace loads none of Ward's operating rules, which is exactly the "expect them to behave
differently" degradation the lifecycle intent tells doctor to name. A relative symlink gives the
harness its expected filename without a second file whose content could drift (§16). And the shape
is chosen deliberately: workspaces created before this entry lack the link, the
update/reconciliation machinery that would carry it to them is a future arc — so this entry creates
the first well-formed "a workspace created before X lacks X" target and the honest doctor bridge to
it (§20).

## Serves intent

- [`context-loading`](../../intent/01-concepts/05-context-loading.md) — context loads from
  **harness-neutral `AGENTS.md` files**; the workspace stays standardized on that name. The symlink
  is how neutrality survives contact with a harness that insists on its own filename: the guidance
  still lives in `AGENTS.md`, and the harness-specific name is one relative link — an adapter, not a
  second guidance file (§5).
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — creation as
  idempotent establishment steps; **re-running create converges, never clobbers**, and a customized
  artifact is the human's (the link's never-overwrite corner is that posture applied). The
  update/reconciliation arc this entry pointedly does not build is what makes the absent case a
  **migration target** rather than a bug.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the doctor constraint:
  report-and-recommend, guiding the user beats failing cryptically. Plus
  [`principles`](../../intent/00-foundation/01-principles.md) §6 (repeat-safe creation), §16 (one
  recorded truth — no duplicated guidance to drift), §20 (a degraded surface's condition is one
  doctor can name, with its remedy).

## Scope

- **In:**
  - **Creation lays the bridge.** A new `claude guidance` step in `workspace create`, right after
    `agent guidance`: a **relative** symlink `CLAUDE.md → AGENTS.md` at the root, tracked in the
    workspace's own git like `AGENTS.md` itself (git stores the link as mode 120000). Idempotent: a
    correct existing link is `satisfied`; an absent one is established (also on converge re-runs —
    the pre-0017 workspace's manual path); a pre-existing regular file or a link aimed elsewhere is
    **never overwritten** — evidence of the human's own arrangement, left in place and said so.
  - **One classifier, both verbs.** `inspectClaudeGuidance()` in `src/workspace/layout.ts` folds the
    root's `CLAUDE.md` to `linked | absent | file | elsewhere`; create converges on it and doctor
    reports from it, so the two verbs can never disagree about what counts as linked.
  - **Doctor names the states.** A `claude guidance` finding: linked → `ok`; absent → `info` with
    the one-line remedy (`ln -s AGENTS.md CLAUDE.md`) and the note that a future workspace upgrade
    will carry it; a regular file or wrong-target link → `info` naming it as the human's own
    arrangement, never an instruction to delete their content. Report-only: no state is ever
    `error`, exit semantics unchanged, and no schema change — findings rows are already open
    `check`/`severity`/`message`.
  - **The manifest explains the link.** One line in the installed `AGENTS.md` layout section, so a
    cold reader listing the root knows what `CLAUDE.md` is.
  - **Tests:** creation produces the relative link resolving to `AGENTS.md`'s content and commits it
    as a symlink; the removed link is re-established on converge with no baseline entry; the
    never-overwrite corner (regular file, and a dangling link aimed elsewhere); doctor's four states
    as a findings table, healthy throughout.
- **Deferred:**
  - **The update/reconciliation machinery itself.** _Why safe:_ that is workspace-lifecycle's own
    future arc; this entry ships its first well-shaped target, and doctor bridges the gap with the
    exact remedy — plus re-running `workspace create` on the workspace already converges it today.
  - **Retrofitting existing workspaces from any other verb.** _Why safe:_ mutating a workspace as a
    side effect of an unrelated command is precisely what the deliberate-act rule forbids; the two
    honest paths (the remedy, the converge re-run) both exist.
  - **Other harness filenames (`GEMINI.md`, …).** _Why safe:_ the pattern generalizes trivially —
    another arm on the same classifier — and one proven instance is worth more than a speculative
    matrix; nothing operating these workspaces reads those names today.
  - **Symlink-hostile platforms.** _Why safe:_ Ward targets POSIX today (nothing in the codebase
    branches on Windows). Where a filesystem refuses the symlink, the create step throws legibly and
    every earlier step is already idempotent — re-run after fixing, nothing half-made. A workspace
    cloned onto a checkout without symlink support materializes `CLAUDE.md` as a plain file
    containing `AGENTS.md` (git's standard degradation); the classifier honestly reads that as
    `file` and doctor names it — degraded, not silent.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. a fresh workspace has `CLAUDE.md` as a relative symlink (`readlink` → `AGENTS.md`) whose
     content reads as `AGENTS.md`'s, committed as a symlink;
  2. re-running create is `satisfied` throughout; a removed link is re-established and the
     convergence commit holds the link and nothing else;
  3. a pre-existing regular `CLAUDE.md` and a link aimed elsewhere survive a converge byte-for-byte;
  4. doctor reads `ok` on the fresh workspace, `info` with `ln -s AGENTS.md CLAUDE.md` on the
     pre-0017 shape, `info` naming the human's own arrangement on both divergent shapes — healthy
     and exit 0 in every state.

## Design

- **Decisions:** no new ADRs — entry-local only:
  - **The name is `claude guidance`.** It pairs with the existing `agent guidance` step/idiom and
    names the reader served (the harness), not the mechanism (a symlink) — doctor's other checks
    name subjects, not implementations.
  - **`info` for a divergent `CLAUDE.md`, not `warn`.** 0010's warn was earned by
    "installed-but-broken is likelier a misconfiguration than a choice"; a regular `CLAUDE.md` is
    the opposite — likelier a choice than an accident (harnesses generate one on their own init
    flows), and the baseline idiom already renders customization as `info` ("yours to shape").
    Nothing is broken: Claude Code reads the file that is there. The finding names the one real
    hazard — two guidance surfaces drifting apart (§16) — and never instructs deletion.
  - **Correct means the link resolves to this workspace's own `AGENTS.md`, however spelled.** A link
    whose target reads the right guidance is not divergence, so an absolutely-spelled link to the
    same file is `linked`, not noise. The wrinkle — git records the absolute target text, which is
    machine-specific — stays the human's arrangement; creation itself always writes the relative
    spelling, which survives moving the workspace.
  - **`lstat`, not `existsSync`.** `existsSync` follows links, so a dangling symlink would read as
    absent — and creation would overwrite exactly the arrangement it promised to leave alone. A
    dangling link still _exists_ as an arrangement; only a truly absent name is Ward's to fill.
  - **No baseline entry for the link.** `sha256OfFile` follows symlinks, so a fingerprint would
    record `AGENTS.md`'s content under a second name and double-report every `AGENTS.md`
    customization as `CLAUDE.md` drift. The link's real content is its target, and the doctor check
    reads that directly — a dedicated check beats a misleading fingerprint.
  - **The step runs right after `agent guidance`.** `AGENTS.md` is (re-)established first, so a link
    laid by creation never dangles, even on the converge run that restores a stripped workspace.
  - **One line in the installed manifest.** The layout section of `AGENTS.md` now names `CLAUDE.md`;
    a cold reader listing the root sees a second guidance-looking file, and the manifest is exactly
    where "what is this file" is answered. One line; anything more would be noise.
  - **No `--json`/schema change.** The finding is one more open `check`/`severity`/`message` row
    under the existing `doctorShape`; verified riding through in the build log.
- **Layout:** `src/workspace/layout.ts` (`ClaudeGuidance`, `inspectClaudeGuidance` — the shared
  classifier beside the layout facts it reads); `src/workspace/create.ts` (`establishClaudeGuidance`
  between guidance and ignore policy); `src/workspace/doctor.ts` (`claudeGuidanceFinding` after the
  baseline checks); `src/workspace/templates.ts` (the one layout line);
  `test/workspace/create.test.ts`, `test/workspace/doctor.test.ts`, `test/cli/workspace.test.ts`
  (step count 10 → 11).
- **Mechanisms:** `inspectClaudeGuidance(root)` lstats `CLAUDE.md`: missing → `absent`; not a
  symlink → `file`; a symlink whose target, resolved against the root, is the workspace's
  `AGENTS.md` → `linked`, else `elsewhere`. Create converges only `absent` (writes the relative
  link, stages it into the converge commit); every other state is `satisfied` with a detail saying
  whose it is. Doctor maps the four states straight onto one finding row.

## Build log

### 2026-08-12 — The bridge, the classifier, the finding

**Goal.** Everything in Scope in one iteration. **What was done.** Added `inspectClaudeGuidance()`
to `src/workspace/layout.ts`; the `claude guidance` create step (relative symlink, never-overwrite,
no baseline entry); the `claude guidance` doctor finding (ok / info-with-remedy / info-yours ×2);
the manifest line in `templates.ts`; tests in `test/workspace/create.test.ts` (the link, the
converge re-establish, the never-overwrite corner) and `test/workspace/doctor.test.ts` (a four-state
findings table); step counts updated in `test/cli/workspace.test.ts`.

**What works now — with the commands that prove it** (Bun 1.3.14, macOS):

- `bun test` → `202 pass, 0 fail, 693 expect() calls` across 23 files (from 195/668 at entry start):
  the symlink is relative (`readlink` → `AGENTS.md`), resolves to `AGENTS.md`'s content, and is
  committed at git mode 120000; a removed link is re-established on converge and the convergence
  commit holds exactly `CLAUDE.md` (no baseline entry); a pre-existing regular file and a dangling
  wrong-target link both survive converges untouched; doctor's four states render ok/info/info/info
  with `report.healthy` true in all of them.
- `mise run check` → exit 0, end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Dogfood in a scratch workspace (`bun src/cli/index.ts workspace create …` outside any live
  workspace): create renders `established claude guidance (CLAUDE.md → AGENTS.md)` and `ls -la`
  shows `CLAUDE.md -> AGENTS.md`; `doctor` reads
  `✓ claude guidance — CLAUDE.md → AGENTS.md — Claude Code reads the workspace guidance`; after
  `rm CLAUDE.md` it reads the `i` finding carrying `ln -s AGENTS.md CLAUDE.md`; after writing a
  regular `CLAUDE.md` it reads `i … your own arrangement, kept`, and `doctor --json` carries that
  row under the existing findings shape with `healthy: true`; a converge re-run reports
  `satisfied claude guidance (CLAUDE.md is yours — left as is)` and leaves the file byte-for-byte.

**Decisions** (found while building): all recorded under Design → Decisions; the one worth naming —
`lstat` over `existsSync` was found by asking what a dangling user link would do to the
never-overwrite promise: `existsSync` follows links, would have read it as absent, and creation
would have clobbered exactly what it promised to leave alone.

**Next.** Natural follow-ons: the update/reconciliation arc picks this up as its first migration;
other harness filenames if one ever operates these workspaces.

## Spec-feedback

- **SF-001** — [`context-loading`](../../intent/01-concepts/05-context-loading.md), "Why
  harness-neutral (`AGENTS.md`, not a harness-specific file)". **Friction:** the slice argues for
  standardizing on `AGENTS.md` so the workspace stays portable across harnesses, but is silent on
  the case this entry hit: a harness that only reads its own filename. Taken literally, shipping any
  `CLAUDE.md` looks like the thing the section argues against. **Assumption made:** a relative
  symlink onto `AGENTS.md` preserves the neutrality the section wants — the guidance still lives in
  one harness-neutral file; the harness-specific name is an adapter with no content of its own, so
  nothing can drift and no harness is privileged in substance. **Proposed revision:** one sentence
  in that section acknowledging the adapter pattern — harness-expected filenames may be satisfied by
  links onto `AGENTS.md` without breaking neutrality — so the next harness filename is a decision
  the intent already covers.

Near-candidate, not filed: the installed-baseline mechanism
([`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md), "Divergence must be
detectable") is defined over content fingerprints, and a symlink's identity is its target, not its
content — this entry routed around it (the doctor check reads the target directly) rather than
against it, and the slice expressly leaves "how the installed baseline is recorded and compared" to
implementation, so there is no friction to report yet. If a future content-less artifact needs
upgrade-time adjudication rather than a dedicated check, that entry should raise it.
