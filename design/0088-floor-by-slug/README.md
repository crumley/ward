# 0088 — A floor answers to its slug wherever a number is taken

> Every verb argument that names a floor takes the floor's number or its exact slug, resolved once
> after parsing, so every verb still receives a number.
>
> **Status:** built — awaiting review · **Started:** 2026-11-22

A floor's number is its code and its slug is its name
([domain model](../../intent/01-concepts/00-domain-model.md), _Identity_). Until now every floor
argument took the code only: `--floor`, `--to`, `--from`, `--project`, and the FLOOR argument of the
`project` and `reflection` verbs were integers. Callers that name a floor durably (skills, shell
functions, scripts) therefore carry numbers, and a reorganization that renumbers floors silently
points them at the wrong floor or at none. A slug says what the caller means, and a stale one fails
loudly instead of landing elsewhere.

## Serves intent

- [`domain-model`](../../intent/01-concepts/00-domain-model.md): a project's identity is slug +
  code, and a human or agent may name it by either; the code stays what Ward records and reports.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): completion offers both spellings,
  each cueing the other, so the menu never offers what the verb refuses.
- [`principles`](../../intent/00-foundation/01-principles.md): **§6**, resolution is deterministic
  from the record; **§17**, an unknown or shared slug is refused rather than guessed.

## Scope

- **In:** one value parser for every floor argument (`task open --project`, `task list --floor`,
  `task dispatch --to`, `task dispatches --to/--from`, `session open --floor`,
  `session resume --all --floor`, `project claim|release|identity|note FLOOR`,
  `reflection packet|open|record FLOOR`, `shell candidates --floor`); one resolution step in the CLI
  before any verb runs; slugs in shell completion; one sentence in the root `AGENTS.md` template.
- **Deferred:**
  - _Old slugs after a rename._ Deliberately never: a renamed floor's old slug names nothing, so a
    caller still holding it is refused and edited, rather than followed to a floor that may since
    have been reused under that name.
  - _`project open --floor N`._ Not a reference: it chooses a number for a floor that does not yet
    exist ([0077](../0077-floor-chosen-number/README.md)), so a slug means nothing there.
  - _`wsa N`._ The shorthand treats an all-digit argument as a floor and anything else as a session
    id ([0059](../0059-session-shorthands/README.md)); safe to leave, since `wsa` passes digits only
    and a session id is the other reading of a word.
- **Acceptance:**
  1. The parser table and the slug resolver's refusals (`test/cli/floor-by-slug.test.ts`).
  2. One verb per family takes a slug and reports the floor as a number: task, project, session,
     reflection; an unknown slug is refused before the verb acts; the shell feed stays silent on one
     (same file).
  3. Completion offers numbers and slugs (`test/cli/completion.test.ts`). `mise run check` passes.

## Design

- **Decisions:** no ADR. Entry-local choices:
  - **All digits is a number.** The alternative was to try a slug match first, so a floor wearing
    the slug `2026` could be named by it. It lost because every caller that passed a number before
    would then depend on which slugs exist; numbers keep exactly their old meaning. The cost: a
    floor with an all-digit slug is named by number only.
  - **Resolve after parsing, not inside the parser.** Resolving in the value parser would make the
    verbs' option types plain numbers at parse time. It lost because finding the workspace can
    itself refuse (none here, or one needing a newer Ward), and a parse-time failure prints the
    whole usage, not Ward's one-line refusal. The parser yields a `FloorArg` (a number or a
    `FloorSlug`); `resolveFloorArgs` replaces every `FloorSlug` among the result's fields with its
    number, reading the record only when one is present. The type `FloorsResolved<T>` makes a site
    the step missed a type error.
  - **Match every floor, open or closed.** Matching only open floors would let a slug reused after a
    floor closed resolve quietly. It lost because the history verbs (`task list --floor`,
    reflection) must reach closed floors too, and one rule for all is easier to predict. A slug two
    floors wear is refused, naming each with its number and state; the number is the way to say
    which. A verb that refuses a closed floor still does, since it receives the number.
  - **Case is ignored.** Slugs are lowercase by construction, so the match lowercases its input, as
    task addresses are spelled case-insensitively.
- **Layout:** `src/workspace/floor-ref.ts` owns the rule (parse, resolve, refuse);
  `src/cli/suggest.ts`'s `floorNumber` is the one value parser and its completion; `main` in
  `src/cli/index.ts` resolves once. The shell feed (`shell candidates`) is machinery that never
  errors mid-keystroke, so a slug it cannot resolve yields an empty feed.
- **Mechanisms:** JSON output is unchanged: every report still carries floor numbers. No record
  shape changes and no format level is raised.
