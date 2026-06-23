# AGENTS.md — working in the Ward repository

You are working in the repository where **Ward** is designed and built. This is the
harness-neutral guide for any agent (or human) operating here. **Read it first.**

Ward is a tool for operating structured human+agent workspaces; its full purpose is in
[`intent/00-foundation/00-vision.md`](intent/00-foundation/00-vision.md). **This repo is about
*building* Ward — it is not itself a Ward workspace.**

## The four legs

The repo stands on four parallel trees; **`intent` governs the other three** (see
[`README.md`](README.md)):

- [`intent/`](intent/) — the **durable what & why**: vision, principles, the domain concepts, and
  the swappable seams (each stated as a **contract**). Three groupings:
  [`00-foundation/`](intent/00-foundation/), [`01-concepts/`](intent/01-concepts/),
  [`02-subsystems/`](intent/02-subsystems/). Start at [`intent/README.md`](intent/README.md).
- [`design/`](design/) — the **how**: implementation plans (currently drafts), organized for
  building, **not** a mirror of intent. Start at [`design/README.md`](design/README.md).
- [`src/`](src/) — the code (greenfield). [`test/`](test/) — the tests.

`design` + `src` + `test` move together; `intent` sits above them.

## The discipline (every change here honors it)

1. **What/why vs. how.** Intent holds what must be true and why; design holds how we build it. A
   useful heuristic: *if we changed how we build it, would this statement still hold?* If yes it is
   intent; if it only makes sense given a particular build it is design. A guide, not vocabulary
   policing — intent may name a tool when it genuinely clarifies; a seam contract names *what any
   design must satisfy*, its design draft names the tool.
2. **One home per idea.** Every concept has exactly one canonical slice; every other slice
   **links** rather than restating it. Each file's *Canonical home for* section declares what it
   owns.
3. **Why, always.** Every concept and choice carries its reasoning. A statement without its *why*
   is not done.
4. **The triangle.** Intent, design+code, and tests move together but not always atomically; when
   one diverges, reconcile it in a following step. Divergence means we learned something.
5. **Two audiences.** Everything serves a human (readable) and an agent (parseable).

## If you are here to…

- **Understand Ward** → follow the reading order in [`intent/README.md`](intent/README.md):
  `00-foundation/` → `01-concepts/` → `02-subsystems/`, then
  [`intent/03-walkthrough.md`](intent/03-walkthrough.md).
- **Capture a requirement** → write the durable what & why into the relevant `intent/` slice; if it
  defers a decision to the build, note it inline (*Left to implementation*) and carry the residue
  into the matching `design/` draft.
- **Plan or do the build** → work in [`design/`](design/), spine first, each plan pointing back to
  the intent it serves. Trace every plan to a contract.

## Conventions

- Markdown with hard-wrapped prose (~95 columns), matching the surrounding files.
- **Numbered for reading order.** `00-`, `01-`, `02-` prefixes on dirs and files sort into the
  order to read them; unnumbered files (`README.md`, glossary, open-questions) are references read
  out of sequence. Renumber neighbors if you insert a step, and update references.
- Cross-reference by relative path; keep links live.
- Never name a tool in an `intent/` concept where a constraint would do; never strand a durable
  constraint down in `design/` where it would be lost when the tool is swapped.
