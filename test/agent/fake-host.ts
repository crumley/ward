// An in-memory session host for the Ward-side suites (design/0031-detached-session-hosting/):
// it holds the windows and groups it is given, answers every read from them,
// and records every request — what was placed, closed, linked, viewed, and
// entered — so a test can assert what Ward ASKED of a host without a real one.
import type {
  CloseResult,
  FindResult,
  FoundWindow,
  HostCheck,
  InheritedEnv,
  Inventory,
  InventoryGroup,
  Placement,
  PlaceRequest,
  Renamed,
  RenameRequest,
  SessionHost,
  TypeRequest,
  TypeResult,
  View,
  ViewRequest,
} from '../../src/host/host.ts';

export interface FakeHost extends SessionHost {
  readonly placed: PlaceRequest[];
  readonly closed: string[];
  readonly links: string[];
  readonly views: ViewRequest[];
  readonly entered: View[];
  readonly renames: RenameRequest[];
  readonly typed: TypeRequest[];
  readonly finds: number;
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
  const links: string[] = [];
  const views: ViewRequest[] = [];
  const entered: View[] = [];
  const renames: RenameRequest[] = [];
  const typed: TypeRequest[] = [];
  let finds = 0;
  let next = 100;
  const groups = (): InventoryGroup[] => {
    const named = new Map<string, InventoryGroup>();
    for (const group of options.groups ?? []) named.set(group.name, group);
    for (const window of windows) {
      for (const group of window.groups) {
        if (named.has(group.name)) continue;
        named.set(group.name, {
          name: group.name,
          ...(group.stamp === undefined ? {} : { stamp: group.stamp }),
          clients: 0,
          windows: windows.filter((w) => w.groups.some((g) => g.name === group.name)).length,
          created: 0,
        });
      }
    }
    return [...named.values()];
  };
  return {
    kind: 'tmux',
    placed,
    closed,
    links,
    views,
    entered,
    renames,
    typed,
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
      windows.push({
        window,
        groups: [{ name: group, stamp: request.group }],
        tags: request.tags,
        dead: false,
      });
      return { group, window, createdGroup: true, linkedInto: [] };
    },
    find(session: string): FindResult {
      finds += 1;
      if (options.unknown !== undefined) return { outcome: 'unknown', reason: options.unknown };
      return { outcome: 'answered', windows: windows.filter((w) => w.tags.session === session) };
    },
    close(window: string): CloseResult {
      if (options.refuseClose !== undefined)
        return { outcome: 'refused', reason: options.refuseClose };
      closed.push(window);
      return { outcome: 'closed' };
    },
    link(window: string, group: string): void {
      links.push(`${window} into ${group}`);
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
    forgetEnvCommand: (name: string) => `fake forget ${name}`,
  };
}
