# Implementation Blanks Register

> **Layer:** design — the bridge to an implementation plan. **Status:** placeholder skeleton.

Aggregates, in one place, every decision the intent deliberately leaves open — so an implementation
plan can consume them and no deferred decision is silently forgotten. **Not a plan:** it sequences
and designs nothing. As a blank is filled, fold the answer into the relevant `design/` file (and
`src/` + `test/`) and check it off here.

## Planned form

Two tiers, carried from the source:

- 🔴 **Settle early — the spine.** Foundational decisions other work reads or writes: document-type
  catalog + schemas; identity scheme specifics; task state machine; status roll-up derivation; the
  privacy-translation gate; the caller-identity signal; workspace layout
  - version stamp.
- 🟡 **Settle during build — by subsystem.** Local decisions taken when each subsystem is built
  (store, sessions/context-loading, harness, multiplexer, messaging, model-selection,
  delivery/hooks/policy, reflection, theming, remote-provider, shell/CLI).

Each entry: **decision · governing intent slice · why-now tag.**
