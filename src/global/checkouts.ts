// Where an external canonical checkout stands on THIS machine
// (design/0065-external-checkouts-and-repo-commands/). A repository record
// can say its checkout is external — a fact that travels with the workspace —
// but the path is a fact about one machine's filesystem, so it lives here, in
// the machine's own state beside the workspace registry, keyed by the
// workspace's immutable id (design/0054-workspace-id/) and the repository's
// name.
//
// It sits outside every workspace for a second reason, which is the trust
// model: Ward runs git inside the directory a binding names, and a directory
// can configure git to execute things. A binding a `git pull` of the
// workspace could rewrite would be a pull choosing where Ward runs git. Here
// only a verb run on this machine writes one.
//
// Losing this file loses no work (the global-state boundary,
// intent/01-concepts/06-workspace-lifecycle.md): the record still says the
// checkout is external, every verb that needs it refuses naming the one
// command that binds it again, and the checkout itself was never Ward's.
import { z } from 'zod';
import { type DocumentType, readDocumentSync } from '../store/document.ts';
import { stateDir } from './paths.ts';
import { readGlobal, withGlobalLock, writeGlobal } from './store.ts';

export const checkoutBindingsSchema = z.object({
  type: z.literal('ward-checkouts'),
  bindings: z.array(
    z.object({
      /** The workspace's immutable id — a moved workspace keeps its bindings. */
      workspace: z.string().min(1),
      repo: z.string().min(1),
      /** Absolute path of the checkout's top level on this machine. */
      path: z.string().min(1),
      boundAt: z.string().min(1),
    }),
  ),
});
export type CheckoutBindings = z.infer<typeof checkoutBindingsSchema>;

export const checkoutBindingsType: DocumentType<CheckoutBindings> = {
  name: 'ward-checkouts',
  relPath: 'checkouts.md',
  schema: checkoutBindingsSchema,
};

const BODY =
  'Where the external canonical checkouts of Ward workspaces stand on this machine, one ' +
  'binding per workspace and repository. Written by `ward repo add PATH --external`; safe to ' +
  'delete — each repository then asks to be bound again.\n';

/**
 * The bound path, or undefined — never throws. Blocking, because the question
 * "where is this repository's checkout" is asked from synchronous code. An
 * absent or unreadable file reads as no binding: the caller's refusal names
 * the command that writes one, which is also what repairs a broken file.
 */
export function readBindingSync(
  workspace: string,
  repo: string,
  dir: string = stateDir(),
): string | undefined {
  try {
    const { bindings } = readDocumentSync(dir, checkoutBindingsType).data;
    return bindings.find((entry) => entry.workspace === workspace && entry.repo === repo)?.path;
  } catch {
    return undefined;
  }
}

/** Bind (or rebind) one repository; true when the binding changed. */
export async function bindCheckout(
  workspace: string,
  repo: string,
  path: string,
  dir: string = stateDir(),
): Promise<boolean> {
  return rewrite(dir, `bind ${repo}`, (bindings) => {
    const others = bindings.filter(
      (entry) => !(entry.workspace === workspace && entry.repo === repo),
    );
    if (others.length !== bindings.length && readBindingSync(workspace, repo, dir) === path) {
      return undefined;
    }
    return [...others, { workspace, repo, path, boundAt: new Date().toISOString() }];
  });
}

/** Drop one repository's binding; true when there was one. */
export async function unbindCheckout(
  workspace: string,
  repo: string,
  dir: string = stateDir(),
): Promise<boolean> {
  return rewrite(dir, `unbind ${repo}`, (bindings) => {
    const others = bindings.filter(
      (entry) => !(entry.workspace === workspace && entry.repo === repo),
    );
    return others.length === bindings.length ? undefined : others;
  });
}

type Bindings = CheckoutBindings['bindings'];

/** One read-modify-write under the global lock; `change` returns undefined to leave it be. */
async function rewrite(
  dir: string,
  verb: string,
  change: (bindings: Bindings) => Bindings | undefined,
): Promise<boolean> {
  return withGlobalLock(dir, 'checkout bindings', verb, async () => {
    const read = await readGlobal(dir, checkoutBindingsType);
    // An unreadable file is replaced rather than refused: every binding in it
    // is re-creatable by the verb running now, and nothing else is lost.
    const current = read.state === 'read' ? read.document.data.bindings : [];
    const next = change(current);
    if (next === undefined) return false;
    await writeGlobal(dir, checkoutBindingsType, {
      data: { type: 'ward-checkouts', bindings: next },
      body: BODY,
    });
    return true;
  });
}
