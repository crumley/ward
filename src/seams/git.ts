// Seam: git integration (ADR 0006). Ward orchestrates git; it does not become
// git. A thin async wrapper over the system binary is the single place git is
// invoked, so behavior matches the user's own git exactly (worktrees, hooks,
// credentials) and the whole surface is mockable behind this interface.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export interface Git {
  init(dir: string): Promise<void>;
  addWorktree(repoDir: string, checkoutDir: string, branch: string): Promise<void>;
  removeWorktree(repoDir: string, checkoutDir: string): Promise<void>;
  currentBranch(dir: string): Promise<string>;
}

export const systemGit: Git = {
  async init(dir) {
    await run('git', ['init', '-q', '-b', 'main', dir]);
  },
  async addWorktree(repoDir, checkoutDir, branch) {
    await run('git', ['-C', repoDir, 'worktree', 'add', '-b', branch, checkoutDir]);
  },
  async removeWorktree(repoDir, checkoutDir) {
    await run('git', ['-C', repoDir, 'worktree', 'remove', '--force', checkoutDir]);
  },
  async currentBranch(dir) {
    const { stdout } = await run('git', ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD']);
    return stdout.trim();
  },
};
