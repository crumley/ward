# Contributing to Ward

How we build **in this repository** — the engineering qualities every contribution honors. These are
about _working on Ward well_; they are distinct from [`intent/`](intent/) (what Ward _is_) and from
[`AGENTS.md`](AGENTS.md) (the four-leg discipline). Where a rule can be **enforced by a tool**, it
is — fast automated feedback is the whole point.

## Opinionated, automated formatting and linting — on everything

The more fast, automated checks tell a contributor (human or agent) that an artifact is in the right
form, the faster artifacts _reach_ the right form and stay aligned, consistent, and high-quality
over time. So Ward is **deliberately opinionated** and pushes every check into tooling:

- **Markdown** is formatted by **dprint** and link-checked by **lychee**
  ([`dprint.json`](dprint.json), [`lychee.toml`](lychee.toml)).
- **Code** is held to the same bar: TypeScript is formatted **and** linted by **Biome**
  ([`biome.json`](biome.json)) and strictly typed (`tsc`, [`tsconfig.json`](tsconfig.json)). This
  closes the gap this file used to record ("only markdown is covered, because no code exists yet") —
  wired in by [`design/0001-dev-foundation/`](design/0001-dev-foundation/README.md), before
  significant code, exactly as mandated.
- **The CI workflow** is linted by **actionlint**. There is only one YAML file in the tree, but it
  is the file that runs the gate — so it is held to the same bar as everything else.
- **One command each way** ([`mise.toml`](mise.toml)): run `mise run fmt` as you write (fixes code
  and markdown in place) and `mise run check` before you push — the no-writes gate covering code
  **and** markdown (Biome + dprint + `tsc` + `bun test` + lychee + actionlint). CI runs the **same**
  `mise run check`, nothing else, on **ubuntu and macOS** — Ward is a CLI developed on macOS and run
  on Linux, so both platforms have to stay green.
- **The toolchain is pinned.** `mise.toml` pins the tools (bun, dprint, lychee, actionlint);
  `bun.lock` pins the JS dependencies (Biome, TypeScript among them). `mise install` provisions
  everything, identically on a laptop and in CI. Optional sugar: with **direnv**, [`.envrc`](.envrc)
  puts the pinned toolchain on PATH the moment you enter the directory (`direnv allow` once).
- **Pins are kept moving.** [`.github/dependabot.yml`](.github/dependabot.yml) opens weekly, grouped
  PRs for the two machine-updatable pinning homes — the GitHub Actions and the JS dependencies in
  `bun.lock`. The binaries in `mise.toml` are outside Dependabot's reach and stay a deliberate
  hand-reviewed bump.

**Why so strict:** an automated check is feedback an agent gets in seconds, on every iteration; a
convention enforced only by review is feedback it gets late, inconsistently, or never. Strong
tooling is how quality compounds instead of eroding.

## Fast iteration, fast feedback

The test setup must make the **write → fail fast → fix → pass fast** loop tight, for both unit and
integration tests. A contributor should be able to write a test, watch it fail in seconds, change
the code, and watch it pass — without a slow build or a heavy harness in the way. This is a
**quality of the setup**, stated independently of any framework: whatever runner a build chooses,
rapid feedback is a selection criterion, not an afterthought.

## Tests: high assertion density, setup at the bottom

A test should be **readable top-down** — its first lines say _what_ is being verified, not _how_ it
is wired up:

- **Lead with the assertions / the cases.** Open the file with the dense statement of what is
  covered. Push fixtures, mocks, builders, and other boilerplate **below** the cases (or into
  helpers), so a reader grasps the _what_ before deciding whether they care about the _how_.
- **Prefer table-driven tests.** A table of `(input → expected)` cases is information-dense and
  cheap to extend — a new case is a new row, not a new function. The intent invariants are the
  model: a derived-status check is a tight list of `states → status` rows.

**Why:** you read a test to learn what it guarantees; dense-first, boilerplate-last makes that fast,
and table tests keep the density while staying easy to grow.

## Markdown conventions (recap)

Hard-wrapped prose, relative cross-links kept live, numbered files for reading order — all enforced
by dprint + lychee. See [`AGENTS.md`](AGENTS.md) → Conventions for the four-leg rules these sit
under.
