# Subsystem: Remote Work-Item Provider

> **Layer:** intent · subsystem (seam). The constraints any design must honor; names no tool.
> **Design:** `../../design/subsystems/remote-provider.md`. **Status:** placeholder skeleton.

## Responsibility

Be the remote side of the local↔remote boundary (`concepts/delivery.md`): the shared system where
work items and pull requests live.

## Constraints any design must honor

- Link a local task to a remote work item, and carry status both ways.
- Accept outward-translated updates — the **privacy boundary is enforced _upstream_ of this seam**,
  so the provider receives already-sanitized content (`principles.md` §4).
- Report PR status so Ward can drive a task to completion.
- Outward posts/merges are **gated actions** (`principles.md` §18); the gate is upstream.

## What this is NOT

- Not a specific forge; replaceable by other providers. The task model does not assume one.
- Not the place privacy translation _happens_ — it only receives the sanitized result.

## Canonical home for

The remote-provider contract (link, two-way status, accept-sanitized, report PR status).

## Open questions

- **Privacy-translation gate** — what the outward re-authoring concretely strips/rewrites and the
  single upstream place it runs (🔴 spine; design). The _constraint_ (nothing local leaks) is
  intent.
