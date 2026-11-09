# 0054 — The workspace's immutable id

> Every workspace carries an immutable id, a random UUID minted once into `workspace.md` by
> convergence (so at creation, or at the first upgrade of an older workspace). It is read through
> `workspaceId(root)`, so state kept outside the record can recognize the workspace wherever it
> stands.
>
> **Status:** built — awaiting review · **Started:** 2026-11-08

[0031](../0031-detached-session-hosting/README.md) finds a floor's tmux host by its stamps, and the
first stamp has to name the workspace. A root path is a mutable input: a move strands every live
host, and a workspace later created at the old path adopts them. A name is mutable too, and two
workspaces can share one. The intent now answers with an **immutable id**, declared in
[`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md) and
[`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md), and it leaves the
id's form and where the record keeps it to the build. 0031's build cannot start until the id exists.

This entry mints the id, stores it, exposes it, and names the accessor 0031's build calls. Nothing
inside the record needs the id, since every command already stands in the workspace. So the work is
small, and its weight is in the guarantees: minted exactly once, never minted by a read, and never
changed by a move, a rename, or a clone.

## Serves intent

- [`00-domain-model.md`](../../intent/01-concepts/00-domain-model.md), _Identity_: the workspace is
  the one thing whose identity is not a name a human types. The id is a random token, unique with no
  help from context, and a clone shares it because it travels in the tracked record.
