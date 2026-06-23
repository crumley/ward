#!/usr/bin/env bash
# Ward v1 ACCEPTANCE — the end-to-end walkthrough (intent/03-walkthrough.md §0–§10) run for REAL,
# from a clean state, via documented CLI commands, asserting recorded state at each step. This is the
# loop's exit test (build/v1-scope.md). Run: bash test/acceptance/walkthrough.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WARD_ENTRY="$REPO_ROOT/src/cli/index.ts"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/ward-accept.XXXXXX")"
WS="$TMP/ws"; ORIGIN="$TMP/meal-planner.git"
trap 'rm -rf "$TMP"' EXIT

ward() { node "$WARD_ENTRY" -C "$WS" "$@"; }
pass=0
assert_contains() { # <haystack> <needle> <label>
  if printf '%s' "$1" | grep -qF -- "$2"; then pass=$((pass+1)); echo "  ✔ $3"; else
    echo "  x FAIL: $3"; echo "    expected to find: $2"; echo "    in: $1"; exit 1; fi
}
assert_absent() { # <haystack> <needle> <label>
  if printf '%s' "$1" | grep -qF -- "$2"; then echo "  ✘ FAIL: $3 (found forbidden: $2)"; exit 1;
  else pass=$((pass+1)); echo "  ✔ $3"; fi
}
assert_ok() { # <label> <cmd...>  -- expects success
  if "${@:2}" >/dev/null 2>&1; then pass=$((pass+1)); echo "  ✔ $1"; else echo "  ✘ FAIL: $1"; exit 1; fi
}
assert_fails() { # <label> <cmd...>  -- expects non-zero
  if "${@:2}" >/dev/null 2>&1; then echo "  ✘ FAIL: $1 (expected refusal)"; exit 1; else pass=$((pass+1)); echo "  ✔ $1 (refused)"; fi
}

# A local origin repo stands in for the shared remote.
git init -b main "$ORIGIN" -q
git -C "$ORIGIN" config user.email a@b && git -C "$ORIGIN" config user.name A
printf 'def app():\n    return 1\n' > "$ORIGIN/app.py"
git -C "$ORIGIN" add -A && git -C "$ORIGIN" commit -qm "init meal-planner"

echo "§0 cold open"
ward init >/dev/null
ward repo add meal-planner "$ORIGIN" >/dev/null
assert_contains "$(ward status)" "nothing in flight" "workspace status derives empty"

echo "§1 open a project (floor 1)"
out="$(ward project open meal plan exports)"
assert_contains "$out" "floor 1" "project gets floor 1"
assert_ok "project record exists" test -f "$WS/.ward/projects/1-meal-plan-exports/project.md"

echo "§2 open a task (local-only)"
ward task open csv export --floor 1 --repo meal-planner --success "a CSV endpoint, tested, merged" >/dev/null
assert_ok "task record exists" test -f "$WS/.ward/projects/1-meal-plan-exports/tasks/csv-export/task.md"

echo "§3 create a worktree (real git worktree + idempotent hooks)"
ward worktree create --floor 1 --task csv-export --repo meal-planner >/dev/null
assert_contains "$(git -C "$WS/repos/meal-planner" worktree list)" "csv-export" "REAL git worktree registered"
assert_ok "deps hook marker present" test -f "$WS/worktrees/meal-planner/csv-export/.ward-setup-deps"
assert_ok "theme hook marker present" test -f "$WS/worktrees/meal-planner/csv-export/.ward-theme.json"

echo "§4 brief, open room 1A1, dispatch, arm wake"
ward room open --floor 1 --task csv-export --repo meal-planner --branch csv-export --brief "write CSV endpoint" --body "Add GET /plans.csv." >/dev/null
assert_ok "room 1A1 record exists" test -f "$WS/.ward/projects/1-meal-plan-exports/tasks/csv-export/rooms/1A1/room.md"
ward dispatch --to 1A1 --ref write-csv-endpoint --body "Build it per the brief." >/dev/null
ward wake arm --on 1A1:done --armer Riley >/dev/null
assert_contains "$(ward wake list)" "[armed] 1A1:done" "wake armed on 1A1:done"

echo "§5 deep work in the room (session + real commit on the branch)"
ward session open --room 1A1 --persona Morgan >/dev/null
WT="$WS/worktrees/meal-planner/csv-export"
printf '\ndef plans_csv():\n    return "a,b\\n"\n' >> "$WT/app.py"
git -C "$WT" add -A && git -C "$WT" commit -qm "add CSV endpoint"
assert_contains "$(git -C "$WT" log --oneline)" "add CSV endpoint" "real commit on the csv-export branch"

echo "§6 report up; wake satisfied (fires once)"
assert_contains "$(ward report 1A1 done)" "woke 1" "report satisfies the armed wake"
assert_contains "$(ward report 1A1 done)" "already satisfied" "second report fires once (idempotent)"

echo "§10 (rehearsed mid-flight) reboot recovery while threads are open"
rec="$(ward recover)"
assert_contains "$rec" "re-attached" "recovery re-attaches open threads"
assert_contains "$rec" "csv-export[" "recovery re-validates worktree hooks (no-op)"

echo "§7 present + open PR (gated; privacy-translated)"
ward task attach-remote --floor 1 --task csv-export --provider github --id 42 --url https://example/42 >/dev/null
assert_fails "PR open refused without authority" ward pr open --floor 1 --task csv-export --title "Add CSV export" --body "Riley directed Morgan."
ward pr open --floor 1 --task csv-export --title "Add CSV export" --body "Riley directed Morgan in $WS. The resident approved." --authorize >/dev/null
# Assert on the BODY that actually crosses (the stored pr-body artifact's markdown body), not the
# operator-facing "stripped" report (which legitimately names what it removed).
prbody="$(sed -n '/^---$/,/^---$/!p' "$WS/.ward/projects/1-meal-plan-exports/tasks/csv-export/artifacts/pr-42.md")"
assert_absent "$prbody" "Riley" "PR body does not leak a persona name"
assert_absent "$prbody" "Morgan" "PR body does not leak the other persona name"
assert_absent "$prbody" "$WS" "PR body does not leak the local path"

echo "§8 drive PR to merge (gated; approval-gated)"
assert_fails "merge refused before approval" ward pr merge --floor 1 --task csv-export --authorize
ward pr review approved --floor 1 --task csv-export >/dev/null
assert_fails "merge refused without authority" ward pr merge --floor 1 --task csv-export
assert_contains "$(ward pr merge --floor 1 --task csv-export --authorize)" "merged" "approved PR merges with authority"

echo "§9 close the task (teardown + scope-boundary reflection)"
close="$(ward task close csv-export --floor 1)"
assert_contains "$close" "[closed]" "task closed"
assert_contains "$close" "skill:" "reflection proposed a skill"
assert_ok "reflection record written" test -f "$WS/.ward/reflections/task_1_csv-export/task-close.md"
assert_contains "$(ward status)" "[closed]" "derived status reflects the closed task"

echo "§10 final recovery — closed stays closed"
fin="$(ward recover)"
assert_contains "$fin" "closed (left alone):" "recovery reports closed-left-alone"

echo
echo "ACCEPTANCE PASSED — $pass assertions across walkthrough §0–§10."
