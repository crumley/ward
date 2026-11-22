// The conformance scenarios (design/0073-scripted-tmux-runner/): each drives
// the tmux host's own methods — never the CLI, never a workspace — and asserts
// what Ward makes of tmux's answers. Every one runs twice over: against a real
// tmux on a private server in the live tier, which also requires the
// recording to equal the committed transcript, and against that transcript in
// the fast tier. So each assertion here is proved on a real tmux AND kept
// cheap to run on every save.
//
// A scenario reads tmux back through `stage.tmux(...)` to show the effect of
// what the host did (an option set, a window gone); those reads are part of
// the transcript too. Waits go through `stage.waitFor`, which only a real
// tmux needs.
import { expect } from 'bun:test';
import { claudeInputLine } from '../../src/harness/claude.ts';
import type { GroupIdentity, PlaceRequest, SessionHost } from '../../src/host/host.ts';
import type { Scenario, Stage } from './scripted-tmux.ts';

export const WS = 'ws-conformance';
export const OTHER_WS = 'ws-other';
export const SILVER: GroupIdentity = { color: 'silver', emoji: '🔧', label: 'f0 workspace' };
export const BLUE: GroupIdentity = { color: 'blue', emoji: '🌊', label: 'f1 alpha' };
export const F0 = 'main-f0-workspace';
export const F1 = 'main-f1-alpha';
export const F2 = 'main-f2-beta';
const SLUGS = ['workspace', 'alpha', 'beta'];

/** A run that stays until the case ends. */
export const STAYING = ['sleep', '600'];
/** A run that fails at once. */
export const FAILING = ['sh', '-c', 'exit 3'];

/** A placement request as the Ward side builds one: the floor's group, the session's tags. */
export function request(
  stage: Pick<Stage, 'scratch'>,
  session: string,
  options: {
    floor?: number;
    command?: readonly string[];
    floats?: boolean;
    floating?: readonly string[];
    name?: string;
    identity?: GroupIdentity;
    env?: Record<string, string>;
  } = {},
): PlaceRequest {
  const floor = options.floor ?? 0;
  return {
    group: { workspace: WS, floor },
    naming: {
      name: options.name ?? `main-f${floor}-${SLUGS[floor] ?? 'x'}`,
      title: `main f${floor}`,
      ...(options.identity === undefined ? {} : { identity: options.identity }),
    },
    tags: { session, epoch: epoch(session) },
    label: session,
    cwd: stage.scratch,
    env: { WARD_AGENT: session, ...options.env },
    command: options.command ?? STAYING,
    floats: options.floats ?? false,
    floating: (options.floating ?? []).map((id) => ({ session: id, epoch: epoch(id) })),
    version: '0.1.0',
  };
}

/** A run that stays until `stage.touch(cue)`, then exits 0 — a human leaving it the ordinary way. */
export function leaving(stage: Stage, cue: string): string[] {
  return ['sh', '-c', `while [ ! -e '${stage.scratch}/${cue}' ]; do sleep 0.1; done`];
}

export const RULE = '─'.repeat(40);

/**
 * A stand-in for a harness at its prompt: a rule, the prompt mark, a rule, a
 * status row, with the cursor left after the mark so the terminal echoes what
 * is typed there; every line submitted is logged to `typed.log`.
 */
export function asking(stage: Stage): string[] {
  const stub = stage.stub(
    'asking',
    [
      `rule='${RULE}'`,
      `draw() { printf '\\033[2J\\033[H%s\\n❯ \\n%s\\n  stub status\\n\\033[2;3H' "$rule" "$rule"; }`,
      'draw',
      'while IFS= read -r line; do',
      // printf, not echo: a POSIX sh's echo reads backslashes in the line.
      `  printf '%s: %s\\n' "$WARD_AGENT" "$line" >> '${stage.scratch}/typed.log'`,
      '  draw',
      'done',
    ].join('\n'),
  );
  return ['sh', stub];
}

/**
 * A stand-in at its prompt, as {@link asking}, that draws a question over it
 * the moment `cue` appears — a permission prompt arriving between Ward's
 * read-back and its submitting key. Whatever line it is then handed is
 * logged, as an answer would be taken.
 */
