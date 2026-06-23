// Two-audience rendering (§8): one in-memory result renders to themed human text by default, or to
// deterministic JSON for an agent (or --json). All CLI output goes through here.

import type { Caller } from "./context.ts";

export function emit(caller: Caller, human: string, data: unknown): void {
  if (caller.json) process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  else process.stdout.write(human + "\n");
}

export function fail(caller: Caller, message: string, extra: Record<string, unknown> = {}): never {
  if (caller.json) {
    process.stderr.write(JSON.stringify({ ok: false, error: message, ...extra }, null, 2) + "\n");
  } else {
    process.stderr.write(`error: ${message}\n`);
  }
  process.exit(1);
}
