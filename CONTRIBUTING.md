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
- **The CI workflows** are linted by **actionlint**. They are the files that run the gate — so they
  are held to the same bar as everything else.
- **One command each way** ([`mise.toml`](mise.toml)): run `mise run fmt` as you write (fixes code
  and markdown in place) and `mise run check` before you push — the no-writes gate covering code
  **and** markdown (Biome + dprint + `tsc` + `bun test` + lychee + actionlint). CI runs the **same**
  gate as its three tiers — `mise run static`, `mise run test:fast`, `mise run test:live` — one job
  each, in parallel, on **ubuntu and macOS** (Ward is a CLI developed on macOS and run on Linux, so
  both platforms have to stay green). `check` is exactly those three tasks, so a green
  `mise run check` locally is the whole of what CI asks, and a red CI job names the one task to
  rerun. The tiers are below, under
  [Tests: three kinds, three tiers](#tests-three-kinds-three-tiers).
- **The toolchain is pinned.** `mise.toml` pins the tools (bun, dprint, lychee, actionlint);
  `bun.lock` pins the JS dependencies (Biome, TypeScript among them). `mise install` provisions
  everything, identically on a laptop and in CI. Optional sugar: with **direnv**, [`.envrc`](.envrc)
  puts the pinned toolchain on PATH the moment you enter the directory (`direnv allow` once).
- **So is the tmux the live tier proves.** `mise.toml`'s `[vars]` name one tmux release (with its
  libevent and utf8proc, each by sha256); `mise run tmux:pinned` builds it from source into
  `~/.cache/ward/tmux/<version>/`, and `mise run test:live` puts it first on PATH whenever it is
  there. CI builds it once per change to `mise.toml` and caches it, on both platforms, and the live
  tier refuses to run in CI against any other tmux. Ward itself still runs on any tmux from 3.2; the
  pin is what the gate proves, so that a runner image moving its tmux cannot turn a PR red. A
  nightly workflow ([`nightly.yml`](.github/workflows/nightly.yml)) runs the live tier against each
  runner's own tmux instead, so drift away from the pin is seen without blocking anyone.
- **Pins are kept moving.** [`.github/dependabot.yml`](.github/dependabot.yml) opens weekly, grouped
  PRs for the two machine-updatable pinning homes — the GitHub Actions and the JS dependencies in
  `bun.lock`. The binaries in `mise.toml`, and the tmux pin, are outside Dependabot's reach and stay
  a deliberate hand-reviewed bump. Bumping tmux: change `tmux_version` and `tmux_sha256` in
  `mise.toml` (the sha256 of the release's `tmux-<version>.tar.gz`), run `mise run tmux:pinned` and
  `mise run test:live`, and push; CI's cache key is `mise.toml`'s hash, so it rebuilds.

**Why so strict:** an automated check is feedback an agent gets in seconds, on every iteration; a
convention enforced only by review is feedback it gets late, inconsistently, or never. Strong
tooling is how quality compounds instead of eroding.

## Fast iteration, fast feedback

The test setup must make the **write → fail fast → fix → pass fast** loop tight, for both unit and
integration tests. A contributor should be able to write a test, watch it fail in seconds, change
the code, and watch it pass — without a slow build or a heavy harness in the way. This is a
**quality of the setup**, stated independently of any framework: whatever runner a build chooses,
rapid feedback is a selection criterion, not an afterthought.

## Tests: three kinds, three tiers

Ward's suite is a deliberate mixture of unit and integration tests. Most tests check Ward's own
logic and should run in milliseconds, so the suite stays a loop a contributor runs constantly; a
smaller tier does the whole thing for real — a real tmux, a real terminal, the real CLI process — to
prove that the pieces the fast tests take on trust actually meet. The cost model is measured, not
guessed: a spawned `ward` process costs on the order of 100 ms, a fresh workspace about the same and
half a dozen git processes, and a real-tmux case seconds, while an in-process call costs
microseconds. A suite that pays the expensive price by default gets slow, and a slow gate is a gate
people route around.

**The default: no real tmux, no spawned process, no fresh workspace** — unless that is what is under
test. Reach for each only when the thing you are verifying lives there:

- **A unit test** calls Ward's code in-process and checks what it decides: a parser, an argv
  builder, a derivation over records, a plan. It is the default for any new behavior. Where the code
  talks to tmux, git, the forge or a harness, the test hands it a fake (a scripted runner, a
  [`FakeHost`](test/agent/fake-host.ts), a fake `gh`) and asserts what Ward _asked for_ and what it
  did with the answer. A workspace a unit test needs is built in the cheapest form that is still
  real, and shared or reused where the cases do not write to it.
- **A CLI test** runs `ward` as a user does and checks the contract a caller sees: argument parsing,
  the exit code, stdout versus stderr, `--json` shapes, the wording of a refusal. Run the verb
  in-process wherever the case is about Ward's behavior; spawn a real process only where the process
  boundary is the point — the entry point itself, environment and terminal detection, signals, or a
  pipe — and keep at least one spawned case per such path, so in-process coverage elsewhere is
  backed by the real thing.
- **A live test** drives a real tmux on a private server, usually through a real pseudo-terminal,
  and checks what only the real program can show: that the argv Ward builds does what Ward assumed,
  and how tmux, a terminal and Ward behave together (attach, observe, switch-client, titles, a
  window that dies). It is the integration tier, and it is expensive and the most exposed to the
  outside world, so it is reserved.

**When a test earns the live tier.** A case belongs there when what it proves depends on tmux's real
behavior — an argv's effect rather than its spelling, an interaction between a client, a server and
a run — and no fake could be trusted to answer the same way. A case whose question is Ward's own
logic (what it decides given what tmux reported) is a unit test with a scripted runner, even if it
was first written against a real tmux. When a live case moves down a tier, the change says what it
still proves and which live case now proves the part it no longer does: nothing is dropped silently.

**The tiers, and how to run each.** The tiers are CI jobs and mise tasks; the kinds above map onto
them by what a file needs, and a file's name decides its tier:

| Tier   | Holds                                 | Run it with          | How it runs                                   |
| ------ | ------------------------------------- | -------------------- | --------------------------------------------- |
| static | lint, format, types, links, workflows | `mise run static`    | Biome, dprint, `tsc`, lychee, actionlint      |
| fast   | unit and CLI tests: every other file  | `mise run test:fast` | parallel, isolated workers                    |
| live   | files named `*-live.test.ts`          | `mise run test:live` | one file at a time, against the pinned tmux   |
| all    | everything above                      | `mise run check`     | what CI runs, and what to run before you push |

One file is quicker still: `bun test test/path/to/file.test.ts`. The fast tier must pass on a
machine with no tmux at all (its CI job installs none). The live tier needs the pinned tmux —
`mise run tmux:pinned` builds it once — and warns, locally, when it finds another;
`WARD_TMUX_PIN=native mise run test:live` runs it against whatever tmux you have. Live tests talk
only to a private server of their own and never to a human's tmux. The suites and their helpers are
mapped in [`test/README.md`](test/README.md).

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
