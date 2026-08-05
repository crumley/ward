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

**How we write tests** — high assertion density, cases first and setup at the bottom, table-driven
where it fits, and a fast write→fail→fix loop — is in [`../CONTRIBUTING.md`](../CONTRIBUTING.md).
