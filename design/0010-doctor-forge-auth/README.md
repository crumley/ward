# 0010 — Doctor sees forge auth

> `ward doctor` stops vouching for a broken forge tool: the `gh` presence check reads the same
> `WARD_GH` seam the probe spawns, and a present binary gets a second, deadline-bounded health
> finding from `gh auth status` — installed-but-unauthenticated is a warning carrying its remedy, a
> cut check is honestly "cannot verify," and absence stays the info it always was.
>
> **Status:** accepted · **Started:** 2026-08-09

The motivating incident (verified during 0009's dogfooding): with `GH_TOKEN=invalid`,
`gh pr view <url> --json state` fails HTTP 401; `ward status` degrades honestly to "forge state
unavailable (gh)" — 0009's one honest bit working as designed; but `ward doctor` still reports
`✓ gh — GitHub CLI available`. The degraded surface points at gh, the user's natural next move is
doctor, and doctor green-lights the broken tool: the diagnostic loop does not close.
[`0009`](../0009-live-forge-state/README.md) recorded why the probe cannot say more — unauth,
offline, and rate-limited "are indistinguishable … at this distance" on a high-frequency verb — and
doctor is the low-frequency, on-demand place that can afford to get closer. This entry closes the
loop and nothing else.

## Serves intent

- [`human-shell`](../../intent/02-subsystems/07-human-shell.md) — the `doctor` constraint: "reports
  what is healthy and recommends improvements — including optional external tools Ward can take
  advantage of when installed." A doctor that checks presence but not health green-lights exactly
  the cryptic failure the constraint exists to prevent; the "doctor check set" is expressly _left to
  implementation_, which is where this entry works. The optional-tool posture is intent's and does
  not move: absence stays `info`.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the repair posture
  doctor already honors: report-only. The new finding reports the breakage and recommends the remedy
  (`gh auth login`); it never runs it, and no gh state is ever an `error`.
- [`principles`](../../intent/00-foundation/01-principles.md) §8 — both audiences get the same
  content: the finding is a data row (`check`/`severity`/`message`) under the existing
  `doctor --json` shape and a rendered line for the human. §6 — the same machine state yields the
  same findings, and the cut-at-deadline case is itself a deterministic, honest answer.

## Scope

- **In:**
  - **Doctor's presence check reads the forge seam.** `ghExecutable()` moves from a private helper
    to an export of `src/forge/gh.ts` (`WARD_GH` naming the executable, else `gh` on PATH), and
    doctor consults it instead of a hardcoded `Bun.which('gh')` — doctor and the probe can no longer
    disagree about which binary they describe, and the finding becomes fakeable through the seam
    every forge test already uses. The resolver now also verifies an override exists, so the
    hermetic test pin (an impossible path) reads as absent everywhere.
  - **A second finding when the binary is present:** `gh auth` via `probeForgeAuth()` —
    `gh auth status` through the seam, deadline-bounded (default 10 s; `WARD_GH_TIMEOUT_MS`
    overrides). Exit 0 → `ok`; nonzero → `warn` naming the consequence (forge state will be
    unavailable) and the remedy (`gh auth login`); deadline or spawn failure → `info`,
    cannot-verify.
  - **Report-only, posture unchanged:** absence stays `info`; no gh finding is ever `error`, so
    doctor's healthy verdict and exit code are untouched by any forge condition.
  - **Tests:** the fake gh grows an `auth` verdict; a findings table covers absent / authenticated /
    unauthenticated; the hung check is cut at the deadline; the human rendering carries the warn
    mark and the remedy.
- **Deferred:**
  - **`status`/`task list` distinguishing unauth from offline.** _Why safe:_ 0009's one honest bit
    stands on the high-frequency verbs, where an extra spawn per invocation buys nothing the human
    can act on mid-glance; doctor is where they go to ask _why_, and it now answers.
  - **Deeper auth diagnostics** (which host, token scopes, expiry — parsing `gh auth status`
    output). _Why safe:_ the exit code alone separates working from broken, which is the whole
    incident; gh's human-oriented output is not a contract, and richer findings can join later as
    more rows — the shape is already an open list.
  - **Surfacing auth breakage on the "needs you" surface.** _Why safe:_ `needs you` routes attention
    to work; doctor is the diagnosis surface, and the status note already points at gh. If
    dogfooding shows humans miss it, a later entry adds a derived condition under whatever wording
    SF-001's resolution settles.
- **Acceptance:** from a cold checkout, `mise run check` is green, and `bun test` proves:
  1. against a fake gh whose `auth status` exits 0, doctor reports `gh` ok **and** `gh auth` ok;
  2. exit nonzero → `gh` ok plus a `gh auth` **warn** containing `gh auth login`, with doctor still
     healthy and exiting 0;
  3. a hung `auth status` is cut at the deadline and reported as `info` cannot-verify — never as
     broken;
  4. an absent binary yields the single `info` finding and no auth row (no spawn at all);
  5. `doctor --json` needs no schema change — the new row validates under the existing findings
     shape.

## Design

- **Decisions:** no new ADRs — entry-local only:
  - **Presence = the seam, verified.** Doctor asked `Bun.which('gh')` while the probe asked
    `WARD_GH`: two callers could describe two different binaries, and doctor's finding could not be
    faked. Resolution lives in `src/forge/gh.ts` (0009: one module owns every forge read) and now
    verifies the override (a path must exist, a bare name must resolve on PATH) — which also made
    the pre-existing `runDoctor` unit tests hermetic (they used to see the machine's real gh through
    the hardcoded check) and lets the probe skip spawns for an impossible override.
  - **Health is a second finding, not a mutation of the first.** `gh` / `gh auth` follows the `git`
    / `git identity` idiom already in doctor: presence and health are different facts with different
    remedies, and one merged row would lose which of them failed.
  - **`warn` for installed-but-unauthenticated.** Not `error`: nothing is blocked — every verb
    degrades honestly (0009), and doctor's healthy verdict tracks errors only, so report-only holds.
    Not `info`: an installed-and-broken tool is likelier a misconfiguration than a choice, and
    catching misconfigurations is what doctor is for. The message names the consequence and the
    one-command remedy.
  - **A cut check is `unverified`, never `unauthenticated`.** The deadline expiring proves nothing
    about auth; claiming broken would be a guess, and doctor reports rather than guesses (the
    repair-posture discipline applied to a verdict). Rendered as `info` for the same reason.
  - **A more generous deadline than the probe's, same knob.** Default 10 s against the probe's 3 s:
    doctor is on-demand diagnosis, not a glance — the human already asked "what is wrong?" — and
    `gh auth status` verifies the token over the network, slowest exactly on the degraded links
    doctor gets run on. `WARD_GH_TIMEOUT_MS` overrides both deadlines: the knob means "how long may
    Ward wait on gh," and a second variable would be surface without a second meaning.
  - **The exit code alone decides.** gh's `auth status` prose is for humans and changes across
    versions; the exit code is the stable contract, and it is all the incident needed.
  - **No `--json` change.** Findings are already data rows under `doctorShape`; the new row rides
    through (verified in the build log).
- **Layout:** `src/forge/gh.ts` (`ghExecutable` exported and override-verified; `ForgeAuth`,
  `probeForgeAuth`); `src/workspace/doctor.ts` (`machineChecks` async; the gh block reads the seam
  and appends `ghAuthFinding`); `test/helpers.ts` (the fake gh answers `auth status` by exit code);
  `test/workspace/doctor.test.ts` (new: the findings table, the deadline cut, the human rendering).
- **Mechanisms:** `probeForgeAuth()` resolves the executable through the seam → spawns
  `<gh> auth status` (output ignored) → kills at the deadline → folds to
  `authenticated | unauthenticated | unverified`, never throwing. Doctor's machine checks map that
  to the `gh auth` finding only when the binary is present; absence keeps today's single `info` row
  and costs no spawn.

## Build log

### 2026-08-09 — Presence via the seam, health via `gh auth status`

**Goal.** Everything in Scope in one iteration. **What was done.** Exported a verified
`ghExecutable()` from `src/forge/gh.ts` and added `probeForgeAuth()` (deadline-bounded, exit-code
only, 10 s default under the shared `WARD_GH_TIMEOUT_MS` knob); rewired doctor's gh presence check
onto the seam and added the `gh auth` finding with the warn/info/ok mapping; taught the fake gh in
`test/helpers.ts` to answer `auth status`; added `test/workspace/doctor.test.ts` (findings table for
absent/ok/broken, the hung-check cut, the spawned human rendering).

**What works now — with the commands that prove it** (Bun 1.3.14, macOS):

- `bun test` → `140 pass, 0 fail, 414 expect() calls` across 16 files (from 135/401 at entry start):
  the findings table, the 250 ms cut of a 30 s-hung fake auth check, and the rendered warn line with
  the remedy, all through fakes — never the network.
- `mise run check` → exit 0, end to end (Biome + dprint + `tsc --noEmit` + `bun test` + lychee).
- Incident replay with a fake broken-auth gh (`WARD_GH` pointed at a script whose `auth status`
  exits 1): `ward doctor` now renders `✓ gh — GitHub CLI available` **and**
  `! gh auth — installed but cannot reach the forge — forge state will be unavailable; run: gh auth login`,
  still exiting 0 with `healthy — nothing needs attention`; the auth-ok fake renders
  `✓ gh auth — authenticated — live forge state available`; the absent case renders today's single
  `i gh` line, unchanged.
- Schema verified untouched: `bun src/cli/index.ts schema doctor` emits the same shape as before
  this entry — findings were already open `check`/`severity`/`message` rows, so the new row needed
  no registry edit and `doctor --json` output validates as-is (the smoke run's JSON carries the
  `gh auth` warn row under the existing shape).

**Decisions** (found while building): all recorded under Design → Decisions; the one worth naming —
the override in `ghExecutable()` is now existence-verified, which changed nothing observable for the
probe (an impossible path was already `live: false`, now without the wasted spawns) but is what lets
doctor's presence finding tell the truth through the same pin the tests use.

**Next.** Natural follow-ons: deeper auth findings (host, scopes) if dogfooding wants them; the
deferred question of whether auth breakage ever joins `needs you`.

## Spec-feedback

None this entry. The doctor constraint in
[`human-shell`](../../intent/02-subsystems/07-human-shell.md) leaves the check set to implementation
and asks exactly for report-and-recommend on optional tools — the warn-with-remedy is that posture,
not a friction with it.