export function interrupted(stage: Stage, cue: string): string[] {
  const stub = stage.stub(
    'interrupted',
    [
      `rule='${RULE}'`,
      `printf '\\033[2J\\033[H%s\\n❯ \\n%s\\n  stub status\\n\\033[2;3H' "$rule" "$rule"`,
      `( while [ ! -e '${stage.scratch}/${cue}' ]; do sleep 0.02; done`,
      `  printf '\\033[2J\\033[H%s\\n Bash command\\n Do you want to proceed?\\n ❯ 1. Yes\\n   2. No\\n' "$rule" ) &`,
      'while IFS= read -r line; do',
      `  echo "$WARD_AGENT: $line" >> '${stage.scratch}/typed.log'`,
      'done',
    ].join('\n'),
  );
  return ['sh', stub];
}

/** A stand-in asking a question with options: no input line on its screen. */
export function questioning(stage: Stage): string[] {
  const stub = stage.stub(
    'question',
    [
      `printf '\\033[2J\\033[H${RULE}\\n Bash command\\n Do you want to proceed?\\n ❯ 1. Yes\\n   2. No\\n'`,
      'while IFS= read -r line; do',
      `  echo "$WARD_AGENT: $line" >> '${stage.scratch}/typed.log'`,
      'done',
    ].join('\n'),
  );
  return ['sh', stub];
}

