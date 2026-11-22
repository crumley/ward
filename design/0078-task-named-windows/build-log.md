# 0078 — Build log

## 2026-11-20 — what the harnesses do with a name

The question was whether Claude Code's `--name` replaces the description it writes into its terminal
title, which Ward's hosted title carries after the window and the floor.

**Method.** Each run stood in a window of a private tmux 3.8 server (`tmux -L <name> -f /dev/null`),
under `env -i` with a scratch `HOME` and `CLAUDE_CONFIG_DIR`, a dummy `ANTHROPIC_API_KEY`, and
`ANTHROPIC_BASE_URL` pointed at a local stand-in for the Messages API: a few lines of Bun that
answered every request with canned text, and the title-generation request with
`{"title":"Stub widget repair"}`. The first-run dialogs were stepped through with `send-keys`, one
prompt was submitted, and the pane title was read with `display -p '#{pane_title}'` once a second
for ten seconds. The scratch directories and their transcripts were removed afterwards, and the
server killed.

**Claude Code 2.1.325.**

| Run                                                       | Title at start  | Title after one prompt | Title request made |
| --------------------------------------------------------- | --------------- | ---------------------- | ------------------ |
| no `--name`                                               | `✳ Claude Code` | `✳ Stub widget repair` | yes                |
| `--name X`                                                | `✳ X`           | `✳ X`                  | no                 |
| `--name X --settings '{"terminalTitleFromRename":false}'` | `✳ Claude Code` | `✳ Stub widget repair` | yes                |
| `--name X`, then the setting false, then the setting true | —               | `✳ X`                  | —                  |

- With the setting, the prompt box still showed the name on its rule, and the transcript gained
  `custom-title` `X` beside `ai-title` `Stub widget repair`.
- Two `--settings` flags are accepted; the later one wins for a key (last row).
- `--resume U --name Y` appended a new `custom-title` `Y` in both forms. A resumed run set no title
  until its first prompt; then the named run read `✳ Y` and the run with the setting kept its
  generated title.

**pi 1.4.0** (`PI_CODING_AGENT_DIR` scratch, `--offline`). The title was `π - cwd` without a name
and `π - f7t54 task-named-windows - cwd` with `--name`, and the footer showed the name. pi wrote no
session file before a first message, which needs a model, so its persistence on start and resume was
not re-measured here; the scoping pass had measured a `session_info` entry on both.

## 2026-11-22 — a topic session in one step: `session open --new-task`

A session opened for a topic with only `--purpose` names no task, so its window reads as the floor's
slug with an ordinal. The pattern that gave it a name was two verbs — `task open`, then
`session open --task` — and the names stay derived: a purpose is not a name, and a standing topic is
a task. So `ward session open --floor N --new-task SLUG [--repo NAME …] [--purpose TEXT]` does both:
it opens the task on floor N, then the floor's session working it, on the launched path (foreground
or `--detach`) and on the `--handle` path alike, exactly as `--task` opens one.

- **A `session open` flag, not a task verb.** The session it opens is the floor's, working the task
  — not a task session — so the verb is the session's and the flag says the task is new. `--purpose`
  is both the task's purpose and the session's; left out, the task has none and the session reads
  `Coordinating floor N · …`.
- **The task first, in its own commit.** The launch's harness name is worked out from the record
  before the session exists (`launchName`), so the task must be on the record first. The cost: a
  session open that then fails leaves the task open. The refusal says so and names it — and, when no
  session was recorded, gives `ward session open --task ADDRESS` to finish; when one was (a run that
  did not start), its own message already says how to resume it.
- **Refused before the task's commit wherever it can be.** `--new-task` beside `--task` or a
  positional TASK (it would name two tasks), `--repo` without `--new-task`, `--detach` or
  `--foreground` with `--handle`, an unregistered repository, a floor that is not open, and a
  workspace below format 3 (the session's `task-named` event needs it) all refuse with nothing
  written.
- **`--floor`, or a claim.** With no `--floor`, the `--repo`s route the task by claim, as
  `task open` routes it ([0037](../0037-repo-floor-affinity/README.md)), and the session follows the
  task. With neither — or a `--repo` no floor claims — it is refused, where `task open` falls back
  to the ground floor: a bare `session open` means workspace scope, and a ground-floor session that
  nothing named would be one the caller did not ask for.
- **The report carries both.** The session's report gains `openedTask`, the task as `task open`
  reports it, on this open alone; human output prints the task's line, then the session's. No record
  shape changes, so no format level moves.
