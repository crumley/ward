# Subsystem: Human Shell / Interaction Layer

> **Layer:** intent · subsystem (seam). The constraints any design must honor; names no tool.
> **Design:** `../../design/02-subsystems/05-shell-cli.md`. **Status:** placeholder skeleton.

## Responsibility

The thin convenience layer through which a human drives Ward interactively, plus the usage signal it
produces.

## Constraints any design must honor

- **All real logic lives in the Ward tool**; this layer only plumbs to it and presents results, kept
  thin so the core stays testable and portable.
- The structured interface is organized around **nouns and verbs**; the interactive layer adds
  **mnemonic shorthands** for common operations and **records command usage** for later
  optimization.
- The **human is the default caller** (`01-principles.md` §8); an agent caller identifies itself
  (and its scope, persona, working directory) — the human never declares they are the human.

## What this is NOT

- Not the home of business logic; not a specific shell or command syntax — those are design.

## Canonical home for

The thin-shell contract, the noun/verb organization at the constraint level, and the human-default
caller-identity rule.

## Open questions

- **Caller-identity signal** — the concrete mechanism and which fields are required vs. inferred (🔴
  spine; design). The _constraint_ (human default, agent self-identifies) is intent.
- **Telemetry analysis loop** — whether usage optimization is itself a reflection type.
