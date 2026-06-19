# Design: Remote Work-Item Provider

> **Layer:** design — one realization. Names tools/structures; may change. **Status:** placeholder —
> to be filled during implementation.

## Governed by

`../../intent/subsystems/remote-provider.md` — link a task to a remote item, two-way status, accept
already-sanitized content, report PR status.

## Realization (to fill)

- A **hosted git forge** (issues + pull requests) behind a thin adapter; replaceable by other
  forges.
- The **adapter API**; attach/merge **reconciliation**; **PR-status polling**.
- The **gated-post authority flow** (the outward post/merge gate; privacy translation is enforced
  upstream — see the privacy-translation gate, a 🔴 spine decision).

## Blanks to settle

- See `../blanks-register.md` (which forge; adapter API; attach/merge reconciliation; PR polling;
  gated-post flow; the upstream privacy-translation gate).
