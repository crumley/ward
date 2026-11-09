// The session-host seam (intent/02-subsystems/01-session-multiplexer.md;
// design/0031-detached-session-hosting/, ADR 0006): what a DETACHED host does
// for Ward, stated in host terms and never in any one tool's. A host keeps a
// run alive in a GROUP (one per floor), behind a WINDOW tagged at creation
// with the session it holds; Ward finds that window again by its tags, and
// closes it. The foreground baseline is not a host — it is the run in the
// caller's own terminal, and needs none of this.
//
// What stays OUTSIDE this interface is everything that reads a record:
// which floor a session belongs on, whether it floats, whether a found window
// is the record's own (src/agent/host.ts). A host is handed a floor number and
// a list of tags, and never learns why — so a second host (a terminal app
// that hosts sessions itself) is one more implementation of this interface
// beside src/host/tmux.ts, selected by `agent.host`, and the Ward side does
// not change.
import type { HostedKind } from '../store/types.ts';

/** The stamps that identify a floor's group: whose workspace, which floor. */
export interface GroupStamp {
  /** The workspace's immutable id (design/0054-workspace-id/) — never its path or name. */
  readonly workspace: string;
  readonly floor: number;
}

/** The tags a window carries from its creation — the binding, never its name. */
export interface WindowTags {
  /** The Ward session id the window holds. */
  readonly session: string;
  /** The generation: the `at` of the launch event that created this window. */
  readonly epoch: string;
}

export interface PlaceRequest {
  readonly group: GroupStamp;
  /** Used only to mint a group's name when the floor has none; never a lookup key. */
  readonly workspaceName: string;
  readonly tags: WindowTags;
  /** What the window is called — presentation only; nothing reads it back. */
  readonly label: string;
  /** Absolute directory the run stands in. */
  readonly cwd: string;
  /** Environment for THIS run only — never the group's, which later windows inherit. */
  readonly env: Readonly<Record<string, string>>;
  /** The whole command: program, then its arguments. */
  readonly command: readonly string[];
  /**
   * Whether this window FLOATS — is linked into every other group of the
   * workspace as well as living in its own.
   */
  readonly floats: boolean;
  /**
   * The tags of the windows that float, so a group created by this placement
   * links them in. Each is found by its tags; one that is missing, dead, or of
   * another generation is skipped.
   */
  readonly floating: readonly WindowTags[];
  /** The Ward version, stamped on a group this placement creates. */
  readonly version: string;
}

export interface Placement {
  /** The group the window was placed in, by the name a human attaches to. */
  readonly group: string;
  /** The window's host-assigned id. */
  readonly window: string;
  /** True when this placement created the group. */
  readonly createdGroup: boolean;
  /** Further groups the window was linked into (a floating window). */
  readonly linkedInto: readonly string[];
}

/** One window found carrying a session tag. */
export interface FoundWindow {
  readonly window: string;
  /** Every group the window appears in — several when it is linked. */
  readonly groups: readonly FoundGroup[];
  readonly tags: WindowTags;
  /** Whether the session's own run has ended (the window kept to show it). */
  readonly dead: boolean;
  readonly exitStatus?: number;
  readonly exitSignal?: string;
}

export interface FoundGroup {
  readonly name: string;
  /** The stamps the group carries — absent where it carries none (not Ward's). */
  readonly stamp?: GroupStamp;
}

/**
 * The answer to "where is this session's window": a list (possibly empty),
 * or that the host could not say. Could-not-determine is its own answer and
 * never reads as absence (design/0031-detached-session-hosting/, liveness).
 */
export type FindResult =
  | { readonly outcome: 'answered'; readonly windows: readonly FoundWindow[] }
  | { readonly outcome: 'unknown'; readonly reason: string };

export type CloseResult =
  | { readonly outcome: 'closed' }
  /** Already gone — idempotent, never an error. */
  | { readonly outcome: 'absent' }
  /** The window no longer carries the expected tag: left standing. */
  | { readonly outcome: 'refused'; readonly reason: string }
  | { readonly outcome: 'unknown'; readonly reason: string };

export type HostCheck =
  | { readonly usable: true; readonly version: string }
  | { readonly usable: false; readonly reason: string };

/** A detached host, in host terms. */
export interface SessionHost {
  readonly kind: HostedKind;
  /** Whether this host can be used here at all, and its version. */
  check(): HostCheck;
  /**
   * Make the host ready to place into — run BEFORE the store lock is taken, so
   * the critical section spends only the placement itself.
   */
  prepare(): void;
  /** Find or create the floor's group, then create the tagged window in it. Throws on failure. */
  place(request: PlaceRequest): Placement;
  /** Every window carrying this session's tag, in any group. */
  find(session: string): FindResult;
  /**
   * End one window — only if it still carries `session`'s tag. Never ends a
   * group: a group lives exactly as long as the host's own rule keeps it.
   */
  close(window: string, session: string): CloseResult;
  /** The command a human runs to join a group, as one shell-ready line. */
  joinCommand(group: string): string;
}
