# AGENTS.md — working in the Ward repository

You are in the repository where **Ward** is designed and built. This is the harness-neutral guide
for any agent working here; read it first. Ward's full purpose is in
[`intent/foundation/vision.md`](intent/foundation/vision.md). **This repo _builds_ Ward — it is not
itself a Ward workspace.**

## The four legs

The repo stands on four parallel trees; **`intent` governs the other three** (`README.md`):

- [`intent/`](intent/) — the **durable** purpose, concepts, and constraints, design-independent.
  Three groupings: `foundation/` (global vision + principles + glossary), `concepts/` (the domain),
  `subsystems/` (the eight swappable seams, each a contract). Start at
  [`intent/README.md`](intent/README.md).
- [`design/`](design/) — **one realization**: the tools, structures, formats, and algorithms chosen
  to satisfy the intent. Includes [`design/blanks-register.md`](design/blanks-register.md), the
  bridge to implementation.
- [`src/`](src/) — the code. [`test/`](test/) — the tests.

`design` + `src` + `test` move together; `intent` sits above them.

## The discipline (every change here honors it)

1. **Intent vs. design — the one test.** _If we swapped the design (store, multiplexer, harness,
   model, language, layout), would this statement change?_ **No** → it is intent, and it names no
   tool. **Yes** → it is design, and it lives in `design/`.
2. **One home per idea.** Every concept has exactly one canonical slice; every other slice **links**
   rather than restating it. Each file's _Canonical home for_ section declares what it owns. This is
   what keeps each idea in one place instead of smeared across files.
3. **Why, always.** Every concept and choice carries its reasoning. A statement without its _why_ is
   not done.
4. **The triangle.** Intent, design+code, and tests move together but not always atomically; when
   one diverges, reconcile it in a following step.
5. **Two audiences.** Everything serves a human (readable) and an agent (parseable).

## If you are here to…

- **Understand Ward** — follow the reading order in [`intent/README.md`](intent/README.md):
  `foundation/` → `concepts/` → `subsystems/` → [`intent/walkthrough.md`](intent/walkthrough.md).
- **Fill a slice** — write the durable constraints into the `intent/` file and the chosen technology
  into the matching `design/` file. Keep tool names out of `intent/`.
- **Build Ward** — read [`design/blanks-register.md`](design/blanks-register.md), settle the 🔴
  spine first, and trace every design decision back to the intent it serves.

## Conventions

- Markdown, hard-wrapped ~95 columns, matching the surrounding files.
- Cross-reference by relative path; keep links live.
- **Never name a tool, format, path, or field in `intent/`** — that is what `design/` is for.
- Don't introduce a concept that isn't needed.
