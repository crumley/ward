# How-Intent: CLI Shape, Caller Identity, Shell Aliases & Usage Telemetry

Durable choices behind the **human shell / interaction layer** seam
(`../what/07-subsystem-seams.md`) and the structure of the Ward CLI. These serve the
two-audiences principle (`../what/01-principles.md` §8) and feed the compounding loop
(`../what/06-reflection-and-evolution.md`).

## Choice: the CLI is organized around nouns and verbs

The structured CLI surface is grouped into **cohesive commands and subcommands around nouns and
verbs** — the nouns are the domain concepts (workspace, project, task, worktree, room, session,
repo), the verbs are the operations (create, list, open, close, resume, dispatch, …).

**Why.** A noun/verb structure is discoverable and predictable for both audiences: an agent
composes commands deterministically from the model it already knows, and a human can guess the
command for a concept. It keeps the surface coherent as it grows, instead of accreting ad hoc
commands.

## Choice: the human is the default caller; agents identify themselves

A core ergonomic rule: **the human must never have to tell Ward that they are the human.** When
a human types a command in their own shell, Ward optimizes for them and requires no
who-am-I/scope/persona arguments.

When the caller is an **agent**, it is responsible for carrying its context — who it is (persona),
its scope, and its working directory. Ward distinguishes the two by an **ambient signal it sets
when it starts an agent**: an environment variable (and the context fields with it) that Ward
exports into the agent's process, **propagated to all subprocesses**. So when `ward` is invoked
*from within an agent*, that signal is present and Ward **requires** the context fields; when the
same command is typed by a human in their shell, the signal is absent and Ward requires nothing.

**Why.** Optimizing for the human means removing ceremony from the common interactive case;
making the agent declare its context means the rich provenance and telemetry below are captured
*without* burdening the human. The asymmetry is intentional: the agent is the one that can afford
to be explicit.

## Choice: a thin shell-alias layer of mnemonic shorthands

For the human driving Ward interactively, Ward provides a **shell alias file** (working
assumption: a fish alias file) of **short, mnemonic shorthands** over the common commands.

- The aliases are **thin plumbing only**: all real logic stays in the Ward tool, so the core
  stays testable and portable across shells.
- The alias set is **not assumed obvious or fixed**: it **evolves over time** as we learn which
  operations are actually frequent, driven by the telemetry below.

**Why separate from the structured CLI.** The structured CLI optimizes for completeness and
predictability (and for agents); the alias layer optimizes for a human's muscle memory on the
few things they do constantly. Keeping them separate lets each be good at its job.

## Choice: record command usage as local telemetry

Ward **records which commands are invoked, and by whom** — per invocation: which **persona**,
which **scope**, which **working directory**, and whether the caller is the **human or an agent**
(known from the caller-identity signal above). This usage record is part of the workspace.

**Why.** Over time this telemetry is analyzed (a natural reflection type,
`../what/06-reflection-and-evolution.md`) to decide **what needs or benefits from
optimization** — which commands deserve a new mnemonic alias, which flows are clumsy, which
tooling is missing. It is how the interaction layer compounds.

**Privacy.** This telemetry is **local and personal** (`../what/01-principles.md` §4); it is part
of the workspace's own record and is never surfaced to remote artifacts.

## Guardrails — what this is, and what it is not

- **Is:** a noun/verb structured CLI; a thin, evolvable mnemonic alias layer; human-default
  caller identity with agents declaring context via an ambient, subprocess-propagated signal; and
  local usage telemetry feeding optimization.
- **Is not:** a requirement that humans authenticate or self-describe — the absence of the agent
  signal *is* "human," and nothing more is asked of them.
- **Is not:** a fixed alias set — aliases are expected to churn as telemetry reveals real usage.
- **Is not:** telemetry that ever leaves the workspace — it is local, like everything else
  personal.

## For the implementation plan — where to fill in the blanks

Within the guardrails: the exact command tree and naming; the specific environment-variable
name and the set of context fields it carries (and which are required vs. inferred,
`../what/08-open-questions.md`); the initial alias bindings; and the telemetry storage format,
fields, and analysis tooling.
