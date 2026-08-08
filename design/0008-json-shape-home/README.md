# 0008 — A living home for the JSON shapes

> The `--json` output shapes became a contract in [`0005`](../0005-agent-audience/README.md) — and
> were documented inside a ledger entry, which goes stale by design the moment a later entry adds a
> field. This entry gives the contract a living, always-current home: the tool describes it itself,
> via a `ward schema` read verb whose JSON Schema ships inside the binary.
>
> **Status:** accepted · **Started:** 2026-08-08

Design entries are superseded, never updated (the ledger rule), so 0005's "The `--json` shapes"
section was current for exactly one entry. The shapes, though, are a **contract** — the thing an
agent programs against — and a contract needs a home that is current by construction, not by
discipline. Documentation that is emitted by the same build that emits the documents cannot drift
from them; that is the §6/§8 answer to staleness, and it makes the contract discoverable without
reading this repository at all.

## Serves intent

- [`principles`](../../intent/00-foundation/01-principles.md) §6 (deterministic inspection) — the
  contract itself becomes inspectable state: the same build answers `ward schema` with the same
  bytes, and an unknown verb is refused deterministically, never guessed at.
- [`principles`](../../intent/00-foundation/01-principles.md) §8 (two audiences) — the agent
  audience learns the machine-readable shapes from the machine itself; the schema document is the
  one form both audiences read.
- [`principles`](../../intent/00-foundation/01-principles.md) §12 (token economy) — one
  `ward schema` call fetches the whole contract as one deterministic document; the alternative is an
  agent reading source files or stale design entries to reverse-engineer a shape.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — a new read verb in the noun/verb
  tree; all real logic lives below the shell (`src/cli/schema.ts`), and the verb reads true to the
  operation.

## Scope

- **In:**
  - **`ward schema [VERB...]`** — with no argument, one JSON document mapping every `--json` read
    verb (keyed by its own CLI words: `status`, `project list`, …, `doctor`) to the JSON Schema of
    its output; with words, that one verb's schema alone. Unknown words are refused legibly (exit 1,
    nothing on stdout, the known verbs named). Works outside a workspace — the contract is the
    build's, not the record's.
  - **The registry, `src/cli/schema.ts`** — one zod schema per verb's output document and one
    registry row per verb; the JSON Schema is emitted from it (`z.toJSONSchema`), the builders in
    `json.ts` return its inferred types, and the tests validate live output under it. Adding the
    next `--json` verb is a one-place change.
  - **The live proof** — a table-driven test that runs each `--json` verb against a real temp
    workspace with the full spine in flight and validates the output, strictly, under the shape the
    schema is emitted from; plus the slice/determinism/refusal cases.
  - **The ledger move** — 0005's shapes section gains a minimal appended pointer (superseded for
    currency, content intact); the workspace `AGENTS.md` template teaches contract discovery.
- **Deferred:**
  - **A human-prose rendering of the schemas.** _Why safe:_ the pretty-printed JSON document is
    already legible to a human, and a paraphrase is a second copy that can drift — the exact failure
    this entry removes; a friendlier rendering can be added additively behind the same registry if
    wanted.
  - **Shapes for the write-verb reports.** _Why safe:_ 0005 deferred `--json` on the mutation
    reports themselves; whenever a report gains the flag it gains a registry row, and nothing built
    here constrains its shape.
  - **Covering `catalog list --json`** (entry 0007, concurrently on its own branch). _Why safe:_ by
    design it slots in after merge as one shape + one registry row, and the test table picks it up
    automatically because it derives each verb's argv from its registry key.
  - **A version envelope / `$id` on the emitted schemas.** _Why safe:_ the schema always travels
    with the binary that emits it — that is the whole currency guarantee — so cross-build schema
    exchange has no consumer today; identifiers can be added additively if one appears.
  - **Validating live output against the emitted JSON Schema text with a second validator** (ajv or
    similar). _Why safe:_ tests validate live output against the zod source (strictly), and the
    emitted document is `z.toJSONSchema`'s deterministic image of that same source, with zod pinned
    by `bun.lock` and the bytes pinned by the determinism test; a second validator would be testing
    zod's converter, not Ward's contract — a dependency the load does not justify (the sizing
    discipline of [ADR 0005](../decisions/0005-store-stack.md)).
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. for each of the six `--json` verbs, the live document from a spawned CLI against a real
     workspace validates strictly under the verb's shape, and `ward schema <verb words>` emits
     exactly that shape's JSON Schema;
  2. `ward schema` with no argument covers exactly the six verbs, in order; each entry equals the
     one-verb document (the slice invariant); output is byte-identical across runs; it works in a
     directory with no workspace;
  3. unknown words are refused with exit 1, an error naming the known verbs, and an empty stdout;
  4. the installed `AGENTS.md` teaches `ward schema` alongside the 0005 driving lessons.

