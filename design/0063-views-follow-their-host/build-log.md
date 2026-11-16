# 0063 — Build log

## 2026-11-15 — the stale state reproduced, then refreshed, on a private server

A throwaway workspace `trial` and a private tmux server (`WARD_TMUX_SOCKET`), with a stub harness.

1. With the code as it stood before 0061 (main at `50c38dd`): a coordinator and a floor-1 session
   opened detached, then three clients on ptys — `attach` to each, and `observe` of the coordinator.
   tmux held `ward-trial-f0`, `ward-trial-f1`, and views `ward-trial-f0-v1`, `ward-trial-f0-o1`,
   `ward-trial-f1-v1`, every one with `set-titles` off.
2. With main at 0060 (`0281320`): `ward project identity` on each floor. Hosts became
   `trial-f0-workspace` and `trial-f1-alpha`, titled. All three views kept their old names,
   `set-titles` off, and tmux's default title string; no client had been sent a title. This is the
   state that was seen on hosts in use.
3. With this entry: `ward project identity 1`, changing nothing. The views became
   `trial-f0-workspace-v1`, `trial-f0-workspace-o1`, `trial-f1-alpha-v1`; `list-clients` showed the
   same three client pids on the same ttys, each on its renamed view; the ptys received
   `coord · 🌊 trial f0`, `coord · 🌊 trial f0 (observing)`, and `alpha · 🌸 trial f1`.
4. `ward project identity 1 --color green --emoji 🚀`: the attached floor-1 client received
   `alpha · 🚀 trial f1`.

## 2026-11-15 — the title, read back from Rex

One new Rex tab, running `ward session attach` against the same private server. Rex's terminal block
reports the title a program last set (`rex block call … title`):

- on attach: `alpha · 🚀 trial f1`;
- after the pane set a title (`select-pane -T 'working on it'`):
  `alpha · 🚀 trial f1 · working on it`;
- after `ward project identity 1 --color pink --emoji 🌸`, with the tab still attached:
  `alpha · 🌸 trial f1 · working on it`.

So Rex receives and holds what tmux sends, emoji intact, and follows a change made under an attached
client. What the tab strip paints was not read: the tab carried the label it was opened with, and
`rex` reports a tab's label and a terminal's title as separate things.

## 2026-11-15 — foreground titles, measured

Claude Code 2.1.325 on a pty, idle and then given one prompt; the titles it wrote are in the entry's
Decisions. The harness writes OSC 0.
