// An in-memory session host for the Ward-side suites (design/0031-detached-session-hosting/):
// it holds the windows and groups it is given, answers every read from them,
// and records every request — what was placed, closed, viewed, and entered — so a test can assert what Ward ASKED of a host without a real one.
import type {
  CloseResult,
  FindResult,
  FoundWindow,
  HostCheck,
  InheritedEnv,
  Inventory,
  InventoryGroup,
  LeadResult,
  Placement,
  PlaceRequest,
  Renamed,
  RenameRequest,
  RestampResult,
  SessionHost,
  TypeRequest,
  TypeResult,
  View,
  ViewRequest,
} from '../../src/host/host.ts';

export interface FakeHost extends SessionHost {
  readonly placed: PlaceRequest[];
  readonly closed: string[];
  readonly views: ViewRequest[];
  readonly entered: View[];
  readonly renames: RenameRequest[];
  /** Every restamp asked: the group by name, and the floor it was stamped with. */
  readonly restamps: { group: string; floor: number }[];
  readonly typed: TypeRequest[];
  /** Every `lead` asked: the window, and the group it was moved to the front of. */
  readonly leads: { window: string; group: string }[];
  readonly finds: number;
  /** The tagged windows standing in a group, front first, by session. */
  order(group: string): string[];
}

export interface FakeHostOptions {
  readonly windows?: FoundWindow[];
  /** Groups beyond the ones the windows name (views, idle hosts, strangers). */
  readonly groups?: InventoryGroup[];
  readonly unknown?: string;
  readonly refuseClose?: string;
  readonly unusable?: string;
  readonly inherited?: string[];
  /** What `typeLine` answers — typed, when nothing else is said. */
  readonly typing?: TypeResult;
  /** What `enter` returns — the host client's exit code. */
  readonly exitCode?: number;
}

