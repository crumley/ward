// Dynamic completion suggestions (design/0022-shell-completion/): the value
// parsers that let the shell autocomplete "partially-typed nouns, verbs, and
// identities" (intent/02-subsystems/07-human-shell.md — interactive
// resolution). Optique's completion machinery asks a value parser for
// candidates through `suggest(prefix)`; these parsers answer from the SAME
// workspace modules the verbs themselves call, so a suggested code is a code
// a verb will accept — a parallel reader could drift, and a completion menu
// that offers what the verb then refuses is worse than no menu at all.
//
// Three contracts every suggester here honors, because a completion callback
// runs inside the human's shell on every TAB:
//   1. **Never throw.** An exception escaping here would surface as shell
//      noise mid-keystroke; every generator body is wrapped, and a failure
//      degrades to "no suggestions" (§20 — degrade to a named lesser answer).
//   2. **Only what starts with the prefix.** Optique passes the word being
//      completed and expects the filtering done here.
//   3. **Outside a workspace, nothing.** There is no record to read, and
//      guessing would be the fabrication §17 forbids.
//
// These are `async` value parsers: the record lives in markdown documents
// read asynchronously, and optique's async mode is exactly the seam for
// suggestions that need I/O. Their mode propagates through the parser tree,
// which is why `src/cli/index.ts` awaits `run()`.
import { message, text } from '@optique/core/message';
import type { NonEmptyString } from '@optique/core/nonempty';
import type { Suggestion } from '@optique/core/parser';
import { string, type ValueParser } from '@optique/core/valueparser';
import { git } from '../workspace/git.ts';
import { discoverWorkspace } from '../workspace/layout.ts';
import { listRepositories } from '../workspace/repos.ts';
import { readTasks } from '../workspace/scan.ts';
import { readOpenSessions } from '../workspace/sessions.ts';
import { resolveWorkspaceMainLine } from '../workspace/steward.ts';
import { jsonVerbShapes } from './schema.ts';

/** One completion candidate: the word the shell inserts, plus the cue beside it. */
interface Candidate {
  readonly text: string;
  /** Shown by the shell next to the candidate — fish and zsh render it inline. */
  readonly description?: string;
}

type Candidates = (root: string | null) => readonly Candidate[] | Promise<readonly Candidate[]>;

/**
 * A `string()` argument that suggests. The wrapper is deliberately thin:
 * parsing, formatting, and the metavar stay optique's (a suggester must never
 * change what a verb ACCEPTS — it only changes what the shell offers), and
 * only `suggest` is added, under the three contracts above.
 */
function suggesting(metavar: NonEmptyString, candidates: Candidates): ValueParser<'async', string> {
  const base = string({ metavar });
  return {
    ...base,
    mode: 'async',
    parse: (input) => Promise.resolve(base.parse(input)),
    async *suggest(prefix: string): AsyncIterable<Suggestion> {
      let found: readonly Candidate[];
      try {
        found = await candidates(discoverWorkspace(process.cwd()));
      } catch {
        return; // contract 1: a throwing suggester would break the caller's shell
      }
      for (const candidate of found) {
        if (!candidate.text.startsWith(prefix)) continue; // contract 2
        yield {
          kind: 'literal',
          text: candidate.text,
          // text(), not a bare interpolation: optique quotes interpolated
          // values, and a description is a cue, not a value to be typed.
          ...(candidate.description === undefined
            ? {}
            : { description: message`${text(candidate.description)}` }),
        };
      }
    },
  };
}

/** Contract 3, in one place: outside a workspace there is nothing to read. */
function inWorkspace(
  read: (root: string) => Promise<readonly Candidate[]> | readonly Candidate[],
): Candidates {
  return (root) => (root === null ? [] : read(root));
}

/**
 * Task codes — the identity a task-addressed verb takes (`task pause CODE`,
 * `worktree rebase TASK`, `session open TASK`, `workspace upgrade TASK`).
 * Only NON-CLOSED tasks are offered: codes are unique among open tasks and
 * reused after close (intent/01-concepts/00-domain-model.md, Identity), so a
 * closed task's code either addresses nothing or addresses somebody else's
 * task — the one case where completing a real-looking code would mislead.
 * The slug rides along as the description: the human recognizes `t6` by what
 * it is for, which is the whole point of the cue (§8, human audience).
 */
