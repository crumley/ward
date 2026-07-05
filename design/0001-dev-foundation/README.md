# 0001 — Development foundation

> Just enough dev + CI flow to build, test, and run a trivial CLI that prints its version — the
> entry points, toolchain, and single green/red gate that everything after this grows inside.
> Nothing Ward-specific.
>
> **Status:** accepted · **Started:** 2026-07-05

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the CLI is Ward's front door. This
  entry delivers its executable entrypoint and typed parsing substrate (the shape the noun/verb tree
  will grow inside), deliberately with **zero verbs**: today it only knows its own version.
- [`principles`](../../intent/00-foundation/01-principles.md) §1 (context management — here as the
  fast-feedback loop that spends no attention on toolchain drift) and §8 (two audiences — a typed
  CLI surface and a gate whose commands agents and humans share verbatim).
- The tooling ethos in [`CONTRIBUTING.md`](../../CONTRIBUTING.md), which mandated that the first
  code-introducing work wire an opinionated formatter + strong linter into the gate **before
  significant code** — this entry is that work.

## Scope

- **In:** the pinned toolchain and task runner (mise: bun, dprint, lychee — with `fmt`, `lint`,
  `typecheck`, `test`, `links`, `check` tasks, plus `ward`/`link`/`unlink` conveniences for running
  the CLI); Bun + strict TypeScript with no build step; Biome for code format/lint beside the
  existing dprint/lychee for Markdown; a minimal CLI (`ward --version` / `ward -v` / bare `ward`)
  parsing with optique, version read from `package.json`, rendered with picocolors; one `bun test`
  proving it; CI running **the same** `mise run check`; direnv as optional environment sugar.
- **Deferred:** **all Ward behavior** — every noun and verb, the metadata store, the seams, and the
  domain module layout (`src/` beyond `cli/` stays empty; deciding its shape belongs to the first
  entry that builds domain behavior). _Why safe:_ the human-shell contract already requires the CLI
  layer to be thin plumbing over real logic below, so nothing here constrains how that logic will be
  designed; the foundation only fixes how code is run, checked, and shipped.
- **Acceptance:** from a cold checkout, `mise install` + `mise run check` is green (code format +
  lint + types + tests + Markdown format + links), and the CLI prints the `package.json` version for
  `--version`, `-v`, and bare invocation.

## Design

- **Decisions** (the _why_ lives in the ADRs):
  [0001 — Bun + TypeScript + `bun test`](../decisions/0001-bun-typescript.md) ·
  [0002 — mise tasks + pinning, Makefile removed, direnv optional](../decisions/0002-mise-tasks-and-pinning.md)
  ·
  [0003 — Biome for code; dprint + lychee keep Markdown](../decisions/0003-biome-code-dprint-markdown.md)
  · [0004 — optique + picocolors](../decisions/0004-optique-picocolors.md).
- **Layout:** [`src/cli/index.ts`](../../src/cli/index.ts) (the entrypoint `package.json` maps
  `ward` to via `bin`; shebang `#!/usr/bin/env bun`) and
  [`test/cli/version.test.ts`](../../test/cli/version.test.ts) (table-driven, assertions first per
  CONTRIBUTING). Configuration at the root: [`mise.toml`](../../mise.toml) (tools + tasks),
  [`package.json`](../../package.json) + `bun.lock` (JS deps),
  [`tsconfig.json`](../../tsconfig.json) (strict, `noEmit`, erasable/verbatim module syntax),
  [`biome.json`](../../biome.json), [`.envrc`](../../.envrc),
  [`.github/workflows/check.yml`](../../.github/workflows/check.yml).
- **Mechanisms:**
  - _One version, one home:_ the CLI imports `package.json` (`with { type: 'json' }`), so
    `ward --version`, the test, and the manifest can never disagree.
  - _The gate is a task DAG:_ `check` = `lint` (Biome `ci` + dprint `check`) + `typecheck`
    (`tsc --noEmit`) + `test` (`bun test`) + `links` (lychee, offline); JS-dependent tasks depend on
    `deps` (`bun install --frozen-lockfile`), so the gate self-provisions and **never writes** to
    tracked files. CI is `mise install` + `mise run check`, byte-for-byte the local commands.
  - _Parsing:_ one optique `object` with a `-v/--version` Boolean option; `run()` supplies `--help`.
    Bare `ward` prints the version plus a one-line help pointer — a deliberate placeholder for the
    future noun/verb tree.

## Build log

### 2026-07-05 — Foundation stood up

