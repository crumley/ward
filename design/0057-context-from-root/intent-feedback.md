# 0057 — Intent feedback

> Intent frictions found while designing context from the root.

This file is the entry's adjudication surface and is read on its own. An adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

## IF-001 — context is keyed to the directory a session starts in, but every session starts at the root

- **Slice:**
  [`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md) —
  _Context loads from an `AGENTS.md` hierarchy keyed to the working directory_ ("A narrow-scope
  session started in a **repository or anchor directory** loads _that_ directory's `AGENTS.md`";
  "where you start determines what you load"). It is read against
  [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md), _Working
  directory: the second axis_ ("Narrow scopes start in the **specific directory** of the thing they
  work on"), and against
  [`intent/01-concepts/01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md),
  [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md) §9, the
  glossary and the delivering-work walkthrough, which all repeat the model.

- **Friction:** the slice keys a session's context to the directory it starts in. Ward starts
  workspace and floor sessions at the root (design 0051), because a floor's directory is a record
  directory and the root is where a coordinating agent reads everything from. A task's worktree is a
  foreign repository's checkout, under `worktrees/` rather than under its floor. So the levels
  between the root and the work are never on any session's start path. The two open entries that
  needed them each invented a mechanism. 0055 starts floor sessions with an environment variable
  naming the floor's manifest, and proposes keying context to the scope as well (0055 IF-001). 0056
  writes a Claude Code–named pointer into every worktree with a git exclude, and proposes admitting
  a harness-named file into the intent (0056 IF-001). Both are custom, both depend on an instruction
  under every other harness, and neither generalizes to the next level that needs it.

- **Assumption made to keep moving:** this entry is designed on the revision below. Every session
  starts at the root, its scope comes from its record, and it reads each `AGENTS.md` downward along
  the path it works in. The layout puts a floor's worktrees beneath the floor's own directory.