- [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md), _What creation
  establishes_: creation mints it, and a workspace made before it gets it when first brought forward
  by update. The _Left to implementation_ residue (the id's form and where the record keeps it) is
  settled under Design.
- [`01-principles.md`](../../intent/00-foundation/01-principles.md): **§6**, minting is
  check-then-do, so a re-run is satisfied and commits nothing. **§8**, the id is structure in
  `--json` beside the human line. **§16**, it has one home, the record, and every consumer reads it
  from there.

## Scope

- **In:**
  - **The field.** `id` in the `workspace.md` front matter, validated to `WORKSPACE_ID_PATTERN`
    (`src/store/types.ts`), optional so that a record from before this entry still parses.
  - **The mint.** A `workspace id` step in convergence (`src/workspace/converge.ts`), right after
    the workspace record step. Create and upgrade both run convergence
    ([0042](../0042-upgrade-owns-convergence/README.md)), so this one step covers both: it writes an
    id when the record has none and is satisfied otherwise. The write rides the run's one journal
    commit under the store lock.
  - **The stewardship carry.** When an upgrade's phase 2 rewrites the record in a stewardship copy
    cut before the mint, it writes the root's id into that copy. It never mints a second one
    (`src/workspace/upgrade.ts`).
  - **The accessor.** `src/workspace/identity.ts`, the module that owns minting and reading the id
    (see _Layout_).
  - **The read surfaces.** Doctor gets a `workspace id` finding (ok, showing the id, or info naming
    `ward workspace upgrade`) and a `workspaceId` field (`string | null`). `ward status --json` gets
    a top-level `workspaceId`, omitted while unminted. Both are in the `ward schema` shapes.
  - **Tests.** `test/workspace/workspace-id.test.ts`, plus the step counts carried forward in
    `create`, `converge`, and the two JSON test files.
- **Deferred:**
  - **Two checkouts of one workspace on one machine.** This remains the open question in
    [`06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md). Such
    checkouts share the id by construction, because a clone shares it. Anything keyed by the id
    therefore cannot tell them apart, and 0031's floor hosts would be shared between them. Deferring
    is safe for two reasons. Nothing keys on the id until 0031's build lands. And this entry settles
    nothing that answer would have to undo: if the answer is to support the arrangement, a
    per-checkout discriminator can be composed beside the id (the way a session id composes its
    machine), not swapped in for it.
  - **The machine registry carrying the id.** [0024](../0024-global-config-registry/README.md)'s
    registry may hold only what is derivable from the workspaces themselves. The id qualifies, but
    no verb needs it there yet. It is safe to defer because the registry can always re-derive it
    from each `workspace.md`.
  - **A manifest mention.** The installed `AGENTS.md` already describes `workspace.md` as "its
    identity and the Ward version that created it", and no agent instruction depends on the id. So
    the manifest is unchanged, its lineage gets no new entry, and no installed workspace is pushed
    into a reconciliation vehicle for a sentence it does not need.
- **Acceptance:**
  1. `bun install --frozen-lockfile && env -u WARD_AGENT mise run check` is green.
  2. `bun test test/workspace/workspace-id.test.ts` covers these cases:
     - Create writes a lowercase v4 UUID that matches `WORKSPACE_ID_PATTERN`, and the initial commit
       carries it.
     - Two creates mint two different ids.
     - A re-converge reports `satisfied` with the same id and makes no commit.
     - A pre-0054 record: `workspaceId` refuses and names `ward workspace upgrade`, doctor reports
       `info` with `workspaceId: null`, and the workspace stays healthy.
     - `selfServiceUpgrade` mints once, in a converge commit that holds only `workspace.md`. A
       second upgrade is `satisfied`, has vehicle `none`, makes no commit, and keeps the same id.
     - A stewardship copy cut before the mint gets the root's id, and the gated merge keeps it.
     - Copying the directory under another name keeps the id, and converging there is satisfied. A
       `git clone` shares the id.
     - A hand-tampered id outside the alphabet is refused by the schema.
     - `status --json` and `doctor --json` carry the id within their schemas, and both omit it
       (absent, or null) while it is unminted.
  3. In a workspace created before this entry, `ward workspace upgrade` reports the `workspace id`
     step as established, and `ward doctor` then reports the `workspace id` finding as ok, showing
     the id.

## Design

- **Decisions:**
  - **Form: a random v4 UUID, lowercase**, from `crypto.randomUUID()`. The alternative was a short
    custom token, such as 26 Crockford-base32 characters under a `ws-` prefix. It was attractive:
    shorter in `tmux show-options` output, and self-describing. It lost because nobody types or says
    this id, so length costs nothing. A UUID needs no encoder of Ward's own to get right and test,
    and every tool already recognizes it. The cost is 36 characters wherever it is printed. A
    path-derived or content-derived id was ruled out entirely: intent requires that a move or a
    clone leave the id unchanged, and a digest of anything mutable changes with it. Its alphabet,
    `[0-9a-f-]`, sits inside tmux's safe alphabet `[A-Za-z0-9_-]` (0031's munge set). It is also
    URL-unreserved and filename-safe, it cannot collide by case on a case-insensitive filesystem,
    and YAML reads it as a plain string. 122 random bits make it unique against every other
    workspace on any machine with no help from context, which is the property intent asks for.
  - **The schema checks the property, not the format.** `WORKSPACE_ID_PATTERN` is
    `^[A-Za-z0-9_-]{16,64}$`, the tmux-safe alphabet at a length no accident reaches, rather than
    the UUID shape. Consumers depend on the id being safe as a tmux option value and as a URL or
    path segment, and that is what the pattern checks. A UUID-shape regex was considered. It would
    catch more tampering, but it would also make any later change of minting format a schema
    migration, for no consumer's benefit. The cost is that a hand-written safe string of 16 or more
    characters validates. Hand edits are outside the contract anyway (records change only through
    `ward`).
  - **Storage: `workspace.md` front matter, as `id`.** Intent describes the workspace record as the
    workspace's identity. Storing the id there means a clone shares it through git, the store
    validates it, and the one journal commit carries it. The alternative was an `.ward/id` file. It
    was attractive because it reads as more internal and a reader cannot mistake it for config. It
    lost because it is a second identity home beside the record, and `.ward/` holds bookkeeping, not
    identity. The cost is one more field in a human-readable record that humans must not edit. That
    is the rule every record already lives under.
  - **The field sits last in the shape.** The schema's key order is the serializer's key order. A
    pre-0054 record gets the id appended as its last line by the converge commit. An upgrade's
    stewardship commit, meanwhile, rewrites `wardVersion` near the top. Keeping `id` last keeps the
    two edits apart, so the gated merge of a stewardship branch cut before the mint does not
    conflict on adjacent lines. Grouping `id` beside `name` reads better but would sit next to
    `wardVersion`, which is the conflict this placement avoids. The cost is an identity field below
    the timestamps.
  - **Minted by convergence, not by create plus an upgrade-only path.** One step, one code path, and
    "exactly once" follows from its structure: an id present means satisfied, so neither a re-run, a
    move, nor a clone can reach the mint. A separate migration was considered. It was attractive
    because it is explicit about the one-time backfill. It lost because 0042 settled that every
    record-shape backfill is a convergence step (the main-line name is the precedent), and a second
    path is a second place where minting could drift.
  - **Reads never mint.** `workspaceId(root)` refuses on an unminted record and names the upgrade.
    The alternative was to mint lazily on first read. It was attractive because 0031's build would
    never meet the refusal. It lost on three counts. A minting read would be a write without the
    store lock or a journal commit. Two machines reading one unminted workspace would mint two ids,
    and they would collide when the workspace syncs. And a read verb that writes breaks §6. The cost
    is that a hosted open on an un-upgraded workspace is refused with a one-command remedy.
- **Layout:** `src/workspace/identity.ts` is the one place that mints, spells, or interprets an id.
  - `mintWorkspaceId(): string` is called only by convergence's `workspace id` step.
  - `workspaceId(root: string): Promise<string>` is **the accessor 0031's floor hosts call** for
    `@ward_workspace`. It is strict: it throws `WardError` naming `ward workspace upgrade` when the
    record has no id, and the store's own error when the record is missing or invalid.
  - `recordedWorkspaceId(root: string): Promise<string | undefined>` is the tolerant read for
    surfaces that report the id beside other things. It is `undefined` when the id is unminted or
    the record does not parse, because a broken record is doctor's finding to name, not a reason for
    `ward status` to fail.

  The pattern lives in the store layer (`src/store/types.ts`) beside the schema that enforces it, so
  the store never imports from `workspace/`.
- **Mechanisms:**
  - _Mint:_ read the record. If `id` is present, the step is satisfied and its detail is the id.
    Otherwise write `{ ...data, id }` and stage `workspace.md` in the run's establishment set. The
    run's single commit then reads `Initialize Ward workspace` on a create, or
    `Converge Ward workspace` on an upgrade.
  - _Carry:_ phase 2 of the upgrade writes the copy's record only when its stamp or main line moves.
    When it does, it sets `id` to the copy's own id, or failing that the root's, which phase 1 has
    already minted. Both lines then hold the same id at the same position.
  - _Expose:_ doctor reads the record it already validates and passes `record.id` both to the
    finding and to the report. Status reads it through `recordedWorkspaceId`.