export function fakeHost(options: FakeHostOptions = {}): FakeHost {
  const windows = [...(options.windows ?? [])];
  const placed: PlaceRequest[] = [];
  const closed: string[] = [];
  const views: ViewRequest[] = [];
  const entered: View[] = [];
  const renames: RenameRequest[] = [];
  const typed: TypeRequest[] = [];
  const restamps: { group: string; floor: number }[] = [];
  // A restamp changes the stamp the group answers with, as a real host's would.
  const restamped = new Map<string, number>();
  const stamped = <T extends { name: string; stamp?: InventoryGroup['stamp'] }>(group: T): T => {
    const floor = restamped.get(group.name);
    return floor === undefined || group.stamp === undefined
      ? group
      : { ...group, stamp: { ...group.stamp, floor } };
  };
  const leads: { window: string; group: string }[] = [];
  let finds = 0;
  let next = 100;
  const groups = (): InventoryGroup[] => {
    const named = new Map<string, InventoryGroup>();
    // The window standing first in a group: the earliest in `windows` that
    // stands in it — the fake keeps each group's windows in that one order.
    const first = (name: string) => windows.find((w) => w.groups.some((g) => g.name === name));
    for (const group of options.groups ?? []) {
      const leading = group.first ?? first(group.name)?.window;
      named.set(group.name, leading === undefined ? group : { ...group, first: leading });
    }
    for (const window of windows) {
      for (const group of window.groups) {
        if (named.has(group.name)) continue;
        named.set(group.name, {
          name: group.name,
          ...(group.stamp === undefined ? {} : { stamp: group.stamp }),
          clients: 0,
          windows: windows.filter((w) => w.groups.some((g) => g.name === group.name)).length,
          first: first(group.name)?.window ?? '',
          created: 0,
        });
      }
    }
    return [...named.values()].map(stamped);
  };
  return {
    kind: 'tmux',
    placed,
    closed,
    views,
    entered,
    renames,
    restamps,
    typed,
    leads,
    order: (group: string) =>
      windows.filter((w) => w.groups.some((g) => g.name === group)).map((w) => w.tags.session),
    get finds() {
      return finds;
    },
    check: (): HostCheck =>
      options.unusable === undefined
        ? { usable: true, version: 'fake 1.0' }
        : { usable: false, reason: options.unusable },
    prepare: () => {},
    place(request: PlaceRequest): Placement {
      placed.push(request);
      const group = request.naming.name;
      const window = `@${next++}`;
      const created: FoundWindow = {
        window,
        groups: [{ name: group, stamp: request.group }],
        tags: request.tags,
        dead: false,
      };
      if (request.first === true) windows.unshift(created);
      else windows.push(created);
      return { group, window, createdGroup: true };
    },
    find(session: string): FindResult {
      finds += 1;
      if (options.unknown !== undefined) return { outcome: 'unknown', reason: options.unknown };
      return {
        outcome: 'answered',
        windows: windows
          .filter((w) => w.tags.session === session)
          .map((w) => ({ ...w, groups: w.groups.map(stamped) })),
      };
    },
    close(window: string): CloseResult {
      if (options.refuseClose !== undefined)
        return { outcome: 'refused', reason: options.refuseClose };
      closed.push(window);
      return { outcome: 'closed' };
    },
    typeLine(request: TypeRequest): TypeResult {
      typed.push(request);
      return options.typing ?? { outcome: 'typed' };
    },
    rename(request: RenameRequest): Renamed {
      renames.push(request);
      // Renamed in place, as a real host would: the windows follow the group.
      const moved = request.groups
        .filter(({ name, naming }) => name !== naming.name)
        .map(({ name, naming }) => ({ from: name, to: naming.name }));
      for (const { from, to } of moved) {
        for (const [index, window] of windows.entries()) {
          windows[index] = {
            ...window,
            groups: window.groups.map((g) => (g.name === from ? { ...g, name: to } : g)),
          };
        }
      }
      // Each view follows its group: named after it, in the order given.
      const followed = request.groups.map(({ naming, views = [] }) =>
        views.map((view, index) => ({
          from: view.name,
          to: `${naming.name}-${view.mode === 'attach' ? 'v' : 'o'}${index + 1}`,
        })),
      );
      // Every group asked to wear an identity is dressed, by the name it has
      // now, and its views with it.
      const themed = request.groups.flatMap(({ naming }, index) =>
        naming.identity === undefined
          ? []
          : [{ group: naming.name, views: (followed[index] ?? []).map(({ to }) => to) }],
      );
      return {
        groups: moved,
        views: followed.flat().filter(({ from, to }) => from !== to),
        failed: [],
        themed,
      };
    },
    restamp(group: string, floor: number): RestampResult {
      restamps.push({ group, floor });
      if (!groups().some((g) => g.name === group)) {
        return { outcome: 'failed', reason: `can't find session: ${group}` };
      }
      restamped.set(group, floor);
      return { outcome: 'restamped' };
    },
    lead(window: string, group: string): LeadResult {
      leads.push({ window, group });
      const index = windows.findIndex((w) => w.window === window);
      if (index < 0) return { outcome: 'absent' };
      const [moved] = windows.splice(index, 1);
      if (moved !== undefined) windows.unshift(moved);
      return { outcome: 'moved' };
    },
    view(request: ViewRequest): View {
      views.push(request);
      return {
        name: `${request.group}-${request.mode === 'attach' ? 'v' : 'o'}1`,
        mode: request.mode,
      };
    },
    async enter(view: View): Promise<number> {
      entered.push(view);
      return options.exitCode ?? 0;
    },
    inventory(): Inventory {
      if (options.unknown !== undefined) return { outcome: 'unknown', reason: options.unknown };
      return {
        outcome: 'answered',
        groups: groups(),
        windows: windows.map((w) => ({
          window: w.window,
          tags: w.tags,
          groups: w.groups.map((g) => g.name),
          dead: w.dead,
          ...(w.exitStatus === undefined ? {} : { exitStatus: w.exitStatus }),
          ...(w.exitSignal === undefined ? {} : { exitSignal: w.exitSignal }),
        })),
      };
    },
    inheritedEnv(): InheritedEnv {
      return { outcome: 'answered', names: options.inherited ?? [] };
    },
    joinCommand: (group: string) => `fake join ${group}`,
    closeCommand: (window: string) => `fake kill ${window}`,
    endGroupCommand: (group: string) => `fake end ${group}`,
    unlinkCommand: (window: string, group: string) => `fake unlink ${window} from ${group}`,
    moveCommand: (window: string, from: string, to: string) =>
      `fake move ${window} from ${from} to ${to}`,
    forgetEnvCommand: (name: string) => `fake forget ${name}`,
  };
}
