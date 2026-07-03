// Room lifecycle (domain-model). A room is the innermost scope, on a worktree,
// where deep work happens. It is a REUSABLE resource that hosts sessions, not a
// session itself: opening a room MINTS its first session (a room is never empty),
// and the room is FREED when its last session closes — its code then reusable.
//
// Occupancy is DERIVED from the room's sessions (SF-001), never stored: a room is
// occupied iff it has ≥1 non-closed session.

import { readdir } from 'node:fs/promises';
import { glyphFor } from '../seams/theming.ts';
import { readAs, writeDocument } from '../store/doc.ts';
import { nextRoomCode } from '../store/ids.ts';
import { appendEvent, type Clock, systemClock } from '../store/log.ts';
import {
  logDir,
  roomDir,
  roomDoc,
  roomsDir,
  taskDir,
  worktreeCheckout,
  worktreeDoc,
} from '../store/paths.ts';
import {
  type PersonaRef,
  type Room,
  roomSchema,
  type Session,
  type WorktreeRef,
  worktreeSchema,
} from '../store/schemas.ts';
import { listProjects, resolveProjectDir } from '../store/workspace.ts';
import { defaultPersonaForRole } from './personas.ts';
import { closeSession, listSessions, openSession } from './session.ts';
import { listTasks } from './task.ts';

export interface OpenRoomOptions {
  floor: number;
  taskSlug: string;
  worktree: WorktreeRef;
  persona?: PersonaRef;
  now?: Clock;
}

/** Open a room on a worktree, minting its first session (a room is never empty). */
export async function openRoom(
  root: string,
  opts: OpenRoomOptions,
): Promise<{ room: Room; session: Session }> {
  const now = opts.now ?? systemClock;
  const projectDirPath = await resolveProjectDir(root, opts.floor);
  const taskDirPath = taskDir(projectDirPath, opts.taskSlug);
  const worktree = (
    await readAs(worktreeDoc(taskDirPath, opts.worktree.repo, opts.worktree.branch), worktreeSchema)
  ).doc;

  const code = nextRoomCode(opts.floor, await occupiedRoomCodes(root, opts.floor));
  const room: Room = {
    type: 'room',
    code,
    floor: opts.floor,
    taskSlug: opts.taskSlug,
    worktree: opts.worktree,
    accent: worktree.accent, // a room inherits its worktree's accent
    glyph: glyphFor('room'),
  };
  // Write the room record first so its scope resolves when the minted session logs.
  await writeDocument(roomDoc(roomDir(taskDirPath, code)), room);
  await appendEvent(
    logDir(roomDir(taskDirPath, code)),
    { kind: 'room-opened', data: { code } },
    now,
  );

  const persona = opts.persona ?? toRef(defaultPersonaForRole('medical-student'));
  const session = await openSession(root, {
    scope: { kind: 'room', ref: code },
    persona,
    workingDir: worktreeCheckout(root, opts.worktree.repo, opts.worktree.branch),
    now,
  });
  return { room, session };
}

/** Sessions of a room (by its scope address). */
export async function roomSessions(root: string, code: string): Promise<Session[]> {
  return (await listSessions(root)).filter((s) => s.scope.kind === 'room' && s.scope.ref === code);
}

/** Derived occupancy: a room is occupied iff it has ≥1 non-closed session. */
export async function isRoomOccupied(root: string, code: string): Promise<boolean> {
  return (await roomSessions(root, code)).some((s) => s.state !== 'closed');
}

/** Close a room: close its open sessions; the room frees (derived), its code reusable. */
export async function closeRoom(
  root: string,
  code: string,
  opts: { now?: Clock } = {},
): Promise<void> {
  for (const session of await roomSessions(root, code)) {
    if (session.state !== 'closed') {
      await closeSession(root, session.id, opts);
    }
  }
}

export async function listRooms(root: string, floor: number): Promise<Room[]> {
  const projectDirPath = await resolveProjectDir(root, floor);
  const rooms: Room[] = [];
  for (const task of await listTasks(root, floor)) {
    const dir = roomsDir(taskDir(projectDirPath, task.slug));
    const codes = await readdir(dir).catch(() => [] as string[]);
    for (const code of codes) {
      rooms.push(
        (await readAs(roomDoc(roomDir(taskDir(projectDirPath, task.slug), code)), roomSchema)).doc,
      );
    }
  }
  return rooms;
}

/** Codes of rooms currently OCCUPIED on a floor — the reuse-aware allocation set. */
async function occupiedRoomCodes(root: string, floor: number): Promise<string[]> {
  const occupied: string[] = [];
  for (const room of await listRooms(root, floor)) {
    if (await isRoomOccupied(root, room.code)) {
      occupied.push(room.code);
    }
  }
  return occupied;
}

// Every room across the workspace — used by recovery / status views.
export async function listAllRooms(root: string): Promise<Room[]> {
  const rooms: Room[] = [];
  for (const project of await listProjects(root)) {
    rooms.push(...(await listRooms(root, project.floor)));
  }
  return rooms;
}

function toRef(persona: { name: string; role: PersonaRef['role'] }): PersonaRef {
  return { name: persona.name, role: persona.role };
}
