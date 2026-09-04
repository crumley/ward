# 0038 — Spec-feedback

> Intent frictions found while binding sessions to the machine that holds their history.

This file is the entry's adjudication surface and is read on its own — an adjudication session loads
it without the entry's README, so each SF carries enough context to be ruled on directly.

## SF-001 — uniqueness among open sessions is too weak to keep the record

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md),
  _Identity_ — the session paragraph ("unique among the open sessions in the workspace … over
  history a reused id is disambiguated by time and context") and the _What gets an identity_ table's
  Session row. Also
  [`intent/00-foundation/open-questions.md`](../../intent/00-foundation/open-questions.md), which
  restates the rule under _Identity edges closed_.
- **Friction:** the rule sets uniqueness at exactly the level a bare address needs and says a reused
  id is disambiguated by time and context. That reasoning holds for a **room**, whose code labels a
  slot that empties and refills, and fails for a **session**, whose id is also the address of a
  **document**. Two things break under it. A session record is stored at its id, so allocating a
  closed session's number again overwrites that record — the handle, the events, the purpose — which
  is _closed stays closed_ (`02-sessions-and-lifecycle.md`) spent on an id nobody needed to recycle;
  "time and context" cannot disambiguate a record that no longer exists. And the rule is stated per
  workspace while a workspace **travels**: two clones on two machines each allocate the smallest
  free number from their own view, both mint `workspace-1`, and the sync between them is a conflict
  between two different sessions' records. Nothing in the slice says which machine a session belongs
  to, or that a session belongs to one at all.
- **Assumption made to keep moving:** a session id is unique over the workspace's **history**,
  across the machines that share it — composed of the slug, a number **never reused**, and the
  **machine** the session ran on (`workspace-7@gcp`). A bare id remains the sufficient address the
  slice asks for; it simply addresses one session over all of history rather than one among those
  open. Ids allocated before this rule keep working unchanged and are never migrated.
- **Proposed revision:** in the session paragraph, replace uniqueness-among-open with uniqueness
  over the workspace's history across the machines that share it, composed of slug, a never-reused
  number, and the machine — with the _why_ stated as the two failures above (a reused id overwrites
  the record the permanence guarantee exists to keep; a shared workspace is allocated from on more
  than one machine). Note the contrast the file already draws: rooms reuse codes because a room is a
  slot, a session is a record. Update the table's Session row to match, and the open-questions
  restatement with it. Task codes are deliberately **not** touched: a task record's path carries its
  slug and floor, and closing a task does not free its code for a new document.
- **Status:** pending.

## SF-002 — the session-log minimum does not name the machine, and _running_ is per machine

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Recording per scope_ (the minimum) and _Open vs. running_.
- **Friction:** the minimum names the identity, the working directory, the harness handle, the
  model, the timestamps, the state, and the purpose — everything needed to resume a thread except
  **where it can be resumed**. The handle is machine-independent in form and machine-bound in fact:
  the harness stores the run's history on the machine that produced it, so a handle plus a working
  directory resolves to a transcript on one computer and to nothing on another. _Open vs. running_
  says running is "on _this_ machine, right now" — which already concedes that the attachment is per
  machine — but the record it is derived from carries nothing that says which machine could attach.
  Recovery reading the record on a fresh clone therefore cannot tell a thread it may re-attach from
  one it cannot.
- **Assumption made to keep moving:** the **machine** is part of the minimum, recorded on the
  session at open like the handle and the model, and read (never guessed) by resume, locate, and
  status. It is optional on records written before it existed: unrecorded is an honest answer and is
  reported as such.
- **Proposed revision:** add the machine to the minimum's list, with its _why_ — a session is bound
  to the machine holding its harness history, and without the field the record cannot say where a
  thread can be resumed. In _Open vs. running_, state that running is per machine and that the
  record names the machine that can turn open into running.
- **Status:** pending.

## SF-003 — may the shell ask a present human whether a thread is done?

- **Slice:**
  [`intent/01-concepts/02-sessions-and-lifecycle.md`](../../intent/01-concepts/02-sessions-and-lifecycle.md),
  _Guarantees_ — "closing stays deliberate: … nothing closes an open one on the session's behalf."
- **Friction:** the guarantee is written against **machinery** closing sessions — a sweep, a reboot,
  a heuristic that decides a thread looks finished — and this build agrees with all of that (an
  unresumable thread stays open and visible; nothing is ever tidied away). What the guarantee does
  not say is whether Ward may **ask**. The case that makes it worth asking: a run is opened and
  exited at the first prompt, leaving no harness history at all, and under the current text the
  session stays open forever with nothing to resume — an honest record of nothing, accumulating. The
  human is standing at the terminal Ward has just taken back from the agent, which is the cheapest
  moment their answer will ever be available. A reading that forbids the question would keep the
  guarantee and lose the human's attention to a growing list they cannot act on; a reading that
  permits it needs to say why a **defaulted** question is still their answer and not Ward's.
- **Assumption made to keep moving:** a question asked of a demonstrably present human — a
  foreground run they just exited, both streams terminals, never a declared agent, never a `--json`
  invocation, never a caller without a terminal — is the human closing the session, including when
  they take the default with a keystroke. Ward states what it found and proposes; the human decides.
- **Proposed revision:** one sentence in the guarantees paragraph: when a run exits with its human
  present, the shell **may ask** whether the thread is done; the answer is the human's close, never
  Ward's, and every non-interactive caller keeps the session open. If the ruling is that a defaulted
  question is too close to Ward deciding, the honest alternative is to require an explicit `y` with
  no default — which the build can adopt in one line.
- **Status:** pending.

## SF-004 — locate is answered per machine, and the slice does not say so

- **Slice:**
  [`intent/02-subsystems/03-agent-harness.md`](../../intent/02-subsystems/03-agent-harness.md),
  _Make the run's history locatable from the recorded handle_ — "locate distinguishes found from
  gone".
- **Friction:** the constraint reads as a property of the handle: a handle either resolves or does
  not, retention being the harness's. In practice it is a property of the handle **on a machine**.
  The same handle resolves on the computer that produced the run and not on any other, and the two
  causes of a gone answer — the harness discarded the history, or this is not the machine that has
  it — call for different acts by the caller: the first is permanent and the second is solved by
  going to the other machine. A design following the constraint literally reports one
  undifferentiated `gone` and leaves the caller to guess which it is.
- **Assumption made to keep moving:** `gone` means gone **here**, and the answer names the machine
  the run stood on where the record has one, so a caller can tell "this history no longer exists"
  from "this history is on another computer".
- **Proposed revision:** in the locate constraint, say the distinction is drawn **per machine** — a
  handle found nowhere on this machine is gone here, even when another machine holds it — and note
  that the session record's machine is what makes the two causes distinguishable to the caller.
- **Status:** pending.

## SF-005 — the interactive rules cover a mode the human enters, not a moment they are already in

- **Slice:**
  [`intent/02-subsystems/07-human-shell.md`](../../intent/02-subsystems/07-human-shell.md), the
  interactive-resolution bullet — **deliberate entry**, a **deterministic result for every
  non-interactive invocation**, and **unreachable by an agent caller**.
- **Friction:** the three constraints are written for a **picking mode**: the human asks for it, and
  the rule against prompts springing from a missing argument is what keeps the same invocation from
  blocking for one caller and failing for another. A question asked when a foreground run **exits**
  is a different shape. Nothing was omitted from the command line, so "deliberate entry" has no
  argument to attach to — yet the moment is at least as deliberate as a picker: the human ran a
  foreground agent and just left it, and the terminal is theirs again. The slice neither permits
  this nor forbids it, so a build must either invent the reasoning or leave the friction
  unaddressed.
- **Assumption made to keep moving:** the deliberate-entry rule is satisfied by a moment in which
  the human is demonstrably present, not only by an argument they typed — and the other two
  constraints hold literally: a declared agent and every non-TTY or `--json` caller get the
  deterministic, unchanged behavior, and the interactive path is unreachable for them. A flag
  pre-answers the question for anyone who wants it settled in advance.
- **Proposed revision:** name the exit question as a second case under the interactive-resolution
  bullet: a question asked at a moment the human is demonstrably present (a foreground run they just
  left), with a deterministic default, pre-answerable by a flag, and never asked of an agent or a
  non-TTY caller — stated so the rule reads as "deliberate entry _or_ demonstrable presence", with
  the determinism and agent-unreachability constraints unchanged.
- **Status:** pending.
