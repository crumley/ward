// Agent-harness seam: a thin adapter exposing a small fixed surface — start / handle / resume /
// locate — over a runtime. v1 ships a STUB runtime that records a real, resolvable harness handle
// (harness type + native run id) and a native history file, so resume and reflection can locate the
// underlying run exactly as a real harness would. Swapping in a concrete harness (e.g. Claude Code)
// re-points this one file. See intent/02-subsystems/03-agent-harness.md, build/v1-scope.md.

import { join } from "node:path";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { wardDir } from "../store/paths.ts";

// The handle is "<harness>:<nativeRunId>" — a recorded ATTRIBUTE, not an identity.
export type HarnessHandle = string;

export type StartArgs = {
  root: string;
  scope: string;
  persona?: string;
  model?: string;
  cwd: string;
};

export type LiveRef = { handle: HarnessHandle; running: boolean };

function harnessDir(root: string): string {
  return join(wardDir(root), "harness");
}

// Each harness stores its own history in its own format/location. For the stub, that's a log file
// keyed by native run id; `locate` maps a handle back to it (the only reliable way to find the run).
export function locate(root: string, handle: HarnessHandle): string {
  const runId = handle.split(":").slice(1).join(":");
  return join(harnessDir(root), `${runId}.log`);
}

let counter = 0;
function nativeRunId(): string {
  counter += 1;
  return `${process.hrtime.bigint().toString(36)}${counter.toString(36)}`;
}

export async function start(args: StartArgs): Promise<LiveRef> {
  await mkdir(harnessDir(args.root), { recursive: true });
  const handle: HarnessHandle = `stub:${nativeRunId()}`;
  await appendFile(
    locate(args.root, handle),
    `start scope=${args.scope} persona=${args.persona ?? ""} model=${args.model ?? ""} cwd=${args.cwd}\n`,
    "utf8",
  );
  return { handle, running: true };
}

// Resume re-attaches to the recorded run. Idempotent: resuming an already-resumed run just appends
// another marker and returns a live ref; it never creates a second, conflicting run.
export async function resume(root: string, handle: HarnessHandle): Promise<LiveRef> {
  const hist = locate(root, handle);
  if (!existsSync(hist)) {
    throw new Error(`harness run not locatable from handle: ${handle}`);
  }
  await appendFile(hist, `resume\n`, "utf8");
  return { handle, running: true };
}

// For reflection: read the native history located from the handle.
export async function history(root: string, handle: HarnessHandle): Promise<string> {
  const hist = locate(root, handle);
  if (!existsSync(hist)) return "";
  return readFile(hist, "utf8");
}
