# 0049 — `ward task list` filters: fetch the rows wanted, not the whole history

> `ward task list` takes `--slug`, `--state`, `--floor`, and `--repo`, ANDed together and composed
> with `--all`, so a question about past work returns the handful of rows that answer it instead of
> every task the workspace has ever held.
>
> **Status:** built — awaiting review · **Started:** 2026-10-03

[`0036`](../0036-floor-addressed-tasks/README.md) gave `task list` two windows: the glance (work in
flight plus anything closed within the week) and `--all` (everything). Neither answers a narrow
question about history. Finding the past tasks of one recurring kind — every `workspace-upgrade`,
say — means `--all --json` and filtering client-side. In one working workspace that is 193 tasks and
107 KB to find eight rows, and the cost grows with every task closed. The reader pays it, and when
the reader is an agent the whole document lands in its context.

A task entry is already lean, about 550 bytes, most of it the `purpose`. Trimming fields would save
a fraction of each row and still return every row. The cost scales with row count, so the fix is to
return fewer rows. The same query filtered by slug and state comes back as 8 rows in 3.6 KB.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — _Settled work leaves the
  glanceable surface, and stays retrievable_: a filter is a narrower way to ask for settled work
  back, and the listing still says what the window left out of the query it answered.
- [`principles`](../../intent/00-foundation/01-principles.md) — §8 (two audiences): the same flags
  serve a human reading the listing and an agent parsing it, and the agent section of the installed
  manifest tells agents to filter. §20 (no silent narrowing): an unmatched filter prints an empty
  listing that names the filter, and the `hidden` count stays truthful under filters.

## Scope

- **In:**
  - **Filters on `ward task list [--json]`:** `--slug TEXT` matches when TEXT is a case-insensitive
    substring of the slug. `--state active|paused|closed` is the record's state. `--floor N` is the
    task's floor. `--repo NAME` matches when the task records touching NAME. Each flag is optional
    and single-valued. Together they combine with AND and compose with `--all`. A filter that
    matches nothing returns an empty listing and exits zero.
  - **`--state closed` lifts the settled-work window on its own.** No other filter does.
  - **`hidden.tasks` under a filter** counts the tasks that matched the filter and were cut by the
    window. The human footer's command keeps the filter (`ward task list --slug upgrade --all`).
  - **Completion:** `--state` offers the three states, `--repo` offers registered repositories,
    `--floor` offers every floor, closed ones included.
  - **The manifest** gains _Ask for the rows you need_ in its agent section. The outgoing default's
    hash joins the lineage ([`0020`](../0020-deterministic-upgrade/README.md)).
- **Deferred:**
  - **Filters on `status` and `project list`.** Safe to defer because those verbs answer "where does
    everything stand?", and their windowed output is already bounded by work in flight. The
    unbounded document is the `task list --all` history, which this entry narrows.
  - **Repeatable filters (OR within a flag, e.g. active-or-paused).** Safe to defer because the
    glance already returns exactly the open tasks plus recent closes, and two calls cover any other
    union. A repeatable flag can be added later without changing what a single flag means.
  - **Echoing the applied filter in the JSON document.** Safe to defer because the caller supplied
    the filter and has it. Leaving it out keeps `taskListShape` unchanged, so `ward schema` needs no
    new version for consumers to track.
- **Acceptance:**
  1. `bun test test/cli/task-list-filters.test.ts`: a table of filter rows (each filter alone,
     combinations, `--all`, case-insensitivity, unmatched filters) asserts the addresses shown and
     `hidden` for each, with every document parsed as `taskListShape`. Also covered: the footer
     keeps the filter, an only-settled match prints just the footer, an unmatched filter names
     itself and exits zero, and an unknown state is refused.
  2. `bun test test/cli/completion.test.ts`: `task list --state|--repo|--floor` complete.
  3. `env -u WARD_AGENT mise run check` is clean.

## Design

- **Decisions:**
  - **Slug matching is a case-insensitive substring.** _Alternative:_ exact match. _Attractive_
    because it is unambiguous and cannot over-match. _Lost_ because slugs are kebab-case compounds,
    and the real question is usually about a family of slugs: `workspace-upgrade` also needs to find
    `workspace-upgrade-sessions`, and `upgrade` finds every upgrade-shaped task. An exact slug is
    still a substring of itself, so pinning one slug still works, and any extra rows are a few
    lines, not a whole history. A prefix match would miss `ward-upgrade-self-service` when asked for
    `upgrade`. _Cost:_ a short TEXT can over-match. That is visible in the result, and the caller
    narrows by adding text or another filter.
  - **`--state closed` reaches settled history without `--all`.** _Alternative:_ keep the window
    under every filter and require `--state closed --all`. _Attractive_ because one rule ("the
    window applies unless `--all`") is easy to state. _Lost_ because the window exists to keep
    finished work off a glance taken to route attention. A caller who asks for closed tasks is
    asking for finished work, which is exactly the "on request" the intent slice allows. Windowing
    that request would answer "closed tasks" with "closed tasks from this week" and a footer
    pointing at the flag the caller obviously meant. `--slug`, `--floor`, and `--repo` keep the
    window: each still matches open work, so a filtered glance is still a glance. _Cost:_ one flag
    value changes the window, which the flag's own help text states.
  - **`hidden` counts matching tasks the window cut, not tasks the filter excluded.** _Alternative:_
    keep `hidden` as the workspace-wide count of settled tasks. _Attractive_ because the number
    would not depend on the query. _Lost_ because `hidden` exists so a listing is never mistaken for
    a complete answer, and the question being answered is the filtered one. A workspace-wide count
    would report every settled task in the workspace on a `--floor 3` query whose floor hides none,
    and the footer's `--all` would then show nothing new. The caller asked for the excluded rows to
    be excluded, so they are not hidden. _Cost:_ `hidden` now depends on the query, which the
    schema's doc comment states.
- **Layout:** the filter predicate (`matchesTaskFilter`) and the rule for whether a filter lifts the
  window (`filterLiftsWindow`) sit beside `settledTask` in `src/workspace/status.ts`, where the
  window itself is defined. The CLI applies them in a fixed order: filter, then window, then the
  forge probe on the rows actually shown. The probe no longer asks about PRs on rows the caller will
  never see.
- **Mechanisms:** completion reuses the existing suggesters. `floorNumber` takes `'any'` for the
  listing, because a closed floor's tasks are history a filter may be asking for, while a claim
  still offers only open floors. `--state` is an optique `choice`, so its completions come from the
  parser.
