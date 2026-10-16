# 0052 — Build log

## 2026-10-16 — the link, on every open path

**Forced or revealed.**

- **A new window drops the link unless the launcher carries it.** A multiplexer starts each window
  from its own environment, not the caller's. So a coordinating session that starts a child in a new
  window, without passing `WARD_AGENT`, opens a child with no parent. Nothing fails, and the child
  just reads as human-started. The code cannot detect this from inside the child, so it went into
  the manifest's agent section, which is where an agent learns to declare itself. The manifest
  changed, so the lineage moved with it: the 0049 hash went to history and the 0052 default is
  pinned.
- **Matching handles mean the same run.** Since 0045, a task session recorded from inside a Claude
  Code run takes that run's handle without being asked. If the declaring session was launched under
  the same run, the two handles match, and the declared session is the same agent rather than a
  parent. That turned "link whatever is declared" into the one-exception rule in `parentOf`.
- **The test env already isolates the declaration.** `runWardEnv` clears the inherited `WARD_AGENT`
  before applying a row's env, so each case controls the parent exactly. `runWard` passes the
  inherited value through, which is why the gate runs under `env -u WARD_AGENT`. If the value leaks
  in, it names no session in a fresh test workspace and records nothing, which is the rule working
  as designed rather than a false red.

**Proof.**

```sh
env -u WARD_AGENT bun test test/cli/session-parent.test.ts test/workspace/lineage.test.ts
env -u WARD_AGENT mise run check
```

**Next.** The reverse read (a session's children) and parent-aware grouping in floor hosts can both
read this field; neither needs anything more written.
