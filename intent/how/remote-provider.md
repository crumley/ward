# How-Intent: Remote Work-Item Provider & the Privacy Translation

Durable choices behind the **remote work-item provider** seam (`../what/07-subsystem-seams.md`)
— the shared system where work items and pull requests live — and **how the local↔remote
privacy boundary is enforced** at the crossing. The *what* lives in `../what/05-work-lifecycle.md`
and `../what/01-principles.md` §4. Ward is deliberately opinionated here because the crossing is
where local context could escape.

## Choice: a hosted git forge is the provider, behind a thin adapter

The remote side is a **hosted git forge** (issues + pull requests), integrated behind a **thin
adapter** that links a task to a remote item, carries status both ways, and reports PR state so
Ward can drive a task to completion (`../what/05-work-lifecycle.md`).

**Why a forge.** The work is software headed for shared repositories; the forge is where the
other humans and agents already are. A thin adapter keeps the task model from assuming a specific
forge — it is replaceable by another.

## Choice: the remote link is an attribute, and it can change

A task's remote link is an **attribute, not its identity** (`../what/05-work-lifecycle.md`): a
local-only task can later be **attached** to a remote item, and a remote-started task can be
**merged** with a duplicate local one — identity stays stable across both.

**Why.** Work begins in either world and moves between them; pinning identity to the remote link
would break the moment a task is attached or merged. The link is mutable state about the task, not
the task's name.

## Choice: privacy translation is enforced *upstream* of this seam

The provider only ever receives **already-sanitized** content. The translation from *local view*
to *remote view* happens **before** anything reaches the adapter, and it is a **deliberate
re-authoring, not a copy** (`../what/02-domain-model.md`, `../what/05-work-lifecycle.md`):

- **Direction is strictly outward-guarding.** The local, personal, and internal content listed
  in `../what/01-principles.md` §4 (down to **persona names and roles**) must never appear in a
  remote artifact.
- **Every outward path is a crossing,** not just issue/PR text: a comment posted to a remote
  item, *and* an artifact **committed into a worktree's files** (which reaches the remote when
  the PR merges). Each is re-authored for its destination, exactly as the agent would write any
  code or public comment — never a wholesale copy of the local artifact and its front matter.
- **Sanitization is upstream of the adapter** so the boundary is enforced in **one** place and
  the provider cannot become a leak path. The adapter transmits; it does not get to decide what
  is safe.

**Why upstream and single-point.** A boundary enforced in many places is a boundary that leaks at
the one place someone forgot. Concentrating translation upstream of the seam means every remote
write passes the same gate, and swapping the forge cannot reopen the hole.

## Choice: posting outward is a gated action

Creating or commenting on a remote work item, and merging a PR, are **gated actions**
(`../what/01-principles.md` §18): they require the human or explicitly delegated authority, never
an autonomous agent assumption.

**Why.** These are outward-facing and effectively irreversible (you cannot un-say something on a
shared issue). The gate and the translation are complementary: translation governs *what* crosses,
the gate governs *whether* it crosses now.

## Guardrails — what this is, and what it is not

- **Is:** a thin, replaceable forge adapter that links tasks to remote items and reports PR
  status, fed only sanitized content, with outward posts gated.
- **Is not:** the place where privacy is enforced. Enforcement is **upstream**; the adapter
  assumes its input is already clean and adds no leak surface of its own.
- **Is not:** a two-way merge of context. The boundary guards **outward**; remote status flows in,
  but local context does not flow out except by deliberate translation.
- **Is not:** a commitment to one forge or its API shape. The contract — link, status both ways,
  PR state, sanitized input — is what must hold.

## For the implementation plan — where to fill in the blanks

Within the guardrails: which forge and the exact adapter API; how a task records its remote link
and reconciles attach/merge; **what the translation step concretely strips and rewrites, and where
it runs** (the single upstream gate); how PR status is polled or received; and how gated outward
posts request authority. The translation gate is the highest-stakes blank — design it first.
