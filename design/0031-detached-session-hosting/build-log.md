# 0031 — Build log

> The journal of [`0031-detached-session-hosting`](README.md): what designing (and later, building)
> forced or revealed. One block per iteration, newest at the bottom.

## 2026-08-24 — The design, as its own reviewable unit

**Goal.** Design the multiplexer-seam arc completely enough that a builder can start from it, and
ship the design for review before any implementation exists. **What was done.** Read the governing
intent (the multiplexer seam and its neighbors: messaging, harness, theming, sessions-and-lifecycle,
scopes-and-personas, vision, principles), 0029 in full (the machinery this stacks on, and the SF-002
that names the debt), and the current code read-only (`src/agent/run.ts`, `src/harness/claude.ts`,
the session record schema, the session verbs). Surveyed the host candidates and recorded the choice
as [ADR 0006](../decisions/0006-tmux-detached-host.md) (proposed); wrote the entry — verb surface,
naming, failure semantics, scope boundaries, and the acceptance the build will be measured against.
No `src/`, `test/`, or `intent/` files were touched: this is a design-only unit, and the frictions
it surfaced went to [`spec-feedback.md`](spec-feedback.md). **What works now — with the exact
command that proves it:** the documents pass the repo's full gate — `mise run check` (Biome +
dprint + `tsc --noEmit` + `bun test` + lychee + actionlint) → exit 0 on this branch. **Decisions.**
All recorded under the entry's Design. **Next.** Human review of the entry and ADR 0006; on
acceptance, the build proceeds against the Scope and Acceptance stated there.

## 2026-08-25 — The prior-art sweep, absorbed

**Goal.** Test the proposed design against comparable systems before it is reviewed, and rewrite it
wherever the evidence changed the answer. **What was done.** Eleven systems were surveyed in source
and recorded under [`prior-art/`](prior-art/); the entry and ADR 0006 were then rewritten against
them. What the sweep forced: the host name is now **minted and recorded** rather than re-derived
everywhere — a pure function over the mutable workspace name would orphan every live session on a
rename — and consumers treat it as an opaque whole; every tmux target became **exact-match** and
destructive verbs are scoped to the `ward-` namespace; found-by-name is now **verified as ours** by
a token and generation stamp the create places inside the live half; `remain-on-exit` keeps the
run's **exit legible** without a shim, which layered liveness into host-present / process-alive /
transcript-resumable and taught every create and close path about dead panes; the **detached-init
premise** — the field reports interactive TUI agents crashing when initialized detached — became the
build's named first validation step, with its pivot stated in advance and the hosted session
explicitly sized; probe failures became **"could not determine"**, never "not running"; the hosted
spawn moved **strictly after the store-lock release**; and the `--continue` fallback and
`new-session -A` were recorded as considered and declined. Newly deferred, each with its why and
named consequence: the handle-freshness refresh channel, `release`, and fleet roll-up. Two new
frictions went to [`spec-feedback.md`](spec-feedback.md) (SF-005, SF-006), and ADR 0006 was amended
in place — still proposed — with the caveats the survey added to the tmux choice. **What works now —
with the exact command that proves it:** the rewritten documents pass the repo's full gate —
`mise run check` → exit 0 on this branch. **Decisions.** All recorded under the entry's Design,
cited to the prior-art file that justified each. **Next.** Human review of the rewritten entry and
amended ADR; on acceptance, the build starts with the premise validation.

## 2026-10-16 — Regrouped: one floor host per floor

**Goal.** Re-decide the grouping the entry had deferred, now that the work it hosts is coordinated
per floor: long-lived floor-scope sessions (0051 floor-scope-sessions) that start further sessions
for their floor's tasks, with the parent recorded on each (0052 session-parent-link). **What was
done.** The one-host-per-session decision was superseded in place, with what it bought kept on the
record: one **floor host** per floor, one window per session, floor 0's windows linked into every
floor host, placement derived from the record (own floor, or a non-zero parent's). What the
regrouping forced, each now a decision under Design: window identity by **window-option tag**
(`@ward_session`, `@ward_epoch`, `@ward_pane`) instead of a derived name, since window ids are not
derivable and titles are rewritten — the dmux rebinder is the cost avoided; ownership moved off the
tmux session environment, which a floor host shares and which every later window would inherit, so
`WARD_AGENT` is now pane-only via `new-window -e` and verification reads window and host options;
the host is found by **stamps** (`@ward_workspace`, `@ward_floor`) and its name minted only when the
floor has none, which let the record **drop** `hostName` — `host` alone remains; attach goes through
a **grouped view** so it never moves another client's current window; observe is a **single-window
read-only view** built with `link-window -k`, after `attach -r` of the floor host (wrong grain),
`capture-pane` (a poll, not a view), and `pipe-pane` (size-garbled, one pipe per pane) were weighed;
close kills the window and the host only when nothing of its own remains, relying on tmux unlinking
rather than killing floor-0 windows at `kill-session`; and since windows have no unique names to
arbitrate a race, the probe-and-create moved **inside the store write** — safe because Ward's store
lock is a link(2) lockfile holding no descriptor, which also retires the first version's
spawn-after-release rule (that hazard was a flock's). One new friction went to
[`spec-feedback.md`](spec-feedback.md) (SF-007, grouping by lineage), the six existing SFs were
re-read against floor hosts and moved to one `**Status:**` line each, all still pending, and ADR
0006 was amended in place, still proposed. **What works now — with the exact command that proves
it:** `env -u WARD_AGENT mise run check` → exit 0 on this branch. **Next.** Human review of the
regrouped entry; on acceptance, the build starts with the premise validation.
