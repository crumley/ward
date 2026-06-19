# Subsystem: Model Selection

> **Layer:** intent · subsystem (seam). The constraints any design must honor; names no tool.
> **Design:** `../../design/subsystems/model-selection.md`. **Status:** placeholder skeleton.

## Responsibility

Choose which model (and thinking depth) backs a given session.

## Constraints any design must honor

- A default at the workspace level, overridable at project, task, and room/session levels
  (**narrower overrides broader**).
- Honor the role logic (`concepts/roles.md`): **fast/shallow** where the job is bookkeeping (house
  supervisor, charge nurse), **deep/high-thinking** where the job is hard work (rooms).
- **Model-agnostic** (`principles.md` §5): no concept assumes a particular model; model ids are
  configuration that tracks the best available models over time.

## What this is NOT

- Not a fixed set of model ids — those track the frontier and are design/configuration.

## Canonical home for

The per-scope override hierarchy and the fast-vs-deep intent. The concrete model ids and config
shape are design.

## Open questions

- The initial persona→tier mapping and how depth is expressed are design decisions, not intent.
