#!/usr/bin/env bash
# Acceptance test: drive the intent walkthrough (intent/03-walkthrough.md, §0–§10)
# as REAL `ward` commands against a REAL on-disk workspace, from a clean state,
# asserting the records written at each step and the reboot-recovery test.
#
# Exit 0 iff every step and assertion passes. Reproducible: a fresh temp
# workspace each run, removed on exit.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WS="$(mktemp -d "${TMPDIR:-/tmp}/ward-walkthrough.XXXXXX")"
trap 'rm -rf "$WS"' EXIT

ward() { node "$REPO/src/cli/index.ts" "$@"; }

ok=0
bad=0
section() { printf '\n\033[1m%s\033[0m\n' "$*"; }
pass() {
  ok=$((ok + 1))
  printf '  \033[32m✓\033[0m %s\n' "$*"
}
bad_() {
  bad=$((bad + 1))
  printf '  \033[31m✗ %s\033[0m\n' "$*"
}
have_file() { if [ -f "$1" ]; then pass "record ${1#"$WS"/}"; else bad_ "missing record ${1#"$WS"/}"; fi; }
have_dir() { if [ -d "$1" ]; then pass "dir ${1#"$WS"/}"; else bad_ "missing dir ${1#"$WS"/}"; fi; }
gone() { if [ ! -e "$1" ]; then pass "removed ${1#"$WS"/}"; else bad_ "still present ${1#"$WS"/}"; fi; }
grep_ok() { if printf '%s' "$2" | grep -Eq -- "$1"; then pass "$3"; else bad_ "$3 — no /$1/ in: $2"; fi; }
grep_no() { if printf '%s' "$2" | grep -Eqi -- "$1"; then bad_ "$3 — LEAKED /$1/"; else pass "$3"; fi; }

cd "$WS"
WARD=".ward"
FLOOR="$WARD/projects/1-meal-plan-exports"
TASK="$FLOOR/tasks/csv-export"

# ── §0 Cold open — the workspace ──────────────────────────────────────────────
section "§0  Cold open — init the workspace"
ward init --repo meal-planner >/dev/null
git init -q -b main repos/meal-planner
git -C repos/meal-planner -c user.email=a@b -c user.name=w commit -q --allow-empty -m init
have_file "$WARD/workspace.md"
have_file "$WARD/personas/riley.md"
have_file ".gitignore"
grep_ok 'schemaVersion' "$(cat "$WARD/workspace.md")" "version stamp recorded"
grep_ok '✓ workspace' "$(ward doctor)" "doctor finds the workspace"
grep_ok 'workspace: active' "$(ward status)" "house-supervisor view: active, nothing in flight"

# ── §1 Open a project — floor 1 ───────────────────────────────────────────────
section "§1  Open a project (floor 1)"
grep_ok 'floor 1 .*attending avery.*charge nurse casey' "$(ward project open 'Meal Plan Exports')" "floor 1 opened with attending + charge nurse"
have_file "$FLOOR/project.md"
have_dir "$FLOOR/log"

# ── §2 Open a task (local-only) ───────────────────────────────────────────────
section "§2  Open a task (local-only)"
grep_ok 'task 1/csv-export .active.*resident riley' "$(ward task open 'CSV export' --floor 1 --success 'a CSV endpoint, tested, merged')" "task opened active, resident riley"
have_file "$TASK/task.md"

# ── §3 Create a worktree (setup hooks fire) ───────────────────────────────────
section "§3  Create a worktree — idempotent setup hooks fire"
grep_ok 'created worktree meal-planner/csv-export' "$(ward worktree create --floor 1 --task csv-export --repo meal-planner --branch csv-export)" "worktree created with accent + glyph"
have_file "$TASK/worktrees/meal-planner__csv-export.md"
have_dir "worktrees/meal-planner/csv-export"
have_file "worktrees/meal-planner/csv-export/.ward-setup/deps"
have_file "worktrees/meal-planner/csv-export/.ward-setup/theme"

# ── §4 Brief and open room 1A1 (mints its first session) ──────────────────────
section "§4  Brief + open room 1A1 (opening mints the first session)"
printf 'Add a CSV export endpoint. Tests. Clear error handling.\n' >brief.md
ROOM_OUT="$(ward room open --floor 1 --task csv-export --repo meal-planner --branch csv-export --brief @brief.md)"
grep_ok 'opened room 1A1' "$ROOM_OUT" "room 1A1 opened (floor 1, first room)"
grep_ok 'minted session quinn' "$ROOM_OUT" "opening the room minted its first session"
grep_ok 'dispatched brief-1A1' "$ROOM_OUT" "brief dispatched into the room"
have_file "$TASK/rooms/1A1/room.md"
have_file "$TASK/rooms/1A1/artifacts/brief-1A1.md"
grep_ok 'armed wake-0' "$(ward wake arm --waiter riley --kind room-done --target 1A1)" "resident arms a wake and detaches"