export function taskCode(metavar: 'CODE' | 'TASK'): ValueParser<'async', string> {
  return suggesting(
    metavar,
    inWorkspace(async (root) =>
      (await readTasks(root))
        .filter((task) => task.record.state !== 'closed')
        .map((task) => ({ text: task.record.code, description: task.record.slug })),
    ),
  );
}

/** Registered repository names — `--repo NAME` and `repo refresh NAME`, with the main line as cue. */
export function repoName(): ValueParser<'async', string> {
  return suggesting(
    'NAME',
    inWorkspace(async (root) =>
      (await listRepositories(root)).map((record) => ({
        text: record.name,
        description: record.mainLine,
      })),
    ),
  );
}

/** Open session ids — `session close ID`; closed stays closed, so closed ids are not offered. */
export function sessionId(): ValueParser<'async', string> {
  return suggesting(
    'ID',
    inWorkspace(async (root) =>
      (await readOpenSessions(root)).map((session) => ({
        text: session.record.id,
        description: `task ${session.record.task}`,
      })),
    ),
  );
}

/**
 * Candidate stewardship branches for the gated merge
 * (design/0019-stewardship-worktrees/): local branches of the workspace's own
 * repository that the main line does not already contain — which is exactly
 * the set `workspace merge` can act on (a merged branch converges to
 * `already-merged`). Asked of git in one call against the RESOLVED main line
 * (0020's recorded name where there is one), and any answer git cannot give —
 * detached root, main line absent locally — yields nothing rather than a
 * guess: suggesting a branch the verb would refuse is the lie this avoids.
 */
export function workspaceBranch(): ValueParser<'async', string> {
  return suggesting(
    'BRANCH',
    inWorkspace((root) => {
      const mainLine = resolveWorkspaceMainLine(root);
      const listed = git(
        root,
        'branch',
        '--list',
        '--format=%(refname:short)',
        '--no-merged',
        mainLine,
      );
      if (listed.exitCode !== 0) return [];
      return listed.stdout
        .split('\n')
        .map((line) => line.trim())
        .filter((name) => name !== '' && name !== mainLine)
        .map((name) => ({ text: name }));
    }),
  );
}

/**
 * The verb phrases of `ward schema VERB…` (design/0008-json-shape-home/),
 * completed one word at a time — the registry is the source, so a new
 * `--json` verb becomes completable by its registry row alone.
 *
 * The phrase is multiple arguments (`ward schema task list`), and optique
 * hands a value parser only the prefix — not the words already typed. Those
 * come from the callback's own argv, which carries the whole command line
 * being completed (see `completionWords`): with `task` typed, only `list`
 * is offered, never the first words again. Needs no workspace — the contract
 * is the build's, not the record's.
 */
export function schemaVerb(): ValueParser<'async', string> {
  return suggesting('VERB', () => {
    const words = completionWords();
    const typed = words[0] === 'schema' ? words.slice(1) : [];
    const next = new Set<string>();
    for (const verb of Object.keys(jsonVerbShapes)) {
      const parts = verb.split(' ');
      if (parts.length <= typed.length) continue;
      if (typed.some((word, index) => parts[index] !== word)) continue;
      const word = parts[typed.length];
      if (word !== undefined) next.add(word);
    }
    return [...next].map((word) => ({ text: word }));
  });
}

/**
 * The command-line words a completion callback is completing, minus the word
 * being completed itself. The generated shell script invokes
 * `ward completion <shell> <typed words…> <prefix>` — one process per TAB —
 * so argv IS the line under the cursor. Empty for a normal invocation: the
 * suggesters that consult it are only ever consulted during completion, and
 * an empty answer degrades them to prefix-only, never to a wrong one.
 */
function completionWords(): readonly string[] {
  const argv = process.argv.slice(2);
  if (!isCompletionCallback(argv)) return [];
  return argv.slice(2, -1);
}

/**
 * Whether an argv is a completion CALLBACK — the shell asking for candidates
 * — rather than `ward completion <shell>`, which emits the script. Optique's
 * generated scripts append the typed words and the prefix (the prefix is
 * empty but always present, so a callback always carries at least one word
 * beyond the shell name), and its facade splits the two cases on exactly this
 * boundary. Telemetry leans on it too: a callback fires on every keystroke
 * and is not an invocation anyone asked for (design/0022-shell-completion/).
 */
export function isCompletionCallback(argv: readonly string[]): boolean {
  return argv[0] === 'completion' && argv.length > 2;
}
