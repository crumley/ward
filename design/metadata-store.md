# Design: Metadata Store

> **Serves intent:** [metadata-store seam](../intent/02-subsystems/00-metadata-store.md) (the
> contract), [domain-model](../intent/01-concepts/00-domain-model.md) (the nouns it persists),
> [sessions](../intent/01-concepts/02-sessions-and-lifecycle.md) (append-only logs), and
> [principles §6/§11/§16/§17](../intent/00-foundation/01-principles.md). Stack/layout in
> [`00-foundation.md`](00-foundation.md).

## Realization

A **filesystem of markdown files with Zod-typed, runtime-validated YAML front matter**, directory
nesting expressing scope containment — the working realization the seam names. Reads parse front
matter (canonical YAML, [ADR 0004](../build/decisions/0004-frontmatter-determinism.md)) and validate
through the type's Zod schema ([ADR 0003](../build/decisions/0003-zod-schemas.md)); writes validate
then serialize canonically. The body (markdown prose) is for the human audience; the front matter is
the machine-critical, schema-validated state (§8).

## Document-type catalog (v1)

Each document declares `type` (the Zod discriminator) and `schemaVersion`. Common envelope on every
doc: `type`, `schemaVersion`, and — where it is an addressable thing — its `identity` (slug + code)
and, where durable output, `provenance`.

| `type`          | Lives at                                  | Owns (front matter highlights)                                                                                                       | Status                        |
| --------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------- |
| `workspace`     | `.ward/workspace.md`                      | `wardVersion`, `schemaVersion`, `repos[]`, `modelDefaults`, `createdAt`/`updatedAt`                                                  | own record                    |
| `persona`       | `.ward/personas/<name>.md`                | `name`, `role`, `disposition`, `modelTier`                                                                                           | own record                    |
| `project`       | `…/projects/<floor>-<slug>/project.md`    | `identity{slug,code=floor}`, `title`, `personas{attending,chargeNurse}`, `theme{accent,glyph}`, non-derivable `priority`/`attention` | **no status field** (derived) |
| `task`          | `…/tasks/<slug>/task.md`                  | `identity`, `title`, `successCriteria`, `repos[]`, `resident`, `remote?{provider,id,url}`, `state`, `theme`                          | records own `state`           |
| `worktree`      | `…/worktrees/<repo>__<branch>.md`         | natural key `{repo,branch}`, `path`, `hooks{<name>:satisfied}`, `theme{accent,glyph}`                                                | own record                    |
| `room`          | `…/rooms/<code>/room.md`                  | `identity{code=floorRoom}`, `worktree`, `brief?`, `state(open/closed)`, `theme`                                                      | records own `state`           |
| `artifact`      | `…/artifacts/<name>.md` (any scope)       | `artifactType` (brief/note/…), `provenance`, `for?` (brief target), `derivedFrom[]`                                                  | own record                    |
| `session-event` | `…/<scope>/log/<seq>-<ts>-<id>-<verb>.md` | `session`, `verb(opened/resumed/closed)`, `persona`, `scope`, `cwd`, `harness`, `model`, `handle`, `ts`                              | append-only                   |
| `message`       | `.ward/messages/<id>.md`                  | `kind(dispatch/report)`, `from`, `to`, `ref?`, `body`, `ts`                                                                          | append-only-ish (own record)  |
| `wake`          | `.ward/wakes/<id>.md` + `…/log`           | `condition`, `armer`, `state(armed/satisfied)` derived from its log                                                                  | state derived                 |
| `reflection`    | `.ward/reflections/<scope>/<goal>.md`     | `goal`, `cursor`, `proposals[]`                                                                                                      | cursor advances               |

The catalog is extensible: a new type is a new Zod schema added to the union
([ADR 0003](../build/decisions/0003-zod-schemas.md)).

## The no-lost-updates discipline (§17), structurally first

The seam's order of preference — _derive → append → single-writer → serialize_ — realized as:

1. **Derive, don't store shared roll-ups.** Project/workspace **status** is computed by
   `domain/status` from child records at read time; there is no status field to clobber
   ([domain-model](../intent/01-concepts/00-domain-model.md)). A child transition writes only the
   child.
2. **Append over rewrite.** Every log (`<scope>/log/`, wake logs) is a **directory of one file per
   event**. A new event = a new uniquely-named file (`<zero-padded-seq>-<iso-ts>-<id>-<verb>.md`).
   Concurrent writers never target the same path, so there is **no shared write to lose** — the
   no-lost-updates invariant is structural, not lock-based. "The log" is the enumerated, name-sorted
   set of entries.
3. **One owner per mutable record.** The few records that _are_ rewritten (`task.md` state,
   `room.md` state, `workspace.md`) each have exactly one writer (the agent/operation that owns that
   scope). Others read them or append a `message`/`wake` requesting a change.
4. **Serialize the rest.** v1 has no genuinely-shared mutable record left after (1)–(3); if one
   appears, the primitive is an atomic write (write-temp + `rename`) and, only if needed, an
   advisory lock. Recorded as the deferred concurrency primitive
   ([open question](../intent/02-subsystems/00-metadata-store.md)).

**Sequence allocation** for log filenames is itself append-only: the next seq is
`count(existing) +
1`, and the filename includes a high-resolution timestamp and the session/event
id, so even a racing duplicate seq yields distinct files (and folding tolerates ordering by (seq,
ts, id)).

## Deriving state from an event log (`fold`)

`store/log` provides `append(scopeDir, event)` and `read(scopeDir) -> events[]` and a generic
`fold`. Session state is `fold(eventsForSession)`:

- start: no state; `opened` → `open` (carrying persona/cwd/harness/model/handle from the event);
- `resumed` → `running` (and re-attached) — **idempotent**: folding 1 or N `resumed` events yields
  the same `running`;
- `closed` → `closed`, and `closed` is **terminal**: once seen, later events do not change it
  (**closed stays closed**). At write time, `resume` refuses a session whose folded state is already
  `closed`, so recovery and re-resume can never revive it.

The same fold pattern derives wake state (armed→satisfied, satisfied terminal, fires once).

## Identity allocation (`store/ids`)

- **Floor number** (project code): `max(existing floor numbers) + 1`, starting at 1, by enumerating
  `projects/<n>-*`.
- **Room code:** per-floor sequence `A1, A2, …`; a room is addressed workspace-wide as
  `<floor><roomcode>` (e.g. `1A1`) — identity need not mirror containment
  ([domain-model](../intent/01-concepts/00-domain-model.md)).
- **Slug:** from a title — lowercase, hyphenated, deduped within its parent.
- **Session id:** slug + short base36 code, scope-relative.

Sizing follows the intent: codes are sized to in-flight cardinality, not entropy; time + context
disambiguate history.

## `.gitignore` policy (§15)

`.ward/` is tracked (durable, small, versionable). `repos/` and `worktrees/` are ignored
(regenerable from origin + recorded branches). `*.local.*` and an explicit `local/` convention are
ignored so genuinely personal scratch never even risks the boundary (§4).

## Open / deferred

- The **concurrency primitive** for any future genuinely-shared mutable write (atomic-rename vs.
  advisory lock vs. CAS) — not needed by v1's structure
  ([seam open question](../intent/02-subsystems/00-metadata-store.md)).
- **Artifact taxonomy** beyond brief/note, and **provenance depth** / cross-task reference recording
  ([domain-model open questions](../intent/01-concepts/00-domain-model.md)).
- **schemaVersion** evolution and the migration path (reasons about these schemas, §14).
