# Ward Intent

The **design intent**: what Ward is for, the concepts it models, and the constraints every build
must honor — each with its _why_, at a level above any one implementation.

Intent is **durable**. It is the one leg of the four (see [`../README.md`](../README.md)) that does
not move when a tool moves. It changes only when our understanding of Ward changes. It is organized
for **understanding** — by concept and by seam.

## What/why vs. how — the dividing line

The boundary between this tree and [`../design/`](../design/):

> **Intent is the _what_ and the _why_. Design is the _how_.** Intent says what must be true and why
> it matters; design says how we build it.

A useful heuristic: _if we changed how we build it, would this sentence still hold?_ If yes, it
belongs here; if it only makes sense given a particular build, it belongs in
[`../design/`](../design/). This is a **guide, not vocabulary policing** — intent may name a
concrete tool when it genuinely clarifies (an analogy, a fixed external dependency, a worked
example, or a durable choice everyone treats as settled). What matters is that the substance is the
what/why, not a build choice. A seam contract names what any design must satisfy; the design draft
behind it names the tool.

## Three groupings

| Group                              | Holds                                                                                                                                                                                                                              |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`00-foundation/`](00-foundation/) | **Global** intent — the [vision](00-foundation/00-vision.md) and [principles](00-foundation/01-principles.md), plus the [glossary](00-foundation/glossary.md) and cross-cutting [open questions](00-foundation/open-questions.md). |
| [`01-concepts/`](01-concepts/)     | The **domain**: the nouns and processes, with their why — hierarchy, roles, sessions, the work lifecycle, reflection, context loading, and the workspace's own lifecycle.                                                          |
| [`02-subsystems/`](02-subsystems/) | The **swappable machinery** (the seams): the constraints any design of each must satisfy.                                                                                                                                          |

## The two governing rules

1. **What/why vs. how.** Keep this tree to the durable what & why; the how lives in
   [`../design/`](../design/). (Heuristic above.)
2. **One home per idea.** Every concept has exactly one canonical slice; every other slice **links**
   to it rather than restating it. Each file's _Canonical home for_ section declares what it owns. A
   genuinely two-sided contract states each side once, on its own side, and links.

Plus, always: **why on every statement**, and **two audiences** (readable prose for humans, stable
headings/links for agents).

## Reading order

Directories and files are **numbered in the order to read them**. Unnumbered files are _references_,
read when needed.

1. [`00-foundation/00-vision.md`](00-foundation/00-vision.md) — why Ward exists; the prime directive
   (context management) and the hospital metaphor.
2. [`00-foundation/01-principles.md`](00-foundation/01-principles.md) — the cross-cutting invariants
   §1–§19 every slice honors.
3. [`01-concepts/`](01-concepts/) — the domain, `00`→`06`: domain model, scopes & personas, sessions
   & lifecycle, work lifecycle, reflection & evolution, context loading, workspace lifecycle.
4. [`02-subsystems/`](02-subsystems/) — the seams, `00`→`07`, each a contract: metadata store,
   multiplexer, messaging, harness, model selection, theming, remote provider, human shell.
5. The two **walkthroughs** (optional, the fastest way to see the pieces fit) — read in order:
   [`03-walkthrough-getting-started.md`](03-walkthrough-getting-started.md), from installing Ward to
   a workspace with its first repository, and
   [`04-walkthrough-delivering-work.md`](04-walkthrough-delivering-work.md), the minimum spine that
   delivers a unit of work in it.
6. References: [`00-foundation/open-questions.md`](00-foundation/open-questions.md) (cross-cutting
   tensions) and [`00-foundation/glossary.md`](00-foundation/glossary.md) (term → defining slice).

## The intent ⇄ design+code ⇄ tests triangle

These move together but **not always atomically**. Any one may change first — a test that derives
intent, a discovery while coding, a revised concept. The discipline: when one diverges from another,
**reconcile in a following step** and record whatever touches intent here. Divergence is not failure
— it means we learned something.
