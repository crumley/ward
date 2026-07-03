// Seam: inter-scope messaging & coordination (02-messaging-coordination).
// Realizes dispatch (down) / report (up) / wake (notify). The defining
// discipline is RECORDED-FIRST (§16): every send and every wake condition is
// written to the store, so a not-running target is served entirely from the
// record and a wake survives a reboot. Idempotent where it touches lifecycle: a
// condition already satisfied fires once. The whole flow is inspectable
// (listMessages / listWakes) by human and agent alike.

import { readdir } from 'node:fs/promises';
import { readAs, writeDocument } from '../store/doc.ts';
import { messagesDir, wakeDoc, wakesDir } from '../store/paths.ts';
import { type Message, messageSchema, type Wake, wakeSchema } from '../store/schemas.ts';

export interface SendInput {
  from: string;
  to: string;
  body: string;
  /** A brief artifact name carried with a dispatch (domain-model, briefs). */
  brief?: string;
  /** Set when the sender did not know the target and routed via a status persona. */
  routedVia?: 'charge-nurse' | 'house-supervisor';
}

/** Dispatch work/context downward to a target identity, recorded first. */
export async function dispatch(root: string, input: SendInput): Promise<Message> {
  return writeMessage(root, 'dispatch', input);
}

/** Report status upward to a containing scope, recorded first. */
export async function report(root: string, input: SendInput): Promise<Message> {
  return writeMessage(root, 'report', input);
}

export async function listMessages(root: string): Promise<Message[]> {
  const files = await readdir(messagesDir(root)).catch(() => [] as string[]);
  const messages: Message[] = [];
  for (const file of files.filter((n) => n.endsWith('.md'))) {
    messages.push((await readAs(`${messagesDir(root)}/${file}`, messageSchema)).doc);
  }
  return messages.sort((a, b) => a.id.localeCompare(b.id));
}

export interface WakeConditionInput {
  kind: Wake['condition']['kind'];
  target: string;
}

/** Arm a wake against a target identity — recorded so it survives pause/resume/reboot. */
export async function armWake(
  root: string,
  waiter: string,
  condition: WakeConditionInput,
): Promise<Wake> {
  const seq = await nextSeq(wakesDir(root));
  const wake: Wake = {
    type: 'wake',
    id: `wake-${seq}`,
    waiter,
    condition: { kind: condition.kind, target: condition.target },
    state: 'armed',
  };
  await writeDocument(wakeDoc(root, wake.id), wake);
  return wake;
}

export async function listWakes(root: string): Promise<Wake[]> {
  const files = await readdir(wakesDir(root)).catch(() => [] as string[]);
  const wakes: Wake[] = [];
  for (const file of files.filter((n) => n.endsWith('.md'))) {
    wakes.push((await readAs(wakeDoc(root, file.replace(/\.md$/, '')), wakeSchema)).doc);
  }
  return wakes.sort((a, b) => a.id.localeCompare(b.id));
}

/** Satisfy a wake. Idempotent — an already-satisfied condition fires once and resolves. */
export async function satisfyWake(root: string, id: string): Promise<Wake> {
  const wake = (await readAs(wakeDoc(root, id), wakeSchema)).doc;
  if (wake.state === 'satisfied') {
    return wake;
  }
  const satisfied: Wake = { ...wake, state: 'satisfied' };
  await writeDocument(wakeDoc(root, id), satisfied);
  return satisfied;
}

async function writeMessage(
  root: string,
  kind: Message['kind'],
  input: SendInput,
): Promise<Message> {
  const seq = await nextSeq(messagesDir(root));
  const message: Message = {
    type: 'message',
    id: `${kind}-${seq}`,
    kind,
    from: input.from,
    to: input.to,
    body: input.body,
    ...(input.brief === undefined ? {} : { brief: input.brief }),
    ...(input.routedVia === undefined ? {} : { routedVia: input.routedVia }),
  };
  await writeDocument(`${messagesDir(root)}/${String(seq).padStart(4, '0')}-${kind}.md`, message);
  return message;
}

// Matches the first digit run in a filename — messages are `0000-dispatch.md`,
// wakes are `wake-0.md`; both yield their sequence number.
const SEQ_IN_NAME = /(\d+)/;

async function nextSeq(dir: string): Promise<number> {
  const entries = await readdir(dir).catch(() => [] as string[]);
  let max = -1;
  for (const name of entries) {
    const m = SEQ_IN_NAME.exec(name);
    if (m && m[1] !== undefined) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return max + 1;
}
