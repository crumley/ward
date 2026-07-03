// Two-audience output (§8). The human is the default audience — readable text;
// an agent asks for `--json` and gets deterministic, parseable data. Every
// command renders both from the same result, so neither audience has to guess.

export interface RenderOptions {
  json?: boolean;
}

export function emit(opts: RenderOptions, human: string, data: unknown): void {
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    process.stdout.write(`${human}\n`);
  }
}

export function fail(message: string): void {
  process.stderr.write(`ward: ${message}\n`);
  process.exitCode = 1;
}

/** A compact, aligned two-column list for human output. */
export function table(rows: readonly (readonly [string, string])[]): string {
  if (rows.length === 0) {
    return '(none)';
  }
  const width = Math.max(...rows.map(([left]) => left.length));
  return rows.map(([left, right]) => `  ${left.padEnd(width)}  ${right}`).join('\n');
}
