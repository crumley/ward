# Ward Tests

The **tests** leg. Holds the code in [`../src/`](../src/) to both the realization in
[`../design/`](../design/) and the constraints in [`../intent/`](../intent/).

> **Status:** design tests for the CLI foundation ([`cli/version.test.ts`](cli/version.test.ts) →
> [`design/0001-dev-foundation/`](../design/0001-dev-foundation/README.md)) and the store +
> workspace entry ([`store/`](store/), [`workspace/`](workspace/), and
> [`cli/workspace.test.ts`](cli/workspace.test.ts) →
> [`design/0002-store-and-workspace/`](../design/0002-store-and-workspace/README.md)). Among them
> are the first intent-shaped guarantees: creation converges idempotently
> ([principles §6](../intent/00-foundation/01-principles.md)) and a customized installed artifact is
> never clobbered ([workspace lifecycle](../intent/01-concepts/06-workspace-lifecycle.md)).

Two kinds of test are expected, and the distinction matters because of the four-leg model:

- **Design / implementation tests** — that the code does what _this_ design says. They move and
  change with `design` + `src`. _E.g._ "the store writes the task-record front-matter schema this
  design defines"; "the multiplexer groups panes by scope."
- **Intent tests** — that the **durable constraints** hold regardless of how it is built (the
  invariants in [`../intent/`](../intent/)). These should survive a design swap. _E.g._ a containing
  scope's status is **derived**, never a stored field
  ([domain model](../intent/01-concepts/00-domain-model.md), §17); **resume is idempotent and closed
  stays closed** ([sessions](../intent/01-concepts/02-sessions-and-lifecycle.md)); **no
  local/personal/persona content crosses to a remote artifact**
  ([principles §4](../intent/00-foundation/01-principles.md),
  [remote provider](../intent/02-subsystems/06-remote-provider.md)). If a test must change because a
  _tool_ changed, it was really a design test.

`test` moves with `design` and `src`; all three reconcile back to `intent` when they diverge.

## Three kinds, three tiers

Cutting across those two, every test is one of three kinds by **mechanism** — a unit test (Ward's
code in-process, its collaborators faked), a CLI test (`ward` as a caller runs it), or a live test
(a real tmux on a private server, usually through a real pseudo-terminal) — and runs in one of three
**tiers**. What each kind is for, the default (no real tmux, no spawned process, no fresh workspace
unless that is what is under test), and when a test earns the live tier are in
[`../CONTRIBUTING.md`](../CONTRIBUTING.md#tests-three-kinds-three-tiers); that text governs. Here is
where they are:

- **The tier is the file name.** A file ending in `-live.test.ts` is the live tier; every other
  `*.test.ts` is the fast tier. Both mise tasks read that one rule, so a file cannot fall between
  them. Today the live tier is [`host/tmux-live.test.ts`](host/tmux-live.test.ts) (detached hosting,
  attach, observe, titles) and [`host/tmux-nudge-live.test.ts`](host/tmux-nudge-live.test.ts)
  (typing a hand-off into a stand-in harness).
- **The fast tier** (`mise run test:fast`) runs in parallel, isolated workers, so a file cannot see
  another's leftovers and must not depend on running alone. It must pass with no tmux installed. Its
  fakes are here to reuse: [`agent/fake-host.ts`](agent/fake-host.ts) stands in for a session host,
  and [`helpers.ts`](helpers.ts) has the workspace, CLI, fake-`claude` and fake-`gh` helpers.
- **The live tier** (`mise run test:live`) runs its files one after another, each in a fresh global,
  after a preload, [`live-tier.ts`](live-tier.ts), that checks the tmux on PATH is the pinned one
  (failing in CI, warning locally; `WARD_TMUX_PIN=native` skips the check) and, with
  `WARD_LIVE_EVIDENCE=DIR`, keeps every pseudo-terminal client's output there. A live file starts
  its own server (`tmux -L <unique>`, through `WARD_TMUX_SOCKET`, with no configuration file), kills
  it when it is done, closes every pseudo-terminal it opened, and skips itself, saying so, when no
  tmux is installed. A plain `bun test` with no arguments runs both tiers in one process, live files
  among the rest: use the mise tasks, or name a file.

**How we write tests** — high assertion density, cases first and setup at the bottom, table-driven
where it fits, and a fast write→fail→fix loop — is in [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
