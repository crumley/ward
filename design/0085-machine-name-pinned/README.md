# 0085 — A pinned machine name

> The first name Ward derives for a machine is stored in that machine's Ward state directory and
> used from then on, so a host reading that follows the network can no longer rename the machine.
> Doctor says which rung named the machine and warns when the machine now derives another name.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22 · **Supersedes in part:** the
> machine-name ladder of [0038](../0038-machine-bound-sessions/README.md)

[0038](../0038-machine-bound-sessions/README.md) made the machine a recorded fact: every session id
ends `@<machine>`, and the record carries `machine:`. Its ladder for the name was `WARD_MACHINE`,
then `machine:` in the global configuration, then the first label of `os.hostname()`. Nothing was
stored, so the name was derived again on every run. On macOS with no fixed `HostName`, the kernel
hostname follows the network: a DHCP or reverse-DNS answer replaces it. One machine observed the
derived name flip between two values 21 times in eleven weeks. Each flip started a parallel id
series (`workspace-12@a` beside `workspace-12@b`), and every check that compares a record's machine
with the current name judged the machine's own sessions as another machine's. Those checks are the
hand-off nudge, the reflection packet's history reading, the floor feed's candidates, outside
worktrees, and resume's refusal.

This entry closes the gap at the bottom rung. The name has to stay stable. A deliberate rename does
not need graceful handling: old ids keep the name they were minted with, and nothing migrates or
aliases them.

## Serves intent

- [`sessions-and-lifecycle`](../../intent/01-concepts/02-sessions-and-lifecycle.md) — the
  session-log minimum records the machine. A machine whose name stays put keeps that field true for
  every record it writes.
- [`agent-harness`](../../intent/02-subsystems/03-agent-harness.md) — _locate distinguishes found
  from gone_, per machine. A stable name keeps the per-machine judgement from reading a machine's
  own history as foreign.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md) — the global-state
  boundary. The pin is a machine-state convenience beside the registry, and deleting it loses no
  work. The next run derives and stores a name again, which is the pre-0085 behaviour.
- [`principles`](../../intent/00-foundation/01-principles.md) — **§16**: the machine's name is
  recorded once and read back, never re-inferred from the network. **§20**: an unreadable or
  unwritable pin degrades to the derived name, never to a failed command, and doctor names the
  condition with its remedy. **§17**: the first write happens under a global lock and is re-read
  inside it, so two first runs agree.

## Scope

- **In:**
  - **The ladder** (`src/global/machine.ts`): `WARD_MACHINE`, then the configured `machine`, then
    the **stored** name, then the derived name. Every rung goes through the one slug normalizer.
    `MachineSource` gains `stored`; `hostname` now means a name derived this run and not stored.
  - **The pin**: `machine.md` in the Ward state directory (`$WARD_STATE_DIR`, else
    `$XDG_STATE_HOME/ward/`, beside `workspaces.md`), a `ward-machine` document with `name`,
    `pinnedAt`, and what it was derived from (`from`: `LocalHostName` or `hostname`, and the raw
    `host`). It is written atomically through the global store (staged in the directory's `tmp/`,
    then renamed) under the `machine name` global lock, and read again inside the lock first.
  - **When it is written**: by `readMachine`, the one reader every verb uses, the first time the
    name is asked for with no override, no configured name and no pin. A read verb that asks for the
    name may write it (see Design). Doctor never writes it.
  - **Failure postures**: an unreadable pin (bad front matter, a failed schema, or a name with no
    letter or digit) is left as found, and the name is derived on every run. A pin that cannot be
    written (a lock timeout, an unwritable directory) costs the guard, and the command runs on the
    derived name.
  - **The first derivation on macOS reads `LocalHostName`** (`scutil --get LocalHostName`), falling
    back to the kernel hostname when it cannot be read. Every other platform reads the kernel
    hostname.
  - **Doctor** (`src/workspace/doctor.ts`): the `machine` line names the rung that answered.
    Examples: `pinned in <path>`;
    `from this machine's LocalHostName; the first verb that names this
    machine pins it in <path>`;
    `… because the pin cannot be read`. A `machine pin` finding (`warn`, never `error`) appears in
    two cases. One is when the pin names the machine and the machine now derives a different name;
    the finding says the pinned ids stay as they are. The other is when the pin cannot be read. Both
    say that `machine:` in the configuration is how to choose a name on purpose. `--json` carries
    `machineName.source: stored`, and `ward schema doctor` admits it.
  - **Tests**: each rung and its precedence, the first-run write, a later host reading that differs,
    an override or configured name that writes nothing, an unreadable pin left alone, an unwritable
    state directory, two concurrent first runs, the macOS host reading and its fallbacks
    (`test/global/machine.test.ts`); doctor's line for each pin state, its two warnings, silence
    under a configured name, and the JSON source (`test/agent/doctor.test.ts`); a spawned
    `session open` that pins the derived name and allocates under it, then allocates under a changed
    pin (`test/agent/machine-sessions.test.ts`).
