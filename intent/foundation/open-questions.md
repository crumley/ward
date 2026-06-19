# Open Questions — cross-cutting

> **Layer:** intent · foundation (global). **Status:** placeholder skeleton.

Only the **genuinely cross-cutting** tensions live here — the ones that span slices. Each slice
carries its _own_ open questions inline (in its _Open questions_ section), so per-subsystem and
per-concept items move there, not here. This file also indexes those, so nothing is lost.

## Planned cross-cutting items

- **Append vs. rewrite line** (principle §12) — reflection and teaching want context to evolve;
  caching wants it stable. Where does evolving, rewritable context sit relative to the stable
  cacheable prefix? (Touches `concepts/sessions.md`, `concepts/reflection.md`,
  `design/concepts/sessions.md`.)
- **Intent/design boundary drift** — as `design/` fills in, watch for tool-naming creeping into
  `intent/`, and durable constraints stranded in `design/`.
- **Slice granularity** — is the current `foundation/concepts/subsystems` cut right, or will a slice
  want to split or merge as it grows? Optimize for agent legibility (few, coherent, not-huge files).
- **Cross-chunk reflection learnings** — insights that emerge only in aggregate
  (`concepts/reflection.md`).

## Index of per-slice open questions

Populate with pointers as slices are filled, e.g. `concepts/identity.md` → task codes, floor-letter
uniqueness, reuse-after-close; `concepts/roles.md` → persona↔scope cardinality;
`subsystems/messaging.md` → multiplexer-vs-store split; etc.
