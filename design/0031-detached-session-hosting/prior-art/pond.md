# pond — <https://github.com/tenequm/pond>

**Session model in three sentences.** Pond is not a session host and refuses to become one — "act as
a runtime" and "a capture daemon" are both named non-goals, and it never appears in an agent's
process tree. It is this entry's other half built in isolation: a durable, harness-independent
record (Lance datasets on a local dir or object store) assembled by _tailing what twelve harnesses
already write to disk_, plus `pond resume`, which reconstitutes a stored session into a client's own
native on-disk layout so that client's own resume picks it up. Where Ward derives a live half from a
record it authored, pond derives a record from live halves it does not own — and the disciplines
that forced on it (watermarks re-derived every run and never cached, no-overwrite batch restore,
system-decided fidelity) transfer directly to attach's re-create path. There is no attach, no
observe, no PTY, and no foreground/background notion anywhere in it; the value for 0031 is entirely
in the record↔live seam.

**Vitals.** Rust, one binary, v0.15.1 (2026-08-24), created 2026-05, ~51 stars, 420 commits on
`main`, Apache-2.0. Shipped and unusually well-specified: `docs/spec.md` is 815 normative lines with
mnemonic rule ids (`session-durable-copy`, `adapter-native-restore-lossless`) that the code cites
back by name. Pre-v1; roadmap steps 1–8 released, 9–13 aspiration. Everything below was read in
source or spec.

## Process model — never the parent

Spec §2.3: pond "does not execute tools, run an agent loop, compact context, render output, or emit
telemetry. It stores what those systems produce," and there is "no daemon beyond `pond serve`." The
README roadmap lists "A capture daemon. pond reads what your harness already writes" under ❌ Not
planned. Recurring ingest is delegated to the OS supervisor rather than self-daemonized — launchd,
systemd user timers (or a fenced crontab block), Task Scheduler, the last through a windowless
launcher shim so the interactive session does not flash a console every tick
(`packages/pond/src/schedule.rs:1-16`, `src/bin/pondw.rs:1-14`). The nearest thing to hosting is a
deployment shape, not a feature: `docs/references/2608-06-pi-fleet-capture.md` pairs each headless
`pi` worker with a pond sidecar on a shared volume — "pi appends to its session files, pond tails
them" — with no coordinator and no lock service (runnable at `ops/examples/pi-fleet/`).

Detach, attach, and observe do not exist. Read-only observation of a _finished_ session is a query
(`pond get-session`, `pond search`, `pond sql`) over a hard-enforced read-only MCP surface.

## Restore — pond's `resume` against 0031's attach-re-create

`pond resume <id> --to <adapter> --out-dir <root>` writes a stored session out in the target
client's own layout (`docs/spec.md:715`). For Claude Code that is
`<encoded-project>/<session-id>.jsonl` under `~/.claude/projects` — exactly the file
`claude
--resume <id>` reads (`packages/pond/src/adapter/claude_code.rs:181-203`). The project-slug
encoder was lifted off Claude Code's own bundle (`A.replace(/[^a-zA-Z0-9]/g, "-")`) rather than
inferred and verified against 178 of 181 real project directories, under the comment "Restoring to
the wrong directory is silent, so it has to match exactly" (`claude_code.rs:205-215`).

Four properties of that write are worth copying (`packages/pond/src/adapter/mod.rs:715-855`).
Restore never overwrites and never deletes: the destination is a live client's data directory, so an
existing target fails the _whole_ operation, naming every collision, before the first byte — and the
pre-check exists only to name them all, since the real guard is `create_new` (O_EXCL), a symlink
otherwise carrying the write outside the root. Path segments are re-validated at the single writer
so one audit covers every adapter present and future. A mid-batch failure unwinds to the tree as
found, removing files this call created and directories this call created _only while still empty_.
Lineage restores in one batch or not at all: children come with the parent, a deeper graph is a
typed error, never a partial write (`adapter-lineage-complete-restore`).

Fidelity is decided by the system, never asked for (§6.3): origin match serves _native_, a
value-complete replay of the stored raw records; anything else serves a best-effort reconstruction.
An adapter may also downgrade a matching origin when the captured bytes are ones the installed
client cannot load — "a byte-faithful file the client refuses to open is not a restore" — and the
fidelity actually served is reported per session. The most instructive artifact in the repo is the
bug behind `adapter-restore-distinct-reconstruction`: a downgraded pi restore reused the source file
name, so `pond resume --to pi-coding-agent` refused with "already exists" and handed the caller back
the very transcript the downgrade existed to route around — "the failure mode is silent, because
collision is the same answer a successful earlier restore gives" (`docs/spec.md:546`;
`packages/pond/src/adapter/pi_coding_agent.rs:248-270`). The fix is a deterministic distinct name.

## State — durable is the only truth; live state is not modeled