**Goal.** Restructure done (plan/ folded into design/ — see the repo history), then: pick the stack,
wire the pinned toolchain + gate, and prove a trivial CLI end to end. **What was done.** Wrote ADRs
[0001](../decisions/0001-bun-typescript.md)–[0004](../decisions/0004-optique-picocolors.md); added
`mise.toml` (tools + task DAG) and deleted the `Makefile`; added `package.json` (optique/picocolors
deps; Biome/TypeScript/`@types/bun` dev deps) with `bun.lock`; strict `tsconfig.json`; opinionated
`biome.json`; `.envrc` (direnv, optional); `src/cli/index.ts`; `test/cli/version.test.ts`;
`.github/workflows/check.yml`; updated `CONTRIBUTING.md`, `AGENTS.md`, per-leg READMEs,
`dprint.json`/`lychee.toml` excludes.

**What works now — with the commands that prove it** (Bun 1.3.14, mise 2026.5.16, macOS):

- `bun src/cli/index.ts --version` → `ward 0.1.0` · same for `-v`; bare `bun src/cli/index.ts` →
  `ward 0.1.0 — A CLI for operating opinionated, structured human+agent workspaces.` + help pointer;
  `--help` renders optique's usage. Exit code 0 in all four cases.
- `bun test` → `4 pass, 0 fail, 7 expect() calls` (the three invocations above assert the
  `package.json` version appears; a fourth asserts `--version` output is _exactly_ `ward 0.1.0`).
- `mise run check` → green end to end in ~0.6s; per-task evidence in the run: deps installed with no
  changes (frozen lockfile), `biome ci` (3 files) + `dprint check`, `tsc --noEmit` (clean),
  `bun test` (4 pass), `lychee .` (304 links, 0 errors, 1 excluded — the one external URL, skipped
  by offline mode as configured). The exact final-gate output is quoted in the PR.
- `direnv allow . && direnv exec . sh -c 'which bun dprint lychee'` → all three resolve to the
  mise-pinned installs (`~/.local/share/mise/installs/…/1.3.14`, `…/0.54.0`, `…/0.24.2`).

**Decisions.** All recorded as ADRs 0001–0004 rather than here — each is a one-time, cross-cutting
stack choice, which is exactly what [`../decisions/`](../decisions/) is for. Entry-local choice
worth recording: the `deps` task installs with `--frozen-lockfile` so the no-writes promise of
`check` extends to the lockfile.

**Next.** First Ward-behavior entry: decide the domain module layout (deliberately not fixed here)
and grow the first real noun/verb into the CLI substrate.

### 2026-07-05 — CI's first run caught a color-environment dependence

**Goal.** Confirm the PR's CI run is green. **What was done.** It was not: all 4 tests failed in
Actions only — picocolors enables ANSI wherever `CI=true` is set, so the spawned CLI printed color
codes in CI but plain text locally (piped, no `CI` var). Fixed by pinning `NO_COLOR=1` in the test's
spawn env, making the assertion hermetic in any environment. A good first catch for the shared gate:
this is exactly the local-vs-CI drift the foundation exists to surface, and the fix keeps the
"agents get deterministic output" asymmetry testable.

**What works now — with the commands that prove it.**

- `CI=true bun test` → `4 pass, 0 fail` (reproduces the Actions environment locally).
- `mise run check` → green; the PR's CI re-run on the same commit is the cross-machine proof.

**Decisions.** Test processes pin their color environment explicitly; human-facing color behavior
stays env-sensitive by design (`NO_COLOR`/TTY/`CI`). **Next.** unchanged.

### 2026-07-05 — Convenience tasks for running and linking the CLI

**Goal.** Make "how do I run it?" a one-liner. **What was done.** Added three mise tasks: `ward`
(runs the CLI, forwarding args), `link` (registers `ward` on PATH via `bun link`), `unlink` (undoes
it).

**What works now — with the commands that prove it.**

- `mise run ward -- --version` → `ward 0.1.0` (args also forward without `--`); bare `mise run ward`
  → the version + help pointer.
- `mise run link` → `which ward` resolves (`~/.bun/bin/ward`), `ward -v` → `ward 0.1.0`;
  `mise run unlink` removes it.
- `mise run check` → still green (the new tasks are additive; the gate is unchanged).

**Decisions.** Task named `ward`, not `run`, so the invocation reads as the tool
(`mise run ward -- …`) rather than the awkward `mise run run`. **Next.** unchanged.

## Spec-feedback

**None this entry.** Expected: the foundation deliberately touches no Ward domain concept, so there
was no intent surface to rub against. (The one mandate exercised — CONTRIBUTING's "wire the
formatter + linter before significant code" — was followed, not contradicted.)
