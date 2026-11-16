# 0066 — Intent feedback

> Intent frictions found while building the workspace format guard.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

What was built, in one paragraph: `workspace.md` carries `format: N`, the level the record needs of
the Ward that reads it. A Ward whose own level is lower refuses every verb that touches the record —
reads included — before parsing anything, with one message naming the remedy; `doctor`, `--version`
and `--help` still answer. `ward workspace upgrade` raises the level as a step of convergence, in
the same journal commit as the record shapes it guards, and its report says what older Wards lose. A
newer Ward on an older workspace works as before, except that a document carrying a shape above the
workspace's level is not written until the upgrade raises it.

## IF-001 — an older CLI is refused writes only; its reads are just as unsafe

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _Version skew: what a mismatched CLI may do_ ("Older CLI, newer workspace, schema changed.
  Structural writes are refused.").
- **Friction:** the slice refuses an older CLI's structural writes and says nothing of its reads,
  which leaves them allowed. Both failures that prompted this build were reads. An older Ward
  reading a floor record with a color it does not know fails with a schema error that never mentions
  the binary. An older Ward reading a repository record drops a field it does not know and reports
  the repository's checkout as missing; the write that follows — a restore that clones it — is the
  correct act on what it read. A status built from misread records is wrong while looking right,
  which is the outcome §16 and §17 exist to prevent, and there is no "structural" subset of an older
  CLI's writes that is safe once its reads are not.
- **Assumption made to keep moving:** an older CLI is refused every verb that reads or writes the
  record. What still answers is what reads none of it: the version, help, and doctor, which reports
  the mismatch as its one workspace finding.
- **Proposed revision:** in the older-CLI bullet, say that the CLI **refuses to read or write the
  record**, and why reads are included — an older reader cannot tell a shape it misreads from one it
  reads — and name what must still answer: enough for a human to learn which Ward this is and that
  it is the thing to change.
- **Status:** pending

## IF-002 — the step that locks older Wards out is journal, and the slice says migration is gated

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _Version skew_ ("Migration is gated, and rides version control … it travels the stewardship path —
  its own branch, previewed as a diff, merged") against _How a workspace evolves_ ("The record's own
  shape … is converged directly on the workspace's own main line as journal").
- **Friction:** the two passages meet at the format level and pull apart. Raising it is part of
  converging the record's shape, which the slice sends to the main line as journal. It is also the
  one step that takes something from someone — every older Ward sharing the workspace refuses from
  then on — which is the kind of change the slice wants previewed and merged by a human. They cannot
  both hold without a cost: convergence already writes new shapes on the main line directly, so a
  level that waits for a merge leaves commits holding a shape that nothing tells an older Ward to
  keep away from; and making each shape-writing converge step wait for that merge turns one upgrade
  into two runs with a merge between them. A declared agent may also run the upgrade
  (`ward workspace upgrade TASK`), so under the journal reading an agent can raise the level without
  a human having read anything.
- **Assumption made to keep moving:** the raise is a converge step and rides the convergence commit,
  so that no commit on the main line ever holds a level's shape without its marker. The human's
  authority is the decision to run the upgrade; the upgrade's report states, marked, what older
  Wards lose; nothing is previewed.
- **Proposed revision:** say in _Version skew_ which of the two the format level is. Either: the
  level is raised by convergence together with the shapes it guards, what the human is owed is the
  announcement, and "migration is gated" is reserved for a transformation that rewrites existing
  records. Or: raising the level takes the human's own act — refused to a declared agent, or held on
  the stewardship branch — and the slice accepts that convergence must then hold back any shape
  above the workspace's level until that act lands.
- **Status:** pending

## IF-003 — "structural writes" by a newer CLI is undefined, and read broadly it stops all work

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _Version skew_ ("Newer CLI, older workspace, schema changed. Reads proceed, with the skew
  surfaced; structural writes do not proceed until the workspace is migrated.").
- **Friction:** the slice does not say which writes are structural. Read broadly — every record
  write — a workspace stops taking work the day a machine's binary updates, until someone runs the
  upgrade; the same slice says artifact reconciliation must not block the workspace, for the same
  reason. Read as nothing — today's behaviour — a newer Ward writes a new shape into a workspace
  whose marker has not moved, and an older Ward reads it unguarded; that is how `checkout: external`
  reached a main line.
- **Assumption made to keep moving:** a structural write is a document that carries a shape
  introduced above the workspace's level. That write is refused, naming the upgrade; every other
  write by a newer Ward proceeds.
- **Proposed revision:** define the term in the slice in those words, and state the reason for the
  narrow reading beside it: what must wait is the shape the workspace's level does not describe, not
  the work.
- **Status:** pending

## IF-004 — the version stamp is the only thing the record says about its reader, and it cannot

- **Slice:**
  [`intent/01-concepts/06-workspace-lifecycle.md`](../../intent/01-concepts/06-workspace-lifecycle.md),
  _What creation establishes_ ("The version stamp — which version of Ward created it") and _Version
  skew_;
  [`intent/02-subsystems/00-metadata-store.md`](../../intent/02-subsystems/00-metadata-store.md)
  (records, "the version stamp").
- **Friction:** the slices treat the version stamp as what skew is measured from, while also saying
  that what blocks is a schema mismatch and not a version difference. A stamp of the creating
  version cannot answer the schema question: two builds a schema apart can share a version — every
  build so far does — and the stamp is not what the record currently needs. The record had no fact
  that says "this is the shape a reader must understand".
- **Assumption made to keep moving:** the record carries a second fact beside the stamp, a format
  level that moves only when the record's shape moves in a way an older reader would mishandle. The
  stamp keeps its meaning and is no longer asked the schema question.
- **Proposed revision:** name the format level among what the workspace record holds, in both
  slices, as the fact version-skew blocking is decided from; leave the stamp as provenance.
- **Status:** pending