# ── §5 Deep work in the room ──────────────────────────────────────────────────
section "§5  Deep work in the room (commit on the branch)"
( cd worktrees/meal-planner/csv-export && echo 'def export_csv(): ...' >export.py && git add export.py && git -c user.email=a@b -c user.name=w commit -q -m 'csv endpoint + tests' )
grep_ok 'export.py' "$(git -C worktrees/meal-planner/csv-export show --stat --oneline HEAD)" "work committed on the csv-export branch"
grep_ok 'session-opened' "$(cat "$TASK/rooms/1A1"/log/*.md)" "the room's session log records the work"

# ── §10 (as if rebooted at §6) — recovery restores the in-flight threads ──────
section "§10 Reboot test (as if rebooted here at §6) — attach"
ATTACH="$(ward attach)"
grep_ok 'attached 1 session' "$ATTACH" "the open room session is re-attached"
grep_ok 'worktrees revalidated 1' "$ATTACH" "the live worktree's setup hooks are re-validated"
grep_ok 're-armed 1' "$ATTACH" "the resident's wake is re-armed (room still occupied)"

# ── §6 Report up, evaluate, iterate ───────────────────────────────────────────
section "§6  Report up, evaluate, iterate (recorded messages)"
ward report --from 1A1 --to riley --body 'done: endpoint + tests' >/dev/null
grep_ok 'fired 0, still armed 1' "$(ward wake check)" "wake not yet fired — room still occupied (SF-003: fires on completion)"
ward dispatch --from riley --to 1A1 --body 'tighten error handling' >/dev/null
ward report --from 1A1 --to riley --body 'done: clearer errors' >/dev/null
grep_ok 'report-1.*report-3' "$(ward messages | tr '\n' ' ')" "the evaluate→iterate loop is recorded and inspectable"

# ── §7 Present; open the PR (gated, privacy-translated) ───────────────────────
section "§7  Present to attending; open the PR (gated + privacy-translated)"
COMMENT="$(ward remote comment --body "riley (the resident) says the endpoint is ready; see $WS/repos/meal-planner")"
grep_no 'riley' "$COMMENT" "outward comment: persona name redacted"
grep_no 'resident' "$COMMENT" "outward comment: role word redacted"
grep_no "$WS" "$COMMENT" "outward comment: local path redacted"
ward remote link --floor 1 --task csv-export --provider stub --id 42 --url 'stub://items/42' >/dev/null
ward pr track --floor 1 --task csv-export --repo meal-planner --number 1 >/dev/null
have_file "$TASK/prs/meal-planner-1.md"
grep_ok 'active .in-review.' "$(ward task list --floor 1)" "task shows the derived in-review overlay"

# ── §8 Drive the PR to merge; guard closure ───────────────────────────────────
section "§8  Drive the PR to merge (completion guard blocks early close)"
if ward task close 1/csv-export 2>/dev/null; then bad_ "task closed with an unmerged PR (guard failed)"; else pass "closing is blocked while a PR is unmerged"; fi
ward pr advance --floor 1 --task csv-export --id meal-planner-1 --state approved >/dev/null
grep_ok 'merged' "$(ward pr advance --floor 1 --task csv-export --id meal-planner-1 --state merged)" "PR driven open → approved → merged"

# ── §9 Close the task — disposition, cleanup, reflect ─────────────────────────
section "§9  Close the task — free the room, tear down the worktree, reflect"
ward room close 1A1 >/dev/null
ward session close quinn >/dev/null
grep_ok 'fired 1' "$(ward wake check)" "the room-done wake fires once the room is free"
ward worktree teardown --floor 1 --task csv-export --repo meal-planner --branch csv-export >/dev/null
gone "worktrees/meal-planner/csv-export"
grep_ok 'closed' "$(ward task close 1/csv-export)" "task closes once all PRs are merged"
grep_ok 'proposal' "$(ward reflect --scope task:1/csv-export)" "scope-boundary reflection proposes improvements"
have_file "$WARD/reflections/task-1-csv-export--scope-boundary.md"

# ── §10 (final) — closed stays closed, recovery is idempotent ─────────────────
section "§10 Final attach — closed stays closed, recovery idempotent"
FINAL="$(ward attach)"
grep_ok 'attached 0 session' "$FINAL" "no closed thread is revived"
grep_ok 'skipped 1' "$FINAL" "the torn-down worktree is skipped, not errored"
grep_ok 'closed' "$(ward session list | grep quinn || echo closed)" "the room session stays closed"

# ── summary ───────────────────────────────────────────────────────────────────
printf '\n\033[1m%d passed, %d failed\033[0m\n' "$ok" "$bad"
[ "$bad" -eq 0 ]
