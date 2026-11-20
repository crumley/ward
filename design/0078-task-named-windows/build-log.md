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
