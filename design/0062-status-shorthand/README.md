# 0062 — `ws`: the status shorthand

> `ws` is `ward status`, arguments and all: one more row in the shell catalog, so both
> `ward shell init fish` and `ward shell adopt fish` carry it.
>
> **Status:** built — awaiting review · **Started:** 2026-11-15

`ward status` is the read a human runs most: it is where every floor, task, and open session stands.
Every other common operation in the shell layer ([0025](../0025-fish-shell-layer/README.md),
[0059](../0059-session-shorthands/README.md)) has a mnemonic, and the most frequent one was still
typed in full.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): a mnemonic shorthand for a common
  operation, thin plumbing that ends in one `ward` verb; _churn must be deliverable_ (it lands in
  both installed forms, and doctor names it as not yet adopted).

## Scope

- **In:** the shorthand `ws` in the catalog, and its completion, which wraps `ward status`.
- **Deferred:** _a workspace argument (`ws main`)._ Safe to defer: `ws` reads the workspace a
  human-run `ward status` would read, and adding the argument later is the leading-argument rule
  `wws` already has.
- **Acceptance:**
  1. `ward shell init fish` emits `ws` and its wrapping completion, and `ws` forwards its argv
     unchanged to `ward status` (`test/cli/shell.test.ts`, against a recording stub of `ward`).
  2. Adopting it writes exactly its function and its completion, and doctor's not-adopted line names
     it (`test/cli/shell-adopt.test.ts`). `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **`ws`, two letters.** The set's pattern is `w` + noun initial + verb (`wrr`, `wsa`). Status has
    no noun, so the name is `w` + the verb's initial. It sits beside the session set (`wsa`, `wso`,
    `wsr`, `wsc`) without colliding: fish resolves a function by its whole name.
  - **Last in the catalog.** `FISH_SHORTHANDS` is ordered as both assemblies present it, and
    doctor's not-adopted line lists it in that order; appending keeps every existing position.
- **Layout:** one row in `src/shell/shorthands.ts`. The two assemblies and doctor's adoption check
  are table-driven, so they pick it up with no change.
- **Mechanisms:** `command ward status $argv`.
