# v1 Scope — the first working version

> **Status:** drafted in iteration 1 (2026-06-22). Revised as the build learns; material changes
> logged in [`LOG.md`](LOG.md).

The explicit boundary of the first fully working version of Ward. The guiding question for every
in/out call is the prime directive: which choice best lets us exercise the **core** of the intent
end-to-end without drowning the first build in breadth? v1 builds the **spine** — the store, domain
model, identity, lifecycle, and the noun/verb CLI — and drives the entire
[walkthrough](../intent/03-walkthrough.md) as real commands against a real on-disk workspace, with
the fuzziest seams implemented **thinly but really** (each demonstrating its load-bearing invariant)
rather than fully.

## In scope

The smallest set of capabilities that makes Ward genuinely run the walkthrough end-to-end:

1. **Metadata store core** — markdown files with Zod-typed, runtime-validated front matter;
   directory nesting = scope containment; deterministic (canonical) serialization; append-only event
   logs as one-file-per-entry (structural no-lost-updates). Identity allocation (floor numbers, room
   codes, slugs, session ids). [metadata-store](../intent/02-subsystems/00-metadata-store.md)
2. **Workspace lifecycle** — `ward init` creates a real, git-tracked workspace with a version stamp,
   a default persona cast, model-tier defaults, and a `.gitignore` policy. Repos registered with a
   canonical main checkout. [vision](../intent/00-foundation/00-vision.md), §14, §15
3. **Containment + sessions** — open project (floor), task, worktree (real `git worktree`), room
   (`1A1`), and sessions; close and resume them. Session lifecycle recorded as append-only events;
   state **derived** from events. [domain-model](../intent/01-concepts/00-domain-model.md),
   [sessions](../intent/01-concepts/02-sessions-and-lifecycle.md)
4. **Derived status** — project/workspace status is a query over children, never stored.
5. **Noun/verb CLI, two audiences** — Commander tree; every command renders human text by default
   and `--json` for agents; agent callers identified by an ambient env signal.
   [human-shell](../intent/02-subsystems/07-human-shell.md)
6. **Briefs, dispatch, wake** — recorded-first; wake armed/satisfied; re-armed on recovery.
   [messaging](../intent/02-subsystems/02-messaging-coordination.md)
7. **Idempotent lifecycle hooks** — worktree setup/teardown (dependency init marker + theme apply),
   validate-on-resume, no-op if satisfied.
   [work-lifecycle](../intent/01-concepts/03-work-lifecycle.md)
8. **Visual theming** — deterministic, collision-free accent + per-type glyph, recorded as a
   nameable attribute. [theming](../intent/02-subsystems/05-visual-theming.md)
9. **Privacy translation gate** — a single upstream gate that re-authors local content for a remote
   destination, stripping persona names, local paths, and internal front matter.
   [remote-provider](../intent/02-subsystems/06-remote-provider.md), §4
10. **Stub remote provider** — link task ↔ remote item, track PR status (open→approved→merged),
    merge/post are **gated** actions requiring authority.
11. **Scope-boundary reflection** — on task close, a chunk→distill→roll-up pass producing a proposal
    artifact and advancing a reflection cursor.
    [reflection](../intent/01-concepts/04-reflection-and-evolution.md)
12. **Cold-start recovery** — enumerate sessions, keep open-not-closed, re-attach via harness
    handle, re-arm wakes, re-validate hooks; closed stays closed.

## Deferred (with why)

- **Real agent harness execution.** v1 ships a **stub harness** that records and resolves a real
  harness handle (handle = harness type + native run id) and simulates resume, per the seam's "wrap
  a stub runtime but expose and resolve a recorded handle" allowance. _Why:_ the invariant is the
  recorded, resolvable handle and the open/resume/closed semantics — not actually driving a model.
  Wiring a concrete harness (e.g. Claude Code) is a thin adapter swap later.
  [agent-harness](../intent/02-subsystems/03-agent-harness.md)