- **Proposed revision:** retitle the hierarchy section of `05-context-loading.md` to _Context loads
  downward from the workspace root, along the path a session works in_. State four rules: every
  session starts at the root; its scope comes from its identity; it reads each `AGENTS.md` from the
  root down to where it works; the layout makes the path carry the context. Add that an anchor's
  `AGENTS.md` is its repository's, and that Ward writes nothing inside an anchor. Replace _why keyed
  to working directory_ with why downward, why scope from identity, and why the layout carries it.
  The rejected alternative, starting low and loading upward with a mechanism per gap, is recorded
  inside the why. The canonical-home and left-to-implementation lists follow. Align the domain
  model, the scopes slice, principle §9, the glossary's two rows and the walkthrough, and change
  nothing else in them. The exact text is below, from the intent-only change
  [#126](https://github.com/crumley/ward/pull/126), formatted as it lands.

  This revision also settles two items in the open entries. 0055 IF-001 is declined: no scope key is
  needed once scope comes from the record. 0056 IF-001 is declined: Ward adds no file inside an
  anchor.

- **Status:** pending

### The edits, before and after

**Edit 1** — [`intent/00-foundation/01-principles.md`](../../intent/00-foundation/01-principles.md)

Before:

```markdown
Every agent session is started at a **specific scope** (what it is responsible for) and a **specific
working directory** (where it operates and from which it loads context). A session does not silently
widen either. **Why:** an unbounded session is an unfocused one; bounding both axes is how placement
and focus (§1) become operational.
```

After:

```markdown
Every agent session is started at a **specific scope** (what it is responsible for) and works in a
**specific working directory** (where it operates, and the path down to which it loads context). A
session does not silently widen either. **Why:** an unbounded session is an unfocused one; bounding
both axes is how placement and focus (§1) become operational.
```

**Edit 2** — [`intent/00-foundation/glossary.md`](../../intent/00-foundation/glossary.md)

Before:

```markdown
| **Working directory** | Where a session stands and loads context from — _where_ it operates;
chosen independently of scope (root for broad scopes, a repo/worktree dir for narrow ones). |
[domain-model](../01-concepts/00-domain-model.md),
[scopes-and-personas](../01-concepts/01-scopes-and-personas.md) |
```

After:

```markdown
| **Working directory** | Where a session works, and so the path along which it loads context —
_where_ it operates; independent of scope. Every session starts at the workspace root and reads
downward to the repo/worktree dir it works in. | [domain-model](../01-concepts/00-domain-model.md),
[scopes-and-personas](../01-concepts/01-scopes-and-personas.md) |
```

**Edit 3** — [`intent/00-foundation/glossary.md`](../../intent/00-foundation/glossary.md)

Before:

```markdown
| **Context loading** | How a session acquires its context — a harness-neutral `AGENTS.md` hierarchy
keyed to the working directory, built deterministically and append-biased for token-cache sharing. |
[context-loading](../01-concepts/05-context-loading.md) |
```

After:

```markdown
| **Context loading** | How a session acquires its context — a harness-neutral `AGENTS.md` hierarchy
read from the workspace root down to where the session works, built deterministically and
append-biased for token-cache sharing. | [context-loading](../01-concepts/05-context-loading.md) |
```

**Edit 4** — [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)

Before:

```markdown
A session has a **scope** (what it is responsible for) _and_ a **working directory** (where it runs
and from which it loads context). A session's scope is one of **workspace / project / task / room**
— the levels at which someone is _responsible_. An **anchor is not a scope**: it is a resource a
room occupies (Anchor, above); responsibility for what happens on an anchor lies with the room (or
elided session) occupying it.
```

After:

```markdown
A session has a **scope** (what it is responsible for) _and_ a **working directory** (where it
works, and so the path along which it loads context). A session's scope is one of **workspace /
project / task / room** — the levels at which someone is _responsible_. An **anchor is not a
scope**: it is a resource a room occupies (Anchor, above); responsibility for what happens on an
anchor lies with the room (or elided session) occupying it.
```

**Edit 5** — [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)

Before:

```markdown
- Broad scopes often start at or near the **workspace root**, to load workspace-wide context and
  skills.
- Narrow scopes start in the **specific directory** of the thing they work on — a repository or an
  anchor — to load _that_ directory's context and skills and stay specialized.
```

After:

```markdown
- Every session **starts at the workspace root**, whatever its scope, so it loads workspace-wide
  context and skills first and reads its scope from its own record.
- Narrow scopes then **work in** the specific directory of the thing they work on — a repository or
  an anchor — loading the context and skills on the path down to it, and stay specialized.
```

**Edit 6** — [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)

Before:

```markdown
The mechanism (e.g. `AGENTS.md` files through the hierarchy) is a _how_ — `05-context-loading.md`.
The _what_ is that scope and working directory are independently chosen when a session starts. **Why
two axes:** what an agent is responsible for and where it stands are genuinely different choices;
separating them is what lets a project-scope agent read broadly while a room stays narrow.
```

After:

```markdown
The mechanism (e.g. `AGENTS.md` files read downward through the hierarchy) is a _how_ —
`05-context-loading.md`. The _what_ is that scope and working directory are independent: the scope
is fixed when a session starts, and the directory it works in follows the work. **Why two axes:**
what an agent is responsible for and where it works are genuinely different choices; separating them
is what lets a project-scope agent read broadly while a room stays narrow.
```

**Edit 7** —
[`intent/01-concepts/01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md)

Before:

```markdown
- **Working directory** — where it stands and loads its context from. _Where_ it operates.
```

After:

```markdown
- **Working directory** — where it works, and so the path along which it loads its context, read
  down from the workspace root where every session starts. _Where_ it operates.
```

**Edit 8** —
[`intent/01-concepts/01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md)

Before:

```markdown
The two are chosen independently when a session starts, and together they bound what an agent
attends to. **Why two:** what an agent is responsible for and where it stands are genuinely
different choices — separating them is what lets a project-scope agent read broadly while a room
stays narrow.
```

After:

```markdown
The two are chosen independently, and together they bound what an agent attends to. **Why two:**
what an agent is responsible for and where it works are genuinely different choices — separating
them is what lets a project-scope agent read broadly while a room stays narrow.
```

**Edit 9** —
[`intent/01-concepts/01-scopes-and-personas.md`](../../intent/01-concepts/01-scopes-and-personas.md)

Before:

```markdown
- **Working directory** — where the session runs and loads context from.
```

After:

```markdown
- **Working directory** — the directory the session works in, below the workspace root it starts at.
```

**Edit 10** —
[`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md)

Before:

```markdown
## Context loads from an `AGENTS.md` hierarchy keyed to the working directory
```

After:

```markdown
## Context loads downward from the workspace root, along the path a session works in
```

**Edit 11** —
[`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md)

Before:

```markdown
the filesystem hierarchy**, loaded relative to the session's **working directory**
([`00-domain-model.md`](00-domain-model.md), the two axes).
```

After:

```markdown
the filesystem hierarchy**, read **from the workspace root down** to the directory the session works
in ([`00-domain-model.md`](00-domain-model.md), the two axes).
```

**Edit 12** —
[`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md)

Before:

```markdown
- A broad-scope session started near the **workspace root** loads the workspace-level `AGENTS.md`
  and the top-level skills it points to.
- A narrow-scope session started in a **repository or anchor directory** loads _that_ directory's
  `AGENTS.md` and _its_ skills, staying specialized.
```

After:

```markdown
- **Every session starts at the workspace root**, whatever its scope, so the workspace-level
  `AGENTS.md` and the top-level skills it points to are the first context any session loads.
- **Its scope comes from its identity, not its location.** A session learns what it is responsible
  for (the workspace, a project, a task) from its own record, which its declared identity names,
  never by inferring it from the directory it stands in.
- **Before it works in a directory, it reads each `AGENTS.md` on the path from the root down to that
  directory**, broadest first and nearest last. A narrow-scope session working in a repository or
  anchor directory thereby loads _that_ directory's `AGENTS.md` and _its_ skills after everything
  above it, and stays specialized.
- **The layout makes the path carry the context.** A project's working places sit beneath a
  directory that carries the project's `AGENTS.md`, so the path down to any anchor passes through
  every level whose guidance applies to the work there. No level is reached by a pointer, a
  variable, or a file named for one harness.
```

**Edit 13** —
[`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md)

Before:

```markdown
load for that scope, rather than relying on the agent to discover them.
```

After:

```markdown
load for that scope, rather than relying on the agent to discover them. An anchor's `AGENTS.md` is
its repository's own: Ward writes nothing inside an anchor, because the level above it already
carries what the workspace knows about the work there.
```

**Edit 14** —
[`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md)

Before:

```markdown
no harness is privileged in substance. **Why keyed to working directory.** It makes "scope + working
directory" operational: where you start determines what you load, so a room is specialized to its
anchor while the attending sees the project.
```

After:

```markdown
no harness is privileged in substance.

**Why downward from the root.** It is the one direction every harness follows. Harnesses agree on
loading the guidance of the directory they start in and of its parents; they disagree on what, if
anything, they load below it, and on whether moving to another directory later loads anything at
all. A session that starts at the root is therefore guaranteed the workspace's manifest under any
harness, and that manifest can state one rule (read downward to where you work) that holds under all
of them. A harness that loads nested guidance natively does part of that reading for the agent; it
never has to do all of it. The alternative, starting low and loading upward, reads a level's
guidance only where a session happens to start: a session whose scope and starting directory differ
misses its own level, and each such case then needs a mechanism of its own (a pointer file, an
environment variable, a harness's local file) that is custom, harness-specific, and only as reliable
as the convention it leans on. **Why scope from identity.** The scope is a recorded fact; a
directory is only where the work happens to be. Read from the record, the scope is exact for every
session, wherever it works next. **Why the layout carries it.** A rule to read downward is only as
good as the path it walks. When a level's working places sit beneath that level's directory, walking
the path is the whole mechanism, and nothing has to be kept in step with it — so a room is
specialized to its anchor while the attending sees the project.
```

**Edit 15** —
[`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md)

Before:

```markdown
- **Context assembly** — the `AGENTS.md`-hierarchy-by-working-directory model (a harness-specific
  filename served by an adapter onto `AGENTS.md`, never a copy), the deterministic/append-oriented
  bias for cache sharing, the **two-zone model** (stable prefix + mutable tail, graduation, adoption
  boundaries) **and its ordering, which serves authorship as well as volatility** (Ward's part
  first, the human's after — [`06-workspace-lifecycle.md`](06-workspace-lifecycle.md) owns the
  ownership split), and the harness-handle-per-session rule.
```

After:

```markdown
- **Context assembly** — the downward-from-the-root model (every session starts at the workspace
  root, takes its scope from its identity, and reads each `AGENTS.md` from the root down to where it
  works, in a layout whose paths carry each level's guidance; an anchor's `AGENTS.md` is its
  repository's; a harness-specific filename served by an adapter onto `AGENTS.md`, never a copy),
  the deterministic/append-oriented bias for cache sharing, the **two-zone model** (stable prefix +
  mutable tail, graduation, adoption boundaries) **and its ordering, which serves authorship as well
  as volatility** (Ward's part first, the human's after —
  [`06-workspace-lifecycle.md`](06-workspace-lifecycle.md) owns the ownership split), and the
  harness-handle-per-session rule.
```

**Edit 16** —
[`intent/01-concepts/05-context-loading.md`](../../intent/01-concepts/05-context-loading.md)

Before:

```markdown
- The precise `AGENTS.md` field conventions and how skills are referenced/resolved; the **exact
  ordering algorithm** within each zone and which document types classify into prefix vs. tail; the
```

After:

```markdown
- The precise `AGENTS.md` field conventions and how skills are referenced/resolved; the on-disk
  layout that puts each level's working places beneath it, and how the downward reading is offered
  to an agent (a harness's native nested loading, a verb that names the chain); the **exact ordering
  algorithm** within each zone and which document types classify into prefix vs. tail; the
```

**Edit 17** —
[`intent/04-walkthrough-delivering-work.md`](../../intent/04-walkthrough-delivering-work.md)

Before:

```markdown
The session runs in the worktree's own working directory, loading _that_ directory's `AGENTS.md`
context and skills (`01-concepts/05-context-loading.md`) rather than the workspace's — its whole
context spent on the code. It writes the output mode, adds tests, and may produce **artifacts** (a
decision note, a sample of the new output) that persist beyond it, each with provenance
(`01-concepts/00-domain-model.md`, artifacts).
```

After:

```markdown
The session starts at the workspace root, like every session, and works in the worktree: before it
touches the code it reads each `AGENTS.md` on the path down — the workspace's, its project's, the
repository's own — and loads the worktree's skills (`01-concepts/05-context-loading.md`), its
context spent on the code rather than on the rest of the workspace. It writes the output mode, adds
tests, and may produce **artifacts** (a decision note, a sample of the new output) that persist
beyond it, each with provenance (`01-concepts/00-domain-model.md`, artifacts).
```