## Design

- **Decisions:** rests on [ADR 0005](../decisions/0005-store-stack.md) (zod is already the repo's
  schema tool — v4, with native JSON Schema conversion; no new dependency). Entry-local:
  - **The home is the binary, not a document.** Three candidates: a living markdown page (stays
    prose — drifts from the build exactly the way 0005's section did, just on a different cadence);
    re-documenting shapes in each entry that touches them (the staleness ritual this entry exists to
    end); the tool emitting its own contract. Chosen: the tool. What ships in the build cannot
    disagree with the build, and an agent discovers the contract from the `ward` it is actually
    running — version skew answered for free.
  - **Format: JSON Schema proper, derived from zod shapes.** Documented example shapes are cheap but
    not machine-checkable — they drift silently, which is the disease itself. A bespoke smaller
    notation is a format both audiences would have to learn (against §8). JSON Schema is the lingua
    franca an agent can validate against with stock tooling, and zod v4 emits it natively. The
    shapes are declared **standalone** in `src/cli/schema.ts` — describing the output documents, not
    the store records — so 0005's rule (shapes built explicitly, never by serializing internals)
    survives; the modules below stay free to refactor.
  - **The hand-built builders stay; the schemas type-pin them.** The builders exist to fix key order
    — the byte-determinism (§6) a validator does not promise — so schema-driven emission would trade
    a proven guarantee for elegance. Instead, each builder's declared return type is its schema's
    inferred type: builder/schema drift is a compile error before it is a failing test. One source
    of truth, three enforcement layers — `tsc`, strict validation of live output, and the emitted
    schema all reading the same registry.
  - **`strictObject`, so the emitted schema is exact** (`additionalProperties: false`). The schema
    travels with the build that emits it, so exactness can never strand a caller — and strictness is
    precisely what lets the live test catch an undocumented field. The additive evolution policy is
    unharmed (the next build ships the next schema) and is visible in the emission: optional fields
    are simply absent from `required`, never nullable.
  - **Surface: a top-level `ward schema [VERB...]`, named by the verb's own CLI words.** Not a
    `--schema` flag per verb: that gives no single answer to "what is the whole contract," grows a
    branch in every verb's wiring, and requires already knowing the verb you are discovering. Not
    under a workspace noun: the contract is not workspace state — like doctor's machine half, the
    verb must work before any workspace exists. The multi-word argument makes discovery and
    invocation agree by construction: `ward schema task list` describes `ward task list --json`.
  - **JSON is its only rendering — the verb takes no `--json` flag.** §8's two-form split exists for
    artifacts where one form cannot serve both audiences; a schema document is the artifact both
    audiences read, and a prose paraphrase of it could drift from the thing it paraphrases.
    Pretty-printing is the human affordance. The registry therefore covers exactly the verbs that
    accept `--json`; `schema` itself is not in it.
  - **Refusal is the existing error path.** Unknown words raise `WardError` — exit 1, a complete
    message naming the known verbs, stdout untouched — the same legible failure every verb uses.
- **Layout:** `src/cli/schema.ts` (the shapes, the registry, `allSchemasJson`/`verbSchemaJson`);
  `src/cli/json.ts` (builder return types pinned to the inferred shape types); `src/cli/index.ts`
  (the `schema` command and its one `cmdSchema` line — kept minimal and localized);
  `src/workspace/templates.ts` (one new driving lesson); `test/cli/schema.test.ts` (the table and
  the contract cases); `test/workspace/create.test.ts` (the lesson row);
  [`0005`](../0005-agent-audience/README.md) (the appended pointer).
- **Mechanisms:**
  - _The registry:_ `jsonVerbShapes`, an ordered record from a verb's CLI words to its zod schema.
    Insertion order is the documented verb order; `JSON.stringify` preserves it, which is what makes
    the whole-contract document byte-deterministic. The key doubles as the invocation: tests derive
    each verb's argv as `key.split(' ') + ['--json']`.
  - _Emission:_ `z.toJSONSchema` at call time — no caching, no build step; machinery sized to a CLI
    invocation. Each verb's schema is a self-identifying document (its own `$schema`), and the
    no-argument form composes exactly those documents, so slicing is invariant.
  - _Growth:_ a new `--json` verb = its shape + its registry row in `schema.ts`. The compile error
    (builder without a shape type), the auto-derived test row, and the new `ward schema` key all
    follow from that one edit — the home stays current as a side effect of adding the verb.

## Build log

### 2026-08-08 — The contract's home built end to end

**Goal.** Everything in Scope in one iteration. **What was done.** Built `src/cli/schema.ts`: one
standalone zod shape per `--json` verb document (task shape shared by `task list` and `status`,
which extends it with `openSessions`), the ordered `jsonVerbShapes` registry keyed by CLI words, and
the two emitters (`allSchemasJson`, `verbSchemaJson` — the latter refusing unknown verbs via
`WardError`). Pinned every builder in `src/cli/json.ts` to its schema's inferred return type. Wired
`ward schema [VERB...]` in `src/cli/index.ts` — one command definition, one switch case, one
function; `multiple(argument(...))` carries the verb's own words. Grew the workspace `AGENTS.md`
template with a "discover the contract from the tool" lesson (content-only change: the establishment
step count stays ten; fresh workspaces baseline the new bytes). Appended the superseded-for-currency
pointer under 0005's shapes heading. Tests: `test/cli/schema.test.ts` — the registry-driven table
(per verb: live output from a spawned CLI against a full-spine temp workspace validates strictly
under the shape; `ward schema <words>` equals the shape's JSON Schema), the whole-contract keys +
slice invariant, byte-determinism, the no-workspace case, the legible refusal, and the
stability-policy assertions on the emitted task schema; plus the grown lesson row in
`test/workspace/create.test.ts`.

**What works now — with the commands that prove it** (Bun 1.3.14, zod 4.4.3, macOS):

- `bun test` → `85 pass, 0 fail, 257 expect() calls` across 11 files — all four acceptance
  scenarios, including the six-verb live-validation table and the slice/determinism/refusal cases.
- `mise run check` → green end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Smoke: `bun src/cli/index.ts schema` emits the six-key contract document;
  `bun src/cli/index.ts schema repo list` emits that verb's schema alone;
  `bun src/cli/index.ts schema flimflam` exits 1 with
  `no --json verb named 'flimflam' — known verbs: …` and an empty stdout.

**Decisions** (entry-local, found while building):

- **`openSessions` stays a mutable array in the contract type.** The status module hands the builder
  a `readonly string[]`; the builder copies (`[...openSessions]`) rather than loosening the shape
  with zod's `.readonly()` — the contract type is the fixed thing, the internal type adapts to it.
- **The emitted bytes are zod 4.4.3's, accepted as-is.** `z.toJSONSchema` adds `$schema` per
  document and the safe-integer `maximum` that `.int()` implies; both are harmless and honest.
  `bun.lock` pins zod, and the byte-determinism test pins the output — if a zod upgrade ever changes
  the emission, the test surfaces it as a deliberate diff, exactly like the `Bun.YAML.stringify` pin
  in [ADR 0005](../decisions/0005-store-stack.md).

**Next.** When 0007's `catalog list --json` merges: one shape + one registry row completes its
coverage (the test table follows automatically). When the write verbs gain `--json` (deferred since
0005), their reports join the same registry.

## Spec-feedback

- **SF-001** — [`human-shell`](../../intent/02-subsystems/07-human-shell.md), "Constraints any
  design must honor". _Friction:_ "the machine-readable output contract is discoverable from the
  tool itself" reads like durable intent — it would hold however the shapes are realized
  (documentation shipped in the binary cannot drift from the build, which is a constraint-level
  _why_, not a build detail) — yet it lives only in this design entry; nothing in the contract asks
  for it. _Assumption to keep moving:_ the capability is built as a design choice under §6 and §8,
  which license it without naming it. _Proposed revision:_ the human-shell Constraints gain a bullet
  — the structured CLI's machine-readable output shapes are **discoverable from the tool itself** (a
  self-describing contract), so an agent never has to read Ward's repository to learn a shape; the
  exact verb stays left to implementation.
