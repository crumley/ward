# 0059 — The session shorthands: `wsa` joins the coordinator, and `wso`, `wsr`, `wsc`

> `wsa` with no argument joins the workspace's coordinator from any terminal, opening it detached
> first when none is open, so the same word works after a reboot and mid-day; `wsa N` does the same
> for floor N's own session. `wsa ID`, `wso`, `wsr`, and `wsc` are one-line forwards to
> `ward session attach|observe|resume|close`. A new candidate kind, `coordinators`, is what `wsa`
> reads to decide.
>
> **Status:** built — awaiting review · **Started:** 2026-11-14 · **Partly superseded:** the pick
> `wsa N` offered between several floor sessions, and the floor feed's order, by
> [0079](../0079-wsa-floor-first-window/README.md)

Detached hosting ([0031](../0031-detached-session-hosting/README.md)) put the coordinator (the one
workspace-scope session no other session started) in a tmux window linked into every floor host, and
`ward session attach ID` joins it. It also re-creates the run from its record when the window has
ended or gone. That covers the reboot. Getting in still costs two things, though: the id, which
grows with every session the workspace has ever opened and names the machine, and knowing whether a
coordinator is open at all. If one is, the move is `attach`. If none is, the move is
`ward session open --detach` and then `attach`. A human coming back to a terminal shouldn't have to
work out which case they're in, and that's the case where they least know it.

The shell layer ([0025](../0025-fish-shell-layer/README.md),
[0027](../0027-shell-adoption/README.md)) already answers the same kind of question for repositories
and workspaces: a name if you give one, a picker when there are several, a stated default when there
are none. This entry gives sessions the same treatment.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): four more mnemonic shorthands, each
  thin plumbing that ends in a `ward session` verb; _supply nouns by recognition_ (a coordinator is
  picked by its purpose, never typed as an id); _churn must be deliverable_ (they land in both
  installed forms, and doctor names them as not yet adopted).
- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md): open and
  running stay distinct. `wsa` opens a session only when no open record exists, and an exited or
  gone run is re-created by `attach`, never by opening a second session.
- [`principles`](../../intent/00-foundation/01-principles.md): **§17**, a candidate this machine
  can't honour is never offered; **§20**, a missing tmux is refused by name, not degraded into a
  double launch.

## Scope

- **In:** the `coordinators` candidate kind, narrowed to one floor by `--floor N`; the shorthands
  `wsa`, `wso`, `wsr`, `wsc` in the catalog, so both `ward shell init fish` and
  `ward shell adopt fish` carry them; their completions, which wrap the verb each one forwards to.
- **Deferred:**
  - _A workspace argument to `wsa` (`wsa main`)._ Safe to defer: `wsa` acts on the workspace a
    human-run `ward session attach` would act on (the one underfoot, else the default), which is the
    only one a single-workspace machine has. Adding it later is one leading-argument rule, copied
    from `wws`.
  - _Floor sessions in `wsa`'s no-argument path._ A floor's session is joined by its number
    (`wsa N`). The bare word means the coordinator because that's the only session whose window
    floats into every host. Offering every open session would turn the common case into a picker.
  - _Completing floor numbers after `wsa`._ Safe to defer: completion offers session ids, and a
    floor number is short and already known to whoever types it.
  - _bash and zsh._ The same deferral as every other shorthand
    ([0025](../0025-fish-shell-layer/README.md)).
