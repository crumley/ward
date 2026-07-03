# Design — Remote provider & the privacy gate

> **Serves intent:** [remote-provider seam](../intent/02-subsystems/06-remote-provider.md), §4
> (privacy), §18 (gated actions), [work-lifecycle](../intent/01-concepts/03-work-lifecycle.md) (PR
> set). **Supersedes:** nothing. The seam calls the translation gate "the highest-stakes blank —
> design it first"; this plan pins it.

## Decisions

- **One upstream gate, its own module** ([`src/seams/privacy.ts`](../src/seams/privacy.ts)).
  `translateOutward` re-authors local text for the remote audience — strips a provenance
  front-matter block, redacts every prose form of the **closed** role vocabulary (exhaustive because
  ROLES can't grow), persona names (supplied as data), and local/absolute paths — then **verifies**
  and throws (fail-closed) if any forbidden token survives.
- **Structural enforcement of the single gate.** A branded `Sanitized` type is produced _only_ by
  the gate, and a branded `Authority` (§18) _only_ by `humanAuthority`/`delegatedAuthority`. The
  remote provider ([`remote.ts`](../src/seams/remote.ts)) takes `Sanitized` text and an `Authority`
  on every mutation — so a raw string or an unauthorized post **will not compile**. Translation
  governs _what_ crosses; authority governs _whether_ it crosses now.
- **PR set as task state** ([`domain/remote.ts`](../src/domain/remote.ts)): `trackPr` /
  `advancePrState` / `listPrs`; `openPrCount` feeds the derived `in-review` overlay; `completeTask`
  closes a task only when **all** PRs are merged.
- The forge is an **in-memory stub** in v2; a real forge is a thin adapter behind the same
  interface.

## What `src/` realizes it

`seams/privacy` (gate + brands) · `seams/remote` (provider stub) · `domain/remote` (link, PR
tracking, completion guard) · CLI `remote comment` (drives text through the gate end-to-end).

## Invariants under test

`test/intent/privacy-gate` (exhaustive redaction across every role form; fail-closed; provider
receives only sanitized+authorized content); acceptance §7 (redactions) / §8 (completion guard).
