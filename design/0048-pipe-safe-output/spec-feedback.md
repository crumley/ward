# 0048 — Spec-feedback

> Intent frictions found while making output larger than a pipe's buffer arrive whole.

None this entry. Intent already requires deterministic, parseable output for the agent audience (§8)
and forbids handing a caller a wrong answer (§20). The truncation broke those requirements in the
runtime without any of them being unclear, and this entry restores them without changing one.