- **Acceptance:**
  1. `ward shell candidates coordinators` lists open, floating sessions recorded on this machine (or
     with no machine recorded), oldest first, cued by purpose. It excludes child sessions, floor and
     task sessions, closed sessions, and other machines' sessions, and from outside any workspace it
     answers for the registry's default. With `--floor N` it lists that floor's own open sessions
     instead, whoever started them (`test/cli/shell.test.ts`).
  2. `wsa ID` calls only `ward session attach ID`. A bare `wsa` with one coordinator open attaches
     to it. With none open it runs `ward session open --detach` and then attaches to what that
     opened. With several open it picks from the list it already read and passes only the picked id;
     with no picker it names them and exits 127. With none open and no tmux it refuses with exit 127
     and opens nothing. `wsa N` does all of this for floor N, opening with
     `ward session open --floor N --detach` (`test/cli/shell.test.ts`, against a recording stub of
     `ward`).
  3. `wso`, `wsr`, and `wsc` forward their argv unchanged (`test/cli/shell.test.ts`).
  4. Adopting each one writes exactly its function, its completion, and the helpers it needs
     (`test/cli/shell-adopt.test.ts`). `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **A shorthand, not a verb.** The alternative was `ward session attach` with an optional id that
    falls back to the coordinator. It would be discoverable under `--help` and usable by any shell.
    It lost on the picker: choosing between several coordinators is the shell layer's job by 0025's
    design, and a verb that offered a pick would need the in-process picker 0025 deferred. A verb
    that instead refused when several are open would leave the human retyping an id. The cost is
    that only fish gets the one-word path until another shell gets a layer.
  - **Open only when no record is open.** The alternative was to check whether the window is live
    and open a fresh session whenever it isn't. It lost because `attach` already re-creates a gone
    run from its record, resuming the same conversation. A fresh open after every reboot would leave
    a trail of open coordinators, each holding a conversation nobody resumes. So the shell only asks
    whether a record is open, and `attach` handles the rest.
  - **tmux checked before the open, by the shell.** `--detach` falls back to the foreground when
    tmux isn't usable ([0031](../0031-detached-session-hosting/README.md)). A `wsa` that ran into
    that fallback would run the agent in the foreground, then attach once it exited and start it a
    second time. `command -q tmux` catches the common case of tmux not being installed. A tmux older
    than 3.2 still gets past the check. When that happens, Ward announces the fallback, and the
    attach that follows names the reason the host isn't usable.
  - **Re-read the feed rather than parse the open's JSON.** After `session open --detach`, `wsa`
    asks `shell candidates coordinators` again instead of pulling the id out of `--json` output. The
    feed is the one reader of "which coordinator?", and fish has no JSON parser. Matching a regex
    against the JSON would make the shell depend on a document shape the feed already abstracts
    away.
  - **This machine only.** A coordinator whose history lives on another computer can't be re-created
    here: `resume` refuses it, naming the machine that can. After a reboot, offering it would make
    `wsa` pick something it then fails on.
  - **A bare number is a floor.** A floor's session is the other thing a human comes back to, and
    its id (`f7-1@mac`) carries the same costs as the coordinator's. No session id is all digits, so
    the rule is unambiguous. The alternative, `wsa --floor N`, mirrors `session open` and lost on
    length for the case it exists for. At floor scope a parent doesn't disqualify a session the way
    it does at workspace scope: the workspace's coordinator usually starts the floor sessions, so
    requiring no parent would hide nearly all of them.
  - **The picker is fed the list in hand.** `__ward_choose` re-reads a kind by name, and a kind
    carries no floor, so `wsa` pipes the lines it already read straight to `__ward_picker` and
    repeats `__ward_choose`'s no-picker fallback. Extending `__ward_choose` to take feed arguments
    would have reworded a helper all three resolvers share, so every adopted copy would read
    `changed` in doctor, for one caller.
  - **`w` + `s` + the verb's initial.** The set's existing pattern is `w` + noun initial + verb
    (`wrr`, `wrcd`, `wwcd`, `wws`), and these four address the session noun. `wss` (session start)
    was considered for the jump-in and lost: the act is joining, which `ward session attach` already
    names.
- **Layout:** the feed sits in `src/shell/candidates.ts` beside the two existing kinds and reuses
  `floats` (`src/agent/placement.ts`), so the shell's coordinator and the host's floating window
  come from one predicate. The shorthands are four more rows in `src/shell/shorthands.ts`. The two
  assemblies and doctor's adoption check are table-driven, so they pick the rows up with no change.
- **Mechanisms:** _bare `wsa`:_ `ward shell candidates coordinators`. If there are none:
  `command -q tmux` (else refuse with 127), then `ward session open --detach` (default purpose,
  workspace scope), then the feed again. If there is one: take its name. If there are several: the
  picker, over the lines already read. _`wsa N`:_ the same, with `--floor N` on both the feed and
  the open. Then `ward session attach ID`, which joins the live window (or switches the client, from
  inside tmux) or re-creates the run from its record. _`wsa ID`, `wso`, `wsr`, `wsc`:_
  `command ward session <verb> $argv`.