export const SCENARIOS: readonly Scenario[] = [
  {
    name: 'place-a-host',
    run(stage) {
      const host = stage.host();
      expect(host.check().usable).toBe(true);
      host.prepare();
      const coord = host.place(request(stage, 'coord', { floats: true, identity: SILVER }));
      expect(coord).toEqual({
        group: F0,
        window: expect.stringMatching(/^@\d+$/),
        createdGroup: true,
        linkedInto: [],
      });
      // The host is stamped, titled, and dressed — session options, its own.
      expect(sessionOption(stage, F0, '@ward_workspace')).toBe(WS);
      expect(sessionOption(stage, F0, '@ward_floor')).toBe('0');
      expect(sessionOption(stage, F0, '@ward_version')).toBe('0.1.0');
      expect(sessionOption(stage, F0, 'detach-on-destroy')).toBe('off');
      expect(sessionOption(stage, F0, 'set-titles')).toBe('on');
      expect(sessionOption(stage, F0, 'status-style')).toBe('bg=colour250,fg=colour16');
      expect(sessionOption(stage, F0, '@ward_emoji')).toBe('🔧');
      expect(stage.tmux('show-options', '-gv', 'set-titles').trim()).toBe('off');
      // The window is tagged, keeps a failed exit only, and keeps its name.
      expect(windowOption(stage, coord.window, '@ward_session')).toBe('coord');
      expect(windowOption(stage, coord.window, '@ward_epoch')).toBe(epoch('coord'));
      expect(windowOption(stage, coord.window, 'remain-on-exit')).toBe('failed');
      expect(windowOption(stage, coord.window, 'automatic-rename')).toBe('off');
      // The placeholder the host was born holding is gone: one window, the run's.
      expect(windowsIn(stage, F0)).toEqual(['coord']);

      // The floor's next run joins the host it finds by stamp, which is not dressed again.
      const helper = host.place(request(stage, 'helper', { identity: SILVER }));
      expect(helper).toMatchObject({ group: F0, createdGroup: false, linkedInto: [] });
      // tmux gives the new window the first free index: the slot the placeholder left.
      expect(windowsIn(stage, F0)).toEqual(['helper', 'coord']);
      expect(windowNames(stage, F0)).toEqual(['helper', 'coord']);

      const found = host.find('helper');
      expect(found).toEqual({
        outcome: 'answered',
        windows: [
          {
            window: helper.window,
            // Placed after the coordinator, standing before it: where a window
            // stands is the host's index, never the order it was placed in.
            groups: [{ name: F0, stamp: { workspace: WS, floor: 0 }, index: 0 }],
            tags: { session: 'helper', epoch: epoch('helper') },
            dead: false,
          },
        ],
      });
      expect(host.find('nobody')).toEqual({ outcome: 'answered', windows: [] });
    },
  },
  {
    name: 'floating-windows',
    run(stage) {
      const host = stage.host();
      host.prepare();
      const coord = host.place(request(stage, 'coord', { floats: true }));
      // A new host is born with the floating windows at its left edge; one
      // whose session has no window is skipped.
      const alpha = host.place(
        request(stage, 'alpha', { floor: 1, floating: ['coord', 'vanished'], identity: BLUE }),
      );
      expect(alpha).toMatchObject({ group: F1, createdGroup: true, linkedInto: [] });
      expect(windowsIn(stage, F1)).toEqual(['coord', 'alpha']);
      expect(sessionOption(stage, F1, 'status-style')).toBe('bg=colour26,fg=colour231');
      // A host born with no floating window to take its placeholder's place
      // has the placeholder cleared after the run's window is made.
      const beta = host.place(request(stage, 'beta', { floor: 2, floating: ['vanished'] }));
      expect(beta).toMatchObject({ group: F2, createdGroup: true });
      expect(windowsIn(stage, F2)).toEqual(['beta']);

      // A second floating window is linked into every other host of the workspace.
      const second = host.place(request(stage, 'coord-2', { floats: true }));
      expect(second).toMatchObject({ group: F0, linkedInto: [F1, F2] });
      expect(windowsIn(stage, F2)).toEqual(['coord-2', 'beta']);
      const found = host.find('coord');
      expect(found.outcome === 'answered' && found.windows[0]?.groups.map((g) => g.name)).toEqual([
        F0,
        F1,
      ]);

      // Linking is additive: a window already shown is left as it is.
      host.link(coord.window, F1);
      expect(windowsIn(stage, F1)).toEqual(['coord', 'alpha', 'coord-2']);
      host.link(coord.window, F2);
      expect(windowsIn(stage, F2)).toEqual(['coord-2', 'beta', 'coord']);
      // A host killed by hand only unlinks what it shared: the run goes on elsewhere.
      stage.tmux('kill-session', '-t', `=${F1}`);
      const after = host.find('coord');
      expect(after.outcome === 'answered' && after.windows[0]?.groups.map((g) => g.name)).toEqual([
        F0,
        F2,
      ]);
      expect(host.find('alpha')).toEqual({ outcome: 'answered', windows: [] });
    },
  },
  {
    name: 'found-by-stamp',
    run(stage) {
      const host = stage.host();
      host.prepare();
      // Someone else's session wearing the name the floor's host would take: never joined.
      stage.tmux('new-session', '-d', '-s', F2, 'sleep 600');
      expect(() => host.place(request(stage, 'beta', { floor: 2 }))).toThrow(
        `a tmux session named '${F2}' already exists and is not this workspace's floor 2 host`,
      );
      expect(windowsIn(stage, F2)).toEqual(['']);
      // Another workspace's host of the same floor is not this one's.
      stage.tmux('new-session', '-d', '-s', 'other-f1', 'sleep 600');
      stage.tmux('set-option', '-t', '=other-f1:', '@ward_workspace', OTHER_WS);
      stage.tmux('set-option', '-t', '=other-f1:', '@ward_floor', '1');
      const alpha = host.place(request(stage, 'alpha', { floor: 1 }));
      expect(alpha).toMatchObject({ group: F1, createdGroup: true });
      // A host renamed by hand (or by a workspace that moved) is still found by its stamp.
      stage.tmux('rename-session', '-t', `=${F1}`, 'renamed-by-hand');
      const again = host.place(request(stage, 'alpha-2', { floor: 1 }));
      expect(again).toMatchObject({ group: 'renamed-by-hand', createdGroup: false });
      expect(windowsIn(stage, 'renamed-by-hand').sort()).toEqual(['alpha', 'alpha-2']);
    },
  },
  {
    name: 'close-a-window',
    run(stage) {
      const host = stage.host();
      host.prepare();
      host.place(request(stage, 'coord'));
      const helper = host.place(request(stage, 'helper'));
      expect(host.close(helper.window, 'someone-else')).toEqual({
        outcome: 'refused',
        reason: `window ${helper.window} carries 'helper', not 'someone-else'`,
      });
      expect(windowsIn(stage, F0).sort()).toEqual(['coord', 'helper']);
      expect(host.close(helper.window, 'helper')).toEqual({ outcome: 'closed' });
      expect(windowsIn(stage, F0)).toEqual(['coord']);
      // Closing a window tmux no longer holds is never an error: tmux answers
      // a read of it with an empty line and exit 0 (display-message's target
      // may fail), and the empty window id is what says it has gone.
      expect(host.close(helper.window, 'helper')).toEqual({ outcome: 'absent' });
      // A window that carries no tag is not Ward's to end.
      const human = stage.tmux('new-window', '-d', '-P', '-F', '#{window_id}', '-t', `=${F0}:`);
      expect(host.close(human.trim(), 'coord')).toEqual({
        outcome: 'refused',
        reason: `window ${human.trim()} carries no session tag, not 'coord'`,
      });
      // With no server at all there is nothing to end.
      stage.tmux('kill-server');
      expect(host.close(helper.window, 'helper')).toEqual({ outcome: 'absent' });
    },
  },
  {
    name: 'how-runs-end',
    run(stage) {
      const host = stage.host();
      host.prepare();
      const failed = host.place(request(stage, 'failed', { command: FAILING }));
      const clean = host.place(request(stage, 'clean', { command: leaving(stage, 'leave-clean') }));
      stage.waitFor('the failed run to end', () => paneDead(stage, failed.window));
      // A pane a human splits off beside the run (ahead of it) says nothing about the run.
      stage.tmux('split-window', '-d', '-b', '-t', failed.window, 'sleep 600');
      expect(host.find('failed')).toMatchObject({
        outcome: 'answered',
        windows: [{ window: failed.window, dead: true, exitStatus: 3 }],
      });
      // A clean exit takes its window with it: nothing is found.
      stage.touch('leave-clean');
      stage.waitFor('the clean run to close its window', () => !hasWindow(stage, clean.window));
      expect(host.find('clean')).toEqual({ outcome: 'answered', windows: [] });

      // A window an older Ward made keeps every exit; the refresh brings a
      // running one to today's rule, and leaves a dead one as it stands.
      const older = host.place(request(stage, 'older', { command: leaving(stage, 'leave-older') }));
      const kept = host.place(request(stage, 'kept', { command: leaving(stage, 'leave-kept') }));
      for (const window of [older.window, kept.window]) {
        stage.tmux('set-option', '-w', '-t', window, 'remain-on-exit', 'on');
      }
      stage.touch('leave-kept');
      stage.waitFor('the kept run to end', () => paneDead(stage, kept.window));
      expect(
        host.rename({
          groups: [],
          windows: [
            { window: older.window, label: 'older', running: true },
            { window: kept.window, label: 'kept', running: false },
          ],
        }),
      ).toEqual({ groups: [], views: [], failed: [], themed: [] });
      expect(windowOption(stage, older.window, 'remain-on-exit')).toBe('failed');
      expect(windowOption(stage, kept.window, 'remain-on-exit')).toBe('on');
      stage.touch('leave-older');
      stage.waitFor('the older run to close its window', () => !hasWindow(stage, older.window));
      expect(host.find('older')).toEqual({ outcome: 'answered', windows: [] });
      expect(host.find('kept')).toMatchObject({
        outcome: 'answered',
        windows: [{ window: kept.window, dead: true, exitStatus: 0 }],
      });

      // The inventory holds the host and every tagged window, dead ones included.
      const inventory = host.inventory();
      expect(inventory).toEqual({
        outcome: 'answered',
        groups: [
          {
            name: F0,
            stamp: { workspace: WS, floor: 0 },
            clients: 0,
            windows: 2,
            created: expect.any(Number),
            version: '0.1.0',
          },
        ],
        windows: [
          {
            window: failed.window,
            tags: { session: 'failed', epoch: epoch('failed') },
            groups: [F0],
            dead: true,
            exitStatus: 3,
          },
          {
            window: kept.window,
            tags: { session: 'kept', epoch: epoch('kept') },
            groups: [F0],
            dead: true,
            exitStatus: 0,
          },
        ],
      });
      // What every new window inherits is read from the server, never changed.
      stage.tmux('set-environment', '-g', 'CLAUDECODE', '1');
      const inherited = host.inheritedEnv();
      expect(inherited.outcome === 'answered' && [...inherited.names].sort()).toEqual([
        'CLAUDECODE',
        'HOME',
        'LANG',
        'PATH',
        'PWD',
        'SHELL',
      ]);
    },
  },
  {
    name: 'a-server-with-no-session',
    run(stage) {
      const host = stage.host();
      host.prepare();
      const only = host.place(request(stage, 'only'));
      stage.tmux('kill-window', '-t', only.window);
      // The server outlives its last host (the hygiene preamble), and holding
      // nothing is an empty answer — never could-not-determine.
      expect(stage.tmuxReply('list-sessions')).toMatchObject({ exitCode: 0, stdout: '' });
      expect(host.find('only')).toEqual({ outcome: 'answered', windows: [] });
      expect(host.inventory()).toEqual({ outcome: 'answered', groups: [], windows: [] });
      expect(host.inheritedEnv().outcome).toBe('answered');
      // And the next placement mints the host again.
      expect(host.place(request(stage, 'again'))).toMatchObject({ group: F0, createdGroup: true });
    },
  },
  {
    name: 'no-server-at-all',
    server: false,
    run(stage) {
      const host = stage.host();
      // No server is an empty answer to every read, and nothing to act on.
      expect(host.find('coord')).toEqual({ outcome: 'answered', windows: [] });
      expect(host.inventory()).toEqual({ outcome: 'answered', groups: [], windows: [] });
      expect(host.inheritedEnv()).toEqual({ outcome: 'answered', names: [] });
      expect(host.close('@999', 'coord')).toEqual({ outcome: 'absent' });
      expect(
        host.typeLine({ window: '@999', session: 'coord', text: 'hi', inputLine: claudeInputLine }),
      ).toEqual({ outcome: 'absent' });
      expect(
        host.rename({
          groups: [{ name: F0, naming: { name: F0, title: 'main f0' } }],
          windows: [],
        }),
      ).toEqual({ groups: [], views: [], failed: [], themed: [] });
      // The preamble starts one, and it holds nothing yet.
      host.prepare();
      expect(host.find('coord')).toEqual({ outcome: 'answered', windows: [] });
    },
  },
  {
    name: 'rename-in-place',
    run(stage) {
      const host = stage.host();
      host.prepare();
      // As an older Ward named them: the host for its number, the window for its session.
      const coord = host.place(request(stage, 'coord', { name: 'ward-main-f0' }));
      const helper = host.place(request(stage, 'helper', { name: 'ward-main-f0' }));
      stage.tmux('rename-window', '-t', coord.window, 'coord-old');
      const watching = host.view({
        group: 'ward-main-f0',
        window: helper.window,
        mode: 'observe',
        workspace: WS,
        title: 'main f0',
      });
      const looking = host.view({
        group: 'ward-main-f0',
        window: coord.window,
        mode: 'attach',
        workspace: WS,
        title: 'main f0',
      });
      expect([looking.name, watching.name]).toEqual(['ward-main-f0-v1', 'ward-main-f0-o1']);
      const pane = stage.tmux('display-message', '-p', '-t', coord.window, '#{pane_id}');

      const renamed = host.rename({
        groups: [
          {
            name: 'ward-main-f0',
            naming: { name: F0, title: 'main f0', identity: SILVER },
            views: [
              { name: looking.name, mode: 'attach' },
              { name: watching.name, mode: 'observe' },
            ],
          },
          // A group the server does not hold is passed over.
          { name: 'ward-main-f9', naming: { name: 'main-f9-x', title: 'main f9' } },
        ],
        windows: [
          { window: coord.window, label: 'coord', running: true },
          { window: '@999', label: 'nothing', running: true },
        ],
      });
      expect(renamed).toEqual({
        groups: [{ from: 'ward-main-f0', to: F0 }],
        views: [
          { from: 'ward-main-f0-v1', to: `${F0}-v1` },
          { from: 'ward-main-f0-o1', to: `${F0}-o1` },
        ],
        failed: [expect.stringMatching(/^@999: can't find window/)],
        themed: [{ group: F0, views: [`${F0}-v1`, `${F0}-o1`] }],
      });
      expect(groupNames(stage)).toEqual([F0, `${F0}-o1`, `${F0}-v1`]);
      expect(windowNames(stage, F0)).toEqual(['helper', 'coord']);
      // In place: the same pane, still the same run.
      expect(stage.tmux('display-message', '-p', '-t', coord.window, '#{pane_id}')).toBe(pane);
      expect(sessionOption(stage, `${F0}-o1`, 'set-titles-string')).toStartWith(
        '🔧 #{window_name} · main f0 (observing)',
      );
      expect(sessionOption(stage, `${F0}-v1`, 'status-style')).toBe('bg=colour250,fg=colour16');

      // A name another session already wears is left to it: the host keeps its own.
      stage.tmux('new-session', '-d', '-s', 'main-f0-taken', 'sleep 600');
      expect(
        host.rename({
          groups: [{ name: F0, naming: { name: 'main-f0-taken', title: 'main f0' } }],
          windows: [],
        }),
      ).toEqual({ groups: [], views: [], failed: [], themed: [] });
      expect(groupNames(stage)).toContain(F0);
    },
  },
  {
    name: 'views',
    async run(stage) {
      const host = stage.host();
      host.prepare();
      host.place(request(stage, 'coord'));
      const helper = host.place(request(stage, 'helper'));
      const attach = (window: string) =>
        host.view({ group: F0, window, mode: 'attach', workspace: WS, title: 'main f0' });
      const observe = (window: string) =>
        host.view({
          group: F0,
          window,
          mode: 'observe',
          workspace: WS,
          title: 'main f0',
          identity: SILVER,
        });

      // An attach view shares the host's windows with its own current one.
      const one = attach(helper.window);
      expect(one).toEqual({ name: `${F0}-v1`, mode: 'attach' });
      expect(sessionOption(stage, one.name, '@ward_view')).toBe(WS);
      expect(
        stage.tmux('display-message', '-p', '-t', `=${one.name}:`, '#{window_id}').trim(),
      ).toBe(helper.window);
      expect(attach(helper.window).name).toBe(`${F0}-v2`);
      // A name some session already wears is skipped.
      stage.tmux('new-session', '-d', '-s', `${F0}-v3`, 'sleep 600');
      expect(attach(helper.window).name).toBe(`${F0}-v4`);
      // An observe view holds the one window, beside a placeholder with no entry.
      const watching = observe(helper.window);
      expect(watching).toEqual({ name: `${F0}-o1`, mode: 'observe' });
      expect(windowsIn(stage, watching.name)).toEqual(['', 'helper']);
      expect(sessionOption(stage, watching.name, 'status-style')).toBe('bg=colour250,fg=colour16');
      // The inventory tells a view from a host by its stamp, and says what an
      // attach view looks at; the stranger wearing a view's name is neither.
      const inventory = host.inventory();
      expect(inventory.outcome).toBe('answered');
      const rows = inventory.outcome === 'answered' ? inventory.groups : [];
      expect(rows.map((row) => [row.name, row.viewOf, row.viewHost])).toEqual([
        [F0, undefined, undefined],
        [`${F0}-o1`, WS, undefined],
        [`${F0}-v1`, WS, F0],
        [`${F0}-v2`, WS, F0],
        [`${F0}-v3`, undefined, undefined],
        [`${F0}-v4`, WS, F0],
      ]);

      // A view of a window that is not there is refused, and the view made
      // for it is ended: tmux makes the session before it fails to find the
      // window, so neither kind is left behind for doctor to call leftover.
      expect(() => observe('@999')).toThrow(
        "tmux could not make a view of @999: can't find window",
      );
      expect(() => attach('@999')).toThrow("tmux could not make a view of @999: can't find window");
      expect(groupNames(stage)).not.toContain(`${F0}-o2`);
      expect(groupNames(stage)).not.toContain(`${F0}-v5`);

      // Entering from no terminal: tmux refuses the client, and Ward ends the view after it.
      expect(await host.enter(one)).toBe(1);
      expect(groupNames(stage)).not.toContain(one.name);
      expect(await host.enter(watching)).toBe(1);
      expect(groupNames(stage)).not.toContain(watching.name);
      // From inside this server an attach SWITCHES the caller's client, and
      // nothing is left for Ward to end — the view ends with its client.
      const inside = stage.host({ TMUX: `${stage.socketPath},1,0` });
      expect(await inside.enter({ name: `${F0}-v2`, mode: 'attach' })).toBe(1);
      expect(groupNames(stage)).toContain(`${F0}-v2`);
      // An observe from inside still attaches a client of its own.
      const watchingInside = observe(helper.window);
      expect(await inside.enter(watchingInside)).toBe(1);
      expect(groupNames(stage)).not.toContain(watchingInside.name);

      // A view its client left by switching to another session runs no hook
      // of its own (design/0076-tmux-remaining-races/): the next view made in
      // the workspace ends it — joined, and nobody in it. A view not yet
      // joined (another Ward's, on its way) and another workspace's are left.
      stage.tmux('set-option', '-t', `=${F0}-v2:`, '@ward_joined', '1');
      stage.tmux('new-session', '-d', '-t', F0, '-s', 'elsewhere-v1');
      stage.tmux('set-option', '-t', '=elsewhere-v1:', '@ward_view', OTHER_WS);
      stage.tmux('set-option', '-t', '=elsewhere-v1:', '@ward_joined', '1');
      // (v1 was ended when its client was refused, above: the new view takes its name.)
      expect(attach(helper.window).name).toBe(`${F0}-v1`);
      expect(groupNames(stage)).toEqual(['elsewhere-v1', F0, `${F0}-v1`, `${F0}-v3`, `${F0}-v4`]);
    },
  },
  {
    name: 'typing-a-line',
    run(stage) {
      const host = stage.host();
      host.prepare();
      const target = host.place(request(stage, 'target', { command: asking(stage) }));
      const pane = windowOption(stage, target.window, '@ward_pane');
      const line = () =>
        claudeInputLine(stage.peek('capture-pane', '-p', '-t', pane))?.text ?? null;
      const type = (text: string, session = 'target', window = target.window) =>
        host.typeLine({ window, session, text, inputLine: claudeInputLine });
      stage.waitFor('the prompt', () => line() === '');

      // Typed, read back alone on the line, submitted once.
      expect(type('hello there')).toEqual({ outcome: 'typed' });
      stage.waitFor('the line to be read', () => stage.read('typed.log') !== '');
      if (stage.live) expect(stage.read('typed.log')).toBe('target: hello there\n');

      // Every character a regular expression or a tmux format treats
      // specially survives the check tmux makes before it sends the key.
      stage.waitFor('the prompt again', () => line() === '');
      const awkward = '[ward] a,b}{#x (y) $z ^q |r *s +t ?u .v \\\\w #{session_name} ....';
      expect(type(awkward)).toEqual({ outcome: 'typed' });
      stage.waitFor('the awkward line to be read', () => stage.read('typed.log').includes('....'));
      if (stage.live) {
        expect(stage.read('typed.log')).toBe(`target: hello there\ntarget: ${awkward}\n`);
      }

      // Someone's words already on the line are put back as they were.
      stage.waitFor('the prompt again', () => line() === '');
      stage.tmux('send-keys', '-t', pane, '-l', '--', 'half a thought');
      stage.waitFor('the words on the line', () => line() === 'half a thought');
      expect(type('hello')).toEqual({
        outcome: 'withheld',
        reason: 'its input line already held text — put back as it was',
      });
      expect(claudeInputLine(stage.tmux('capture-pane', '-p', '-t', pane))?.text).toBe(
        'half a thought',
      );

      // A window someone is scrolling is not typed into.
      stage.tmux('copy-mode', '-t', pane);
      expect(type('hello')).toEqual({
        outcome: 'withheld',
        reason: 'someone is scrolling its window (copy mode)',
      });
      stage.tmux('send-keys', '-t', pane, '-X', 'cancel');
      // Nor a window that carries another session's tag.
      expect(type('hello', 'someone-else')).toEqual({
        outcome: 'withheld',
        reason: `window ${target.window} carries 'target', not 'someone-else'`,
      });

      // A question on the screen is never typed into.
      const asked = host.place(request(stage, 'asked', { command: questioning(stage) }));
      stage.waitFor('the question', () =>
        stage.peek('capture-pane', '-p', '-t', asked.window).includes('Do you want to proceed?'),
      );
      expect(type('hello', 'asked', asked.window)).toEqual({
        outcome: 'withheld',
        reason: 'its screen does not show an input line',
      });
      // A run that has ended is not typed into; a window that is gone is absent.
      const ended = host.place(request(stage, 'ended', { command: FAILING }));
      stage.waitFor('the run to end', () => paneDead(stage, ended.window));
      expect(type('hello', 'ended', ended.window)).toEqual({
        outcome: 'withheld',
        reason: 'its run has ended',
      });
      // A window that carries the session's tag but names no pane for its run
      // is not typed into, and the refusal says what is missing.
      stage.tmux('set-option', '-wu', '-t', ended.window, '@ward_pane');
      expect(type('hello', 'ended', ended.window)).toEqual({
        outcome: 'withheld',
        reason: `window ${ended.window} carries 'ended' but names no pane for its run`,
      });
      // A window tmux no longer holds reads back blank (see close-a-window):
      // absent, never typed into.
      stage.tmux('kill-window', '-t', ended.window);
      expect(type('hello', 'ended', ended.window)).toEqual({ outcome: 'absent' });
      if (stage.live) expect(stage.read('typed.log')).toContain('target: hello there\n');
    },
  },
  {
    // design/0076-tmux-remaining-races/: a question that arrives after the
    // line reads back, and before the submitting key, never takes that key.
    // The hold puts the question on the screen at the worst instant — just
    // before the host's submitting call reaches tmux.
    name: 'a-question-before-the-key',
    run(stage) {
      const host = stage.host();
      host.prepare();
      const target = host.place(request(stage, 'target', { command: interrupted(stage, 'ask') }));
      const pane = windowOption(stage, target.window, '@ward_pane');
      const screen = () => stage.peek('capture-pane', '-p', '-t', pane);
      stage.waitFor('the prompt', () => claudeInputLine(screen())?.text === '');
      stage.holdBefore(
        (argv) => argv.some((arg) => arg.includes('Enter')),
        () => {
          stage.touch('ask');
          return screen().includes('Do you want to proceed?');
        },
      );
      expect(
        host.typeLine({
          window: target.window,
          session: 'target',
          text: 'hello there',
          inputLine: claudeInputLine,
        }),
      ).toEqual({
        outcome: 'unknown',
        reason:
          'its screen changed before the line could be submitted — not submitted; ' +
          'the typed text may remain on its input line',
      });
      // The question was never answered: no key reached the run.
      if (stage.live) {
        Bun.sleepSync(300);
        expect(stage.read('typed.log')).toBe('');
      }
    },
  },
];

// -- reads of tmux, as the scenario's own ----------------------------------------

export function epoch(session: string): string {
  const n = [...session].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 60;
  return `2026-11-18T00:00:${String(n).padStart(2, '0')}.000Z`;
}

function sessionOption(stage: Stage, group: string, option: string): string {
  return stage.tmux('show-options', '-v', '-t', `=${group}:`, option).trim();
}

function windowOption(stage: Stage, window: string, option: string): string {
  return stage.tmux('show-options', '-wv', '-t', window, option).trim();
}

function windowsIn(stage: Stage, group: string): string[] {
  return lines(stage.tmux('list-windows', '-t', `=${group}:`, '-F', '#{@ward_session}'), true);
}

function windowNames(stage: Stage, group: string): string[] {
  return lines(stage.tmux('list-windows', '-t', `=${group}:`, '-F', '#{window_name}'));
}

function groupNames(stage: Stage): string[] {
  return lines(stage.tmux('list-sessions', '-F', '#{session_name}')).sort();
}

function paneDead(stage: Stage, window: string): boolean {
  return stage.peek('display-message', '-p', '-t', window, '#{pane_dead}').trim() === '1';
}

function hasWindow(stage: Stage, window: string): boolean {
  return lines(stage.peek('list-windows', '-a', '-F', '#{window_id}')).includes(window);
}

function lines(text: string, keepEmpty = false): string[] {
  const all = text.split('\n');
  if (all.at(-1) === '') all.pop();
  return keepEmpty ? all : all.filter((line) => line !== '');
}

/** The scenario a name names — for a fault case built on its transcript. */
export function scenario(name: string): Scenario {
  const found = SCENARIOS.find((each) => each.name === name);
  if (found === undefined) throw new Error(`no scenario ${name}`);
  return found;
}

export type { SessionHost };