- **Deferred:**
  - **Renaming a machine gracefully.** No migration of `@old` ids and no alias between names. _Why
    safe:_ a rename is rare and deliberate, ids from before it keep resolving by their full text,
    and resume locates a history before it compares machines (0038). The cost is cosmetic: an old
    series and a new one sit side by side.
  - **Repairing an unreadable pin automatically.** _Why safe:_ doctor warns and names the two
    remedies (set `machine:`, or delete the file), and meanwhile Ward behaves exactly as before this
    entry.
  - **Aligning the record-first and disk-first locality checks.** With the name pinned, the two
    agree, so there is nothing left for alignment to fix.
- **Acceptance:**
  1. `env -u WARD_AGENT mise run check` is green: static, fast and live tiers.
  2. `bun test test/global/machine.test.ts test/agent/doctor.test.ts
     test/agent/machine-sessions.test.ts`
     passes. The cases are listed under Scope.
  3. In a scratch state directory (`WARD_CONFIG_DIR` and `WARD_STATE_DIR` redirected),
     `ward
     doctor` first reports the name as not yet pinned. `ward status` then writes
     `machine.md`, and doctor afterwards reports `pinned in <path>`. A pin edited to another name
     makes doctor warn `machine pin` and keeps `healthy: true`.

## Design

- **Decisions:** no new ADRs. Entry-local:
  - **Pin on the first read, read verbs included.** The alternative was to pin only from verbs that
    already write, such as `session open` and `worktree create`, keeping read-only verbs free of
    writes. That was attractive because `status` and the shell feed would never touch the disk. It
    lost because every reader of the name compares it with a record. A read that answered from the
    network while a later write answered from the pin would produce the same disagreement the pin
    exists to end, and it would do so in the window before the first write, which on a fresh machine
    is the window that matters. Writing to machine state from a read verb is not new: the registry's
    recency touch already rides every invocation. The cost is one small write, once per machine,
    from whichever verb gets there first.
  - **Doctor reads and never writes.** Doctor diagnoses and changes nothing, so it reports the name
    a verb would store instead of storing it. The alternative was to pin from doctor too, because
    doctor is often the first command a new machine runs. It lost because a diagnosis that changes
    what it diagnoses can never show the unpinned state.
  - **An unreadable pin is left alone.** The alternative was to overwrite it with the name derived
    now, which would stop the flipping at once. It lost because the unreadable file may hold the
    name the machine's ids already carry, and overwriting it could quietly pin the other name. The
    cost is a warning that persists until a human acts. Until then Ward behaves exactly as before
    this entry.
  - **The macOS derivation reads `LocalHostName`.** The kernel hostname is what flips;
    `LocalHostName` changes only when the machine is renamed, and it is the name System Settings
    shows. It costs one `scutil` spawn when no pin exists and on each doctor run, nothing after the
    pin is stored, and it is testable through an injected reader. The alternative was to leave the
    derivation alone and let the pin do all the work. That is simpler, but the first pin would then
    be whichever name the network handed out that minute.
  - **Doctor compares the pin with the derivation, not with the raw kernel hostname.** The
    alternative was to compare against the first label of `os.hostname()`. It lost because on macOS
    that comparison would fire every time the network renamed the kernel hostname, which is the
    noise this entry removes. A warning that fires constantly stops being read. Comparing against
    the derivation (the `LocalHostName` on macOS) makes the warning mean what it should: the machine
    now calls itself something else, perhaps on purpose. On other platforms the two comparisons are
    the same.
  - **No format level.** The pin is machine state, not a workspace record, and no record changes
    shape. A Ward from before this entry ignores `machine.md` and derives as before.
- **Layout:** the ladder, the host reading, and the pin all live in `src/global/machine.ts`.
  `readMachine` is the one writer. `inspectMachine` is the read-only view doctor takes: the ladder's
  answer, the pin as found, its path, and what the machine derives now. Both take `MachineSeams`
  (environment, config and state directories, host reader, clock), which is how the tests stay off
  the real host and the real state directory.
- **Mechanisms:** `readMachine` returns early on an override or a configured name. Otherwise it
  reads the pin and returns `stored` when the pin reads. An absent pin leads to the derivation and a
  `storePin` under `withGlobalLock(stateDir, 'machine name', …)`, which re-reads the pin, writes
  through `writeGlobal` if it is still absent, and returns what it found or wrote. Any throw out of
  the store degrades to `{ source: 'hostname' }`.
