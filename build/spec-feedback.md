# Spec Feedback — what building taught us

The running log of places the **intent** proved ambiguous, under-specified, contradictory,
over-specified, hard to implement, or not serving its stated purpose — discovered by trying to build
it. This is the payload of the experiment: building Ward to improve the spec for Ward.

Append an entry the moment you hit friction; do not batch them at the end (you will forget the
specifics). The build does **not** edit `intent/` to resolve these — it records the friction here,
proceeds on a stated assumption, and leaves the spec change for human review. (The one exception:
appending to a slice's own _Open questions_, or noting that the build _resolved_ an existing open
question, is allowed and should also be logged here.)

**Entry format**

- **Where** — the intent file and section (e.g. `intent/01-concepts/00-domain-model.md` → Identity).
- **Kind** — ambiguity / gap / contradiction / over-specification / hard-to-implement /
  doesn't-serve-purpose.
- **What** — what you hit, concretely, and why it blocked or slowed the build.
- **Assumption** — the decision you made to keep moving.
- **Proposed revision** — a concrete change to the spec (reword, add detail, cut, split, resolve an
  open question, …).

---

<!--
EXAMPLE (delete when the first real entry is added):

## SF-001 — <short title>

- **Where** — intent/0X-…/…md → <section>.
- **Kind** — ambiguity.
- **What** — …
- **Assumption** — …
- **Proposed revision** — …
-->
