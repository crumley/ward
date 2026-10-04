# 0000 — Spec-feedback

> Intent frictions found while building `<entry title>`.

Create this file only when the build raises at least one SF — an entry with no frictions has no
spec-feedback file, and the absence says so. This file is the entry's adjudication surface and is
read on its own — an adjudication session loads it without the entry's README, so each SF carries
enough context to be ruled on directly.

Each SF: a stable id (`SF-NNN`, unique within this entry), the intent slice + section, the friction,
the **assumption** made to keep moving, and a concrete **proposed revision** for human review.
`intent/` is never silently rewritten. Each SF ends in a `**Status:**` line, written `pending` from
the start and edited in place when it settles —
`adjudicated — <link to the intent change that
settled it>` or `declined — <one-line why>` — while
everything above it stays as written.

## SF-001 — <the friction, in one line>

- **Slice:** <relative link to the intent slice>, <section>.
- **Friction:** <what building showed the slice does not say, or says wrongly>.
- **Assumption made to keep moving:** <what the build did meanwhile>.
- **Proposed revision:** <the concrete intent edit, for human review>.
- **Status:** pending.
