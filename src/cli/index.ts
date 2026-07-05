#!/usr/bin/env bun
// ward — the Ward CLI. Foundation only: parse args (optique) and print the
// version (from package.json, the single source of truth), colored by
// picocolors. See design/0001-dev-foundation/.
import { object } from '@optique/core/constructs';
import { message } from '@optique/core/message';
import { option } from '@optique/core/primitives';
import { run } from '@optique/run';
import pc from 'picocolors';
import pkg from '../../package.json' with { type: 'json' };

const cli = object({
  version: option('-v', '--version', {
    description: message`Print the ward version.`,
  }),
});

const result = run(cli, { programName: 'ward', help: 'option' });

const versionLine = `${pc.bold('ward')} ${pc.cyan(pkg.version)}`;
if (result.version) {
  console.log(versionLine);
} else {
  // Bare `ward`: version plus a one-line pointer at help.
  console.log(`${versionLine} — ${pkg.description}`);
  console.log(pc.dim('run `ward --help` for usage'));
}