`session-durable-copy` (§5.4): once stored, a session MUST survive the loss of its source, and
re-ingest is explicitly not a recovery path. Live state is absent from the model — the canonical
`Session` carries id, parent pointers, `source_agent`, `created_at`, `project`, `options`, and
nothing resembling status, PID, or liveness (§4.5). Everything survives a reboot because nothing
that wouldn't was ever tracked. Crash safety sits in the substrate: `local-store-durability` fsyncs
bytes and parent directory before a write returns, and `local-store-self-heal` covers the residual
window by quarantining unreadable manifests on a failed open via same-directory rename — never
deleting — rolling back, retrying once, and naming what it moved and what the next sync will redo
(`docs/spec.md:160-162`; `packages/pond/src/substrate.rs:4424-4600`).

The record→live mapping is **derived every run and never cached**. A session is fresh iff the
source's latest message timestamp is no newer than pond's stored watermark, and the stored side is
rebuilt from the store itself — "deterministic with no local cursor to desync"
(`adapter/mod.rs:277-311`). The source side is a bounded tail peek (64 KiB, escalating to 32 MiB)
whose small window discards its possibly-mid-record first chunk so "the small pass never judges a
truncated line" (`packages/pond/src/adapter/jsonl.rs:478-492`) — which is what makes it safe against
a file a running agent is appending to. `SourceWatermark::Empty` may be claimed only on proof
re-derived from current content, never a cached marker, and `Opaque` ("could not determine cheaply")
is the safe default that forces a re-read (`adapter/mod.rs:231-252`).

Ids are source-supplied and opaque; an adapter decodes path-encoded structure _once_, at ingest, and
"readers never re-parse" (`adapter-integrity-opaque-ids`). Claude Code subagents get composite ids
`<parent-uuid>/agent-<hash>`; grouping is a pure derivation, `session_root()` = everything before
the first `/` (`packages/pond/src/handlers.rs:1509-1514`), and that same id reconstructs on-disk
placement — strip the parent prefix and the remainder _is_ the path under `subagents/`
(`claude_code.rs:186-200`). Machines are distinguished by a per-message ingest-host stamp rolled up
by `pond status --hosts`, with unstamped rows honestly grouped under a `None` host
(`packages/pond/src/sessions.rs:2311-2345`).

## Lifecycle and the sync lock

There is no session lifecycle — only presence in the store. The lifecycle-shaped machinery is around
_sync runs_ (`packages/pond/src/syncstate.rs:76-186`). The lock is a real `flock` on a file that is
never unlinked ("unlink while a sibling holds the path open hands out two locks"), so "a killed sync
can never leave a stale lock" — liveness from an OS primitive, not a stored fact. Holder identity
(pid, `started_at`) lives in a _sibling_ `.holder.json`, written temp-then-rename, read best-effort,
purely descriptive: an unreadable holder yields `Busy(None)` and the caller still refuses correctly.
Two subtleties earned the hard way — the guard unlocks explicitly rather than relying on close,
because `flock` belongs to the open file _description_ and any subprocess spawned while the guard
was alive inherited a duplicate, leaving a phantom holder; and it deletes the holder file _before_
unlocking, so it can never delete a successor's. The scheduled job is `pond sync -q --no-wait`:
never `--yes`, so an unattended run can never auto-enable a freshly detected adapter, and
`--no-wait` so a tick landing on a held lock skips cleanly at exit 0 (`schedule.rs:11-14`). Every
run writes a last-sync record on success _and_ failure, so a silently failing scheduled sync
surfaces in `pond status`.

## Takeaways for ward

1. **Re-create should report the fidelity it got, not just that it happened.** _(extends
   `_Attach_`)_ Pond makes fidelity a system decision with a per-session report and an explicit
   downgrade for "captured format newer than the installed client can load." Ward's re-create
   assumes `claude --resume <id>` brings the conversation back intact; the equivalent honesty is for
   the `resumed` event and attach's report to say _how_ it came back, and to refuse rather than open
   a lookalike. Same instinct as attach refusing when locate says the transcript is gone —
   generalized from present/absent to present/degraded.

2. **"Already there" must never be indistinguishable from "done".** _(sharpens `_Attach_`)_ Pond's
   pi bug is the cautionary tale: a no-overwrite refusal that also meant success. Ward's
   `has-session` check has the same shape — a live tmux session under the derived name is _assumed_
   to be this session's agent, and a stale or hand-made one hands a human the wrong pane with the
   same silent signature. The guard is already half-built: `WARD_AGENT=<id>` is set in the pane
   environment by _Hosted open_, so `tmux show-environment -t <name> WARD_AGENT` can confirm a found
   session is ours before attaching, instead of trusting the name alone.

