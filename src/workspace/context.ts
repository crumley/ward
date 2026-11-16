// `ward context PATH` (design/0057-context-from-root/): the chain the root
// manifest's reading rule walks — every `AGENTS.md` on the path from the
// workspace root down to PATH, root first and nearest last
// (intent/01-concepts/05-context-loading.md, Context loads downward from the
// workspace root). A walk over path segments plus one `lstat`/`readlink` per
// hop: it reads nothing but the filesystem, takes no lock, and writes
// nothing, so the CLI only prints what this returns.
import { existsSync, lstatSync, readlinkSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { WardError } from '../errors.ts';
import { type ClaudeGuidance, inspectClaudeGuidance } from './layout.ts';
import { openWorktreeClaims, standsOutside, worktreePlacement } from './worktrees.ts';

/** One level of the chain: a directory that carries an `AGENTS.md`. */
export interface ContextLevel {
  /** The directory, workspace-relative (`.` for the root). */
  readonly dir: string;
  /** The `AGENTS.md`, workspace-relative. */
  readonly agents: string;
  /** The link's text, exactly when the `AGENTS.md` is a symlink (a floor view's is). */
  readonly link?: string;
  /** Whether the file can be read — a dangling link cannot. */
  readonly resolves: boolean;
  /** What serves Claude Code's filename beside it (design/0017-claude-md-symlink/). */
  readonly claude: ClaudeGuidance;
}

export interface ContextChain {
  readonly root: string;
  /** The target, workspace-relative (`.` for the root). */
  readonly path: string;
  readonly chain: readonly ContextLevel[];
}

/**
 * The directories from the root down to `target`, root first: `target`
 * itself when it is a directory, else the directory that holds it. Pure over
 * the two paths once the target's kind is known.
 */
export function pathLevels(root: string, targetDir: string): string[] {
  const rel = relative(root, targetDir);
  const segments = rel === '' ? [] : rel.split(sep);
  const levels = [root];
  for (const segment of segments) levels.push(join(levels.at(-1) ?? root, segment));
  return levels;
}

/**
 * The chain for `target` inside the workspace at `root`. A target outside the
 * workspace is refused: the chain starts at the root, and a path the root does
 * not lead to has no chain to name. The target need not exist yet — the rule
 * is read before work begins, and a file about to be written is the commonest
 * case — so a missing target is walked as far as its directories go.
 */
export function contextChain(root: string, target: string): ContextChain {
  const absolute = resolve(target);
  const rel = relative(root, absolute);
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new WardError(
      `${target} is outside the workspace at ${root} — the chain starts at the workspace root, ` +
        'so name a path inside it',
    );
  }
  const isDir = existsSync(absolute) && statSync(absolute).isDirectory();
  const targetDir = isDir ? absolute : dirname(absolute);
  const chain: ContextLevel[] = [];
  for (const dir of pathLevels(root, targetDir)) {
    const level = levelAt(root, dir);
    if (level !== undefined) chain.push(level);
  }
  return { root, path: rel === '' ? '.' : rel, chain };
}

/**
 * The path to walk for `target`: itself, unless it lies inside a worktree
 * that a repository's own command made outside the workspace
 * (design/0065-external-checkouts-and-repo-commands/). Such a worktree is not
 * below the root, but its placement under its floor's view links onto it, so
 * the target is re-spelled through that link — and the chain then passes the
 * floor's manifest exactly as it does for a worktree that stands under it.
 */
export async function contextTarget(root: string, target: string): Promise<string> {
  const absolute = resolve(target);
  const rel = relative(root, absolute);
  if (!rel.startsWith('..') && !isAbsolute(rel)) return absolute;
  const spellings = [absolute, ...(existsSync(absolute) ? [realpathSync(absolute)] : [])];
  for (const claim of await openWorktreeClaims(root)) {
    if (!standsOutside(claim.record)) continue;
    for (const spelling of spellings) {
      const inside = relative(claim.record.path, spelling);
      if (inside.startsWith('..') || isAbsolute(inside)) continue;
      return join(root, worktreePlacement(claim.task, claim.record.branch), inside);
    }
  }
  return absolute;
}

function levelAt(root: string, dir: string): ContextLevel | undefined {
  const file = join(dir, 'AGENTS.md');
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(file);
  } catch {
    return undefined;
  }
  const relDir = relative(root, dir) || '.';
  const agents = relDir === '.' ? 'AGENTS.md' : `${relDir}/AGENTS.md`;
  return {
    dir: relDir,
    agents,
    ...(stat.isSymbolicLink() ? { link: readlinkSync(file) } : {}),
    resolves: existsSync(file),
    claude: inspectClaudeGuidance(dir),
  };
}
