# v1 Scope — the first working version

> **Status:** to be filled in by the build, in its first iteration, before significant code is
> written. Revise it as the build learns; record material changes in [`LOG.md`](LOG.md).

The explicit boundary of the first fully working version of Ward. The guiding question for every
in/out call is the prime directive: which choice best lets us exercise the **core** of the intent
end-to-end without drowning the first build in breadth?

## In scope

_The smallest set of capabilities that makes Ward genuinely run end-to-end. Fill in._

- …

## Deferred (with why)

_What the first version intentionally leaves out or stubs behind its seam contract, and the reason._

- …

## Acceptance scenario

The first version is "working" when the end-to-end [walkthrough](../intent/03-walkthrough.md) — or a
named subset of its steps — runs **for real**, reproducibly, from a clean state, via documented CLI
commands. List the exact steps covered, any deferred, and the commands that prove each.

- …

## Invariants to prove by test

The durable constraints that must hold regardless of how Ward is built (see
[`../test/README.md`](../test/README.md)). At minimum:

- A containing scope's status is **derived** from its children, never a stored field.
- **Resume is idempotent** and **closed stays closed**.
- No local / personal / persona content crosses to a **remote artifact**.
- Session logs are **append-only**; concurrent writers cause **no lost updates**.