3. **Derive liveness from an OS primitive; keep stored identity strictly a hint.** _(confirms "the
   host name is a pure function of identity"; extends `_Locate_`)_ Pond's flock cannot go stale by
   construction and its holder file is advisory only. `has-session` is Ward's analogous primitive
   and `host: 'tmux'` its analogous hint; locate's `{kind, name, live}` should present `live` as
   freshly derived on every read and `name`/`kind` as launch provenance. Pond is evidence the split
   survives real crash traffic.

4. **Watch the inherited-descriptor bug class when Ward spawns tmux.** _(new consideration for
   `_Hosted open_`)_ Pond found that a subprocess spawned while a lock guard was alive inherits a
   duplicate file description and keeps the lock held after the parent drops it. Ward's hosted open
   spawns `tmux` from a process holding `.ward/store.lock`, and the tmux _server_ it may fork
   outlives the CLI. Worth a test that the store lock releases independently of the spawn —
   otherwise the failure is a Ward command mysteriously reporting the lock busy with no holder.

5. **A no-overwrite, batch-scoped, unwinding write is the right shape for any record→live
   materialization.** _(extends `_Attach_` re-create)_ If Ward ever materializes into a harness's
   own data directory — a reconstructed transcript when `--resume` finds none, or a future
   non-Claude harness — `write_restored_files` is the blueprint: refuse the whole batch naming every
   collision before the first byte, O_EXCL as the real guard because a symlink would carry the write
   outside the root, validation at the single writer, and an unwind removing only what this call
   created.

6. **"Derived, not stored" has a second half: the derivation must be provably re-derived each run.**
   _(extends "pure function of identity" and `_Doctor: strays_`)_ Pond forbids caching even a
   _proof_ of emptiness and defaults anything it cannot cheaply classify to `Opaque` → re-read. The
   equivalent rule for doctor's stray scan: never memoize a verdict between runs, and classify
   "could not tell" — tmux unreachable, `list-sessions` failing — as its own honest finding rather
   than silently as clean.

7. **Report the ordinary failure loudly; act on almost nothing.** _(confirms
   `_Doctor:
   gone/strays_`)_ Pond records a failed run precisely so a silently failing scheduled
   sync surfaces, and its single automatic repair — self-heal — deletes nothing, retries once, and
   names exactly what it moved and what the next run will redo. A workable calibration for §18
   authority: close-kills-the-cache is the analogue of self-heal (narrow, deterministic, triggered
   by a deliberate act), and doctor's stray report the analogue of a status surface that names but
   never sweeps.

8. **Grouping by a derived root beats a stored group id — with a named backstop.** _(confirms "one
   tmux session per Ward session" plus prefix grouping)_ Pond groups by `session_root(id)` and lets
   the composite id reconstruct its own file placement: structured identity carrying both grouping
   and placement, exactly what `ward-<workspace>-<session-id>` does. It also shows where the pattern
   frays — pond needed a second, authoritative `source_agent` check because one harness marks
   subagent-ness outside the id, and documents the id-shape check as "NOT authoritative on its own"
   (`handlers.rs:1517-1530`). Ward's prefix scan has the same latent ambiguity (a workspace name
   containing `-` makes the name un-splittable), so the stray scan should join records by whole-name
   equality, never by parsing the name back apart.

9. **Degrade where correctness lives elsewhere; refuse where the degrade would lie.** _(confirms
   "explicit flag refuses; configured default degrades")_ Pond degrades its lock to
   unlocked-with-a-warning on filesystems lacking flock, because correctness comes from OCC and the
   lock never touches store bytes — the same argument as `agent.host: tmux` degrading to foreground
   because the record, not the host, carries correctness. Its limit is the useful half: an
   unreachable embedding model is deliberately _not_ a soft degrade, because that degrade would
   quietly produce a wrong record.

## Conflicts with ward's posture

**Pond's record is derived; Ward's is authored.** Pond never mints a session — identity is
source-supplied, and `model-no-synthesis` makes inventing a canonical value a compile error via the
extractor seam (§6.4). Ward mints the UUID and commits the record _before_ launch. The consequence
runs opposite: pond's record can never be ahead of the live half and is absent until the harness has
written something, whereas Ward's is deliberately ahead of it — which is what makes "a crash between
record and launch leaves an open record whose handle resolves to nothing" the honest normal state
rather than a bug. Pond buys working for harnesses it never launched, with history from before
install and no cooperation required. Ward buys a record that _authorizes_ the run.

**No live half means no lifecycle to disagree about.** Pond has no state field and no open/close, so
every distinction the lifecycle slice cares about — open ≠ running, exit ≠ close — is out of scope.
Pond is therefore not evidence for or against 0031's lifecycle rules; it is evidence that a durable
half can be built completely indifferent to them, which is precisely the property 0031 wants from
`host` being launch provenance rather than status.

**Truth is a columnar database, not markdown in git.** Pond's record is Lance with optimistic
concurrency, manifest versioning, time travel, and a repair path for torn manifests — buying
multi-writer safety across machines with no coordinator, at the cost of a record no human reads and
a store a power cut can damage in ways that need machinery to undo. Ward's markdown-in-git needs
none of that apparatus (git _is_ it) but cannot answer "which session touched the OCC retry loop."
These are complementary rather than competing: pond's Claude Code adapter already reads exactly the
`~/.claude/projects` transcripts `ward session locate` points at.

**Pond refuses the parent role 0031 accepts on purpose.** Its position is that reading what the
harness already writes is strictly safer than being in the process tree. The tmux host takes the
opposite bet — though in the same spirit: no shim wraps the harness, and detach explicitly means
Ward is no longer the run's parent. The residual disagreement is narrow. Pond would say Ward should
not need `has-session` at all, because a run's aliveness is the harness's business. What Ward buys
by disagreeing is `attach` — a door back into a _running_ conversation, which no amount of tailing
files can ever provide.