- **Real session multiplexer (tmux).** v1 records liveness in the store and proves recovery rebuilds
  it; it does **not** attach real tmux panes. _Why:_ the seam says the live host is "a cache over
  the record"; v1 proves the record is authoritative and the cache is rebuildable.
  [multiplexer](../intent/02-subsystems/01-session-multiplexer.md)
- **Real forge (GitHub) integration.** v1's remote provider is a local stub. _Why:_ the
  highest-stakes part is the **privacy gate** (built for real) and the **gated-action** discipline,
  not the forge API; the adapter is explicitly thin/replaceable.
- **Interactive picker / autocomplete UX.** v1 resolves missing/ambiguous nouns deterministically
  and errors helpfully for agents; the delightful human picker is deferred. _Why:_ it's a
  human-audience affordance over the same domain calls; the core resolution logic is in scope, the
  TUI polish is not.
- **Exact-clone fork, model dispatch to real models, Ward self-migration engine.** Stubbed or
  represented as records only; not exercised end-to-end in v1.
- **Reflection breadth.** v1 does the map-reduce shape and cursor for **one** goal (scope-boundary
  on task close); the evolvable taxonomy of reflection types is deferred.

## Acceptance scenario

v1 is "working" when the [walkthrough](../intent/03-walkthrough.md) runs **for real**, reproducibly,
from a clean state, via documented CLI commands. **Status: PASSING** — the acceptance harness
[`test/acceptance/walkthrough.sh`](../test/acceptance/walkthrough.sh) runs all of §0–§10 against a
fresh temp workspace and asserts recorded state at each step (`bash test/acceptance/walkthrough.sh`
→ "ACCEPTANCE PASSED — 26 assertions"). Steps map to walkthrough sections:

| WT step          | Commands (shape)                                                                               | Proven by                                                                      |
| ---------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 0 cold open      | `ward init`; `ward repo add meal-planner <url>`; `ward status`                                 | workspace.md + version stamp; status derives "nothing in flight"               |
| 1 project        | `ward project open "meal plan exports"` → floor `1`                                            | project.md at `projects/1-…`; session-open event                               |
| 2 task           | `ward task open csv-export --repo meal-planner`                                                | task.md (local-only), success criteria; session event                          |
| 3 worktree       | `ward worktree create --task csv-export`                                                       | real `git worktree`; hooks satisfied; accent+glyph recorded                    |
| 4 room+brief     | `ward room open --worktree …`; `ward dispatch <brief> --to 1A1`; `ward wake arm --on 1A1:done` | room `1A1`; brief artifact w/ provenance; dispatch + wake records              |
| 5 deep work      | `ward session open --room 1A1 --persona student`; (stub work + real git commit)                | session events; commit on branch                                               |
| 6 report+iterate | `ward report 1A1 done`; (wake satisfied); `ward dispatch … --to 1A1`; `ward report 1A1 done`   | wake fires once; room → closed                                                 |
| 7 present+PR     | `ward task attach-remote …`; `ward pr open --task csv-export` (gated)                          | privacy-translated PR body; remote link; PR record                             |
| 8 drive merge    | `ward pr status`; `ward worktree rebase …`; `ward pr merge` (gated)                            | PR open→approved→merged                                                        |
| 9 close+reflect  | `ward task close csv-export`                                                                   | teardown hooks; reflection proposal + cursor; status derived                   |
| 10 reboot        | `ward recover` after a simulated reboot at step 6                                              | open threads re-attached, wake re-armed, hooks re-validated; closed left alone |

The exact flags harden as the slices land; this table is the contract.

## Invariants to prove by test

The durable constraints (see [`../test/README.md`](../test/README.md)), each an **intent test** that
should survive a design swap:

- A containing scope's status is **derived** from its children, never a stored field.
  (`test/intent/derived-status.test.ts`)
- **Resume is idempotent** and **closed stays closed**. (`test/intent/lifecycle.test.ts`)
- No local / personal / persona content crosses to a **remote artifact** (the privacy gate actually
  strips it). (`test/intent/privacy-gate.test.ts`)
- Session/event logs are **append-only**; concurrent writers cause **no lost updates**.
  (`test/intent/no-lost-updates.test.ts`)
