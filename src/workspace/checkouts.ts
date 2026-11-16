// Where a registered repository's canonical checkout stands
// (design/0065-external-checkouts-and-repo-commands/). One question with two
// answers: the contained checkout at `repos/<name>/`, which Ward clones and
// owns, or an external one — a checkout that already stood elsewhere on this
// machine, which Ward reads and refreshes and never clones, moves, or deletes.
// The record says which (`checkout: external`); the machine's own state says
// where (src/global/checkouts.ts). Every caller asks here, so none of them
// spells `repos/<name>` for itself.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { WardError } from '../errors.ts';
import { readBindingSync } from '../global/checkouts.ts';
import { readDocumentSync } from '../store/document.ts';
import { repositoryRecordType, workspaceRecordType } from '../store/types.ts';

export interface Checkout {
  readonly name: string;
  /** The workspace does not contain it, and Ward does not own it. */
  readonly external: boolean;
  /** Absolute. Absent exactly when it is external and this machine binds no path for it. */
  readonly path?: string;
}

/**
 * The checkout as this machine knows it — never throws. A record that is
 * missing or will not parse reads as contained: that is what every record
 * meant before this entry, and naming a broken record is doctor's finding.
 */
export function resolveCheckout(root: string, name: string): Checkout {
  const contained: Checkout = { name, external: false, path: join(root, 'repos', name) };
  const type = repositoryRecordType(name);
  if (!existsSync(join(root, type.relPath))) return contained;
  try {
    if (readDocumentSync(root, type).data.checkout !== 'external') return contained;
    const { id } = readDocumentSync(root, workspaceRecordType).data;
    const path = id === undefined ? undefined : readBindingSync(id, name);
    return { name, external: true, ...(path === undefined ? {} : { path }) };
  } catch {
    return contained;
  }
}

/**
 * The checkout's absolute path. An external checkout this machine has not
 * bound is refused, naming the command that binds it — the legible answer on
 * a machine the workspace was pulled onto.
 */
export function checkoutPath(root: string, name: string): string {
  const checkout = resolveCheckout(root, name);
  if (checkout.path === undefined) throw new WardError(unboundMessage(name));
  return checkout.path;
}

export function unboundMessage(name: string): string {
  return (
    `repository '${name}' keeps its canonical checkout outside the workspace, and this machine ` +
    `has not said where — bind it: ward repo add PATH --external --name ${name}`
  );
}

/**
 * How a message names the checkout: `repos/<name>` for a contained one, the
 * absolute path for an external one — the spelling a human can act on.
 */
export function checkoutLabel(root: string, name: string): string {
  const checkout = resolveCheckout(root, name);
  if (!checkout.external) return `repos/${name}`;
  return checkout.path ?? `the external checkout of '${name}' (not bound on this machine)`;
}
