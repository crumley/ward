# 0043 — Build log

Only what the commits cannot carry: what building forced or revealed, and the commands that prove
it.

## Asking for the checks can cost you the review

The check verdict was designed to ride the probe's existing `gh pr view` call — one more field in
the JSON list, no extra round trip, the same bargain `mergeCommit` and `baseRefName` already struck.
The suite agreed, because the fake forge answers whatever field list it is handed. The first read
against a real forge did not:

```console
$ gh pr view https://github.com/crumley/dayone/pull/63 \
    --json state,reviewDecision,mergeCommit,baseRefName,statusCheckRollup
GraphQL: Resource not accessible by personal access token
  (repository.pullRequest.statusCheckRollup.nodes.0.commit.statusCheckRollup)

$ gh pr view https://github.com/crumley/dayone/pull/63 \
    --json state,reviewDecision,mergeCommit,baseRefName
{"baseRefName":"main","mergeCommit":null,"reviewDecision":"","state":"OPEN"}
```

A fine-grained personal access token can be permitted to read a pull request and not the commit
statuses behind it, and GraphQL fails the **whole** query rather than omitting the one field it
cannot serve. So the free field is not free: bundled unconditionally it takes away the state and
review the probe already returned, on every PR, for anyone whose token is scoped that way — and it
takes them away silently, as `live: false`, which reads exactly like being offline.

The same run showed the failure is per **repository**, not per machine: with the fallback in place,
one workspace's PRs came back `checks: passing` and another's `checks: unknown`, from the same token
in the same invocation. A build that had only ever been smoke-tested against the permissive
repository would have shipped looking correct.

What this forced: the rollup is asked for in the same call, and a failed call is retried **once**
for the field set that was always asked for, within what remains of the same absolute deadline. The
healthy path still makes one call; the degraded path spends a second spawn only where the first
returned nothing anyway. `test/forge/gh.test.ts` grew a fake token that refuses `statusCheckRollup`
and asserts both the answer and the two field lists that produced it, so the fallback cannot be
optimized back out without a red test.

The general lesson, worth more than the fix: a field that is free to _ask for_ is not free to
**require**. Any future addition to the probe's field list has to say what happens to the fields
beside it when the forge refuses the new one.
