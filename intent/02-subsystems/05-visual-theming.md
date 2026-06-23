# Subsystem: Visual Theming & Identity Coordination

> **Layer:** intent · subsystem (seam). The contract any design must honor; the _how_ is planned in
> [`../../design/`](../../design/). **Status:** living.

## Responsibility

Give each unit of work a **consistent visual identity** — carrying both **which** specific thing it
is (a per-instance **accent**) and **what kind** of thing it is (a per-type **glyph**) — so a human
can tell at a glance which task/room a window belongs to, coordinated across _all_ surfaces. The
identity is a **recorded, nameable attribute**, so it serves the **agent** audience too (§8): a
human who says "the blue one" or "the project" can be **resolved by an agent** back to the concrete
identity.

## Constraints any design must honor

- **Assign a stable, distinguishable visual identity** (working assumption: an **accent color**)
  **deterministically** from the work's identity
  ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)), and **without
  collisions** among the things a human sees at once. _Why deterministic:_ the same work should
  always look the same across reboots and machines, so the human builds muscle memory ("the blue one
  is `4A12`"); a random or session-order assignment would re-color on every restart. _Why
  collision-free:_ the identity exists to **distinguish** — two concurrent rooms sharing a color is
  the one failure that makes it useless; collisions need only be avoided among what is visible
  together.
- **Mark the _kind_ of thing with a typed glyph** (working assumption: an **emoji**). Beyond the
  per-instance accent, assign a **stable icon by concept type** — a project, a task, the **grouping
  of sessions** around a task, a room/session
  ([`../01-concepts/00-domain-model.md`](../01-concepts/00-domain-model.md)) — so the human reads
  _what kind of thing this is_, not only which one. _Why two cues:_ the accent answers "which one,"
  the glyph answers "what kind" — together a label like "🗂️ blue `4A12`" is self-describing. The
  glyph is **categorical** (shared by every thing of a type); the accent is **per-instance** (must
  be collision-free among what's visible together) — only the accent carries the
  distinguish-them-apart burden.
- **Record the visual identity as a nameable attribute, legible to the agent audience.** The accent
  and glyph are not only painted on a surface — they are **recorded on the work's identity** and
  **expressible in words** ("blue," "the project"), so an agent can **resolve a human's visual
  reference** back to the concrete identity. _Why:_ the human will not always recall a handle like
  `4A12`; "the blue one" must be enough to disambiguate, and only an agent that can _read_ the
  color/glyph mapping can act on it. This is the two-audiences principle (§8) applied to the
  navigation cue — visual for the human, recorded-and-nameable for the agent.
- **Apply it consistently across every surface** the human uses for that work — the multiplexer's
  status/borders ([`01-session-multiplexer.md`](01-session-multiplexer.md)), an editor window on the
  same worktree, any other window. _Why coordinated:_ a cue that holds in one surface but not
  another re-introduces the "which window is this?" friction it exists to remove.
- **Applying/removing a theme is one of the idempotent lifecycle hooks**
  ([`../01-concepts/03-work-lifecycle.md`](../01-concepts/03-work-lifecycle.md)): creating a
  worktree applies its accent, teardown removes generated theme state, re-running on resume
  converges without duplicating.

## What this is NOT

- **Not decoration.** The identity is a **functional** navigation aid (§8) for both audiences, not a
  cosmetic preference.
- **Not a commitment to color or to particular surfaces.** The contract is a _stable,
  distinguishable, coordinated_ identity carrying a _which_ cue and a _kind_ cue; the specific
  medium (which color, which emoji, a text label) and the set of surfaces may change.
- **Not part of any remote artifact.** The cue is **local** and never crosses the privacy boundary
  (§4) — accents and glyphs, like persona names, are workspace-internal and never appear in a
  commit, PR, or remote item. _It is, however, legible to the **local agent** audience_ — recorded
  and nameable so an agent can resolve "the blue one" — which is the opposite of leaking outward.

## Canonical home for

- The **theming contract**: a per-work visual identity carrying a **per-instance accent**
  (deterministic, collision-free) _and_ a **per-type glyph**, **recorded as a nameable attribute**
  (legible to human _and_ agent, §8), applied and torn down through idempotent hooks, coordinated
  across every surface.

## Left to implementation

- The palette and the deterministic assignment function (and its collision-avoidance scope); the
  **glyph/emoji set and which concept types get one**; which surfaces are themed and how each is
  driven; the exact setup/teardown hook steps; how the accent **and glyph** are recorded so they
  stay stable across resumes **and so an agent can resolve a human's "the blue one" reference**.
  Planned in [`../../design/theming.md`](../../design/theming.md).

## Open questions

- **Resolving an ambiguous visual reference.** Within the visible set the accent is collision-free,
  so "the blue one" is unambiguous; across the _whole_ workspace two things may share a color. Does
  agent resolution lean on the **visible context** (what the human can see now), require a
  disambiguation prompt, or both? (The human shell's interactive picker is one concrete
  disambiguation path — [`07-human-shell.md`](07-human-shell.md).)
