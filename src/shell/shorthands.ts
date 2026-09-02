// The shorthand units — one definition of each piece of fish, assembled two
// ways (design/0027-shell-adoption/).
//
// 0025 wrote the fish layer as one string: header, picker seam, shorthands,
// completions, all welded together. That was right while there was exactly
// one assembly. There are now two — the always-fresh monolith
// `ward shell init fish` emits (`fish.ts`), and the per-alias files
// `ward shell adopt fish` writes into the human's own fish configuration
// (`adopt.ts`) — and two assemblies of one script must not become two scripts.
//
// So the units live here and nowhere else: a shorthand is a fish function
// body, the `complete` line that registers it, and the helper functions it
// calls. Each assembly frames them differently — the monolith has section
// banners and an install header, an adopted file has ward's adoption marker —
// but neither owns a line of fish. Add a shorthand by adding a row below and
// both surfaces grow.
//
// Kept as TypeScript strings rather than `.fish` files read at runtime, for
// 0025's reason: what ships is what the module holds, with no path resolution
// that differs between `bun src/cli/index.ts` and a compiled binary.

/** A function the shorthands share — not itself adoptable, but written beside whatever needs it. */
export interface ShellHelper {
  /** The fish function name, which is also the file name it autoloads from. */
  readonly name: string;
  /** One line, in the human's words — what an adopted file's header says it is. */
  readonly summary: string;
  /** The `function … end` block, verbatim. */
  readonly body: string;
  /** Helpers this one calls, resolved transitively before anything is written. */
  readonly needs: readonly string[];
}

/** A shorthand a human can adopt: its function, its completion, and what it leans on. */
export interface Shorthand {
  readonly name: string;
  readonly summary: string;
  readonly body: string;
  /** The `complete` line(s) that register the name — one file's worth. */
  readonly completion: string;
  readonly needs: readonly string[];
}

// -- the picker seam ---------------------------------------------------------

const pickerPresent: ShellHelper = {
  name: '__ward_picker_present',
  summary: 'whether an interactive picker is installed',
  needs: [],
  body: `function __ward_picker_present --description 'Whether an interactive picker is installed'
    command -q fzf
end`,
};

const picker: ShellHelper = {
  name: '__ward_picker',
  summary: 'pick one NAME<TAB>CUE line and print its NAME',
  needs: [],
  body: `function __ward_picker --description 'Pick one NAME<TAB>CUE line from stdin; print its NAME'
    set -l prompt $argv[1]
    set -l query $argv[2]
    # --select-1 takes the choice when the prefilled query leaves exactly one
    # candidate standing, so a near-miss Ward could not resolve still costs no
    # keystroke. No --exit-0: a query that matches nothing should leave the
    # human in the picker, editing, not drop them back with silence.
    # --with-nth shapes only what fzf DISPLAYS; what it prints on selection is
    # the whole input line, so the NAME this function promises is cut here —
    # never hand the CUE to a verb expecting a name.
    command fzf --prompt "$prompt> " --query "$query" --select-1 --no-multi \\
        --delimiter \\t --with-nth 1,2 | string split -m1 -f1 -- \\t
end`,
};

const choose: ShellHelper = {
  name: '__ward_choose',
  summary: "resolve a candidate kind to one name, or say why it can't",
  needs: [picker.name, pickerPresent.name],
  body: `function __ward_choose --description 'Resolve a candidate kind to one name, or say why not'
    set -l kind $argv[1]
    set -l prompt $argv[2]
    set -l query $argv[3]
    set -l candidates (command ward shell candidates $kind)
    if test (count $candidates) -eq 0
        echo "ward: nothing to pick from — ward knows no $kind from here" >&2
        return 1
    end
    if not __ward_picker_present
        # Degrade to a named lesser answer, never to a hang or a prompt: print
        # what could have been picked and let them name it.
        echo "ward: no picker installed — install fzf, or name one of these:" >&2
        printf '  %s\\n' (string replace -a \\t '  ' -- $candidates) >&2
        return 127
    end
    set -l chosen (printf '%s\\n' $candidates | __ward_picker $prompt $query)
    # Backing out of the picker is a choice, not a failure: say nothing.
    test -n "$chosen"; or return 130
    echo $chosen
end`,
};

const workspaceRoot: ShellHelper = {
  name: '__ward_workspace_root',
  summary: 'resolve a workspace name — or none — to its root, and print it',
  needs: [choose.name, pickerPresent.name],
  body: `function __ward_workspace_root --description 'Resolve a workspace name, or none, to its root; print it'
    set -l name $argv[1]
    set -l target
    if test -n "$name"
        set target (command ward workspace path $name)
    else if not __ward_picker_present
        # Nothing named and nothing to pick with: a bare \`ward workspace path\`
        # means the default workspace, which is the answer worth having.
        echo "ward: no picker installed — going to the default workspace" >&2
        set target (command ward workspace path)
        or return $status
    end
    if test -z "$target"
        set name (__ward_choose workspaces workspace "$name")
        or return $status
        set target (command ward workspace path $name)
        or return $status
    end
    echo $target
end`,
};

/**
 * Every helper, in the order the monolithic layer defines them — the picker
 * seam first, because it is the seam everything above it is written against.
 */
export const FISH_HELPERS: readonly ShellHelper[] = [pickerPresent, picker, choose, workspaceRoot];

// -- the shorthands ----------------------------------------------------------

const wrr: Shorthand = {
  name: 'wrr',
  summary: 'ward repo refresh, arguments and all, from any directory',
  needs: [],
  body: `function wrr --description 'ward repo refresh, from any directory'
    command ward repo refresh $argv
end`,
  // Wrapping, not re-describing: `wrr` inherits ward's own generated
  // completions for the command it forwards to, so the tree is never
  // described twice (0022). Install them with \`ward completion fish\`.
  completion: `complete -c wrr -w 'ward repo refresh'`,
};

const wrcd: Shorthand = {
  name: 'wrcd',
  summary: "cd to a repository's canonical checkout, from any directory",
  needs: [choose.name],
  body: `function wrcd --description 'cd to a repository checkout, from any directory'
    set -l name $argv[1]
    set -l target
    if test -n "$name"
        # Resolution is Ward's: exact, then a unique prefix, then a unique
        # substring, across the workspaces \`ward repo path\` searches. Its
        # stderr is deliberately not swallowed — an inexact match or a crossed
        # workspace is an implicit input, and reading why a name did not
        # resolve just before the picker opens is the point.
        set target (command ward repo path $name)
    end
    if test -z "$target"
        set name (__ward_choose repos repo "$name")
        or return $status
        set target (command ward repo path $name)
        or return $status
    end
    cd $target
end`,
  completion: `complete -c wrcd -f -a '(ward shell candidates repos)'`,
};

const wwcd: Shorthand = {
  name: 'wwcd',
  summary: 'cd to a workspace root, from any directory',
  needs: [workspaceRoot.name],
  // The resolution — name, picker, or the default — is `__ward_workspace_root`'s,
  // shared with `wws` (design/0034-workspace-session-shorthand/): two shorthands
  // that reach a workspace must not carry two answers to "which one?".
  body: `function wwcd --description 'cd to a workspace root, from any directory'
    set -l target (__ward_workspace_root $argv[1])
    or return $status
    cd $target
end`,
  completion: `complete -c wwcd -f -a '(ward shell candidates workspaces)'`,
};

const wws: Shorthand = {
  name: 'wws',
  summary: 'open a session in a workspace — cd to its root and start the agent there',
  needs: [workspaceRoot.name],
  body: `function wws --description 'Open a session in a workspace: cd to its root and start the agent there'
    # The first argument names the workspace unless it is a flag; everything
    # after it goes to \`ward session open\` untouched, so
    # \`wws main --purpose TEXT\` says what the session is for.
    set -l name
    if test (count $argv) -gt 0; and not string match -q -- '-*' $argv[1]
        set name $argv[1]
        set -e argv[1]
    end
    set -l target (__ward_workspace_root $name)
    or return $status
    # cd in the calling shell, not a subshell: when the agent exits you are
    # standing in the workspace, exactly where wwcd would have left you.
    cd $target
    or return $status
    command ward session open $argv
end`,
  completion: `complete -c wws -f -a '(ward shell candidates workspaces)'`,
};

/** The shorthand set, in the order both assemblies present them. */
export const FISH_SHORTHANDS: readonly Shorthand[] = [wrr, wrcd, wwcd, wws];

/** The adoptable names, for the parser's `choice` and for every refusal that lists them. */
export const FISH_SHORTHAND_NAMES: readonly string[] = FISH_SHORTHANDS.map(
  (shorthand) => shorthand.name,
);

/** One shorthand by name, or undefined — the caller decides how to refuse. */
export function findShorthand(name: string): Shorthand | undefined {
  return FISH_SHORTHANDS.find((shorthand) => shorthand.name === name);
}

/**
 * The helpers a shorthand needs, transitively, in `FISH_HELPERS` order.
 *
 * Transitively because the dependency is real and one level deep is a
 * coincidence: `wrcd` calls `__ward_choose`, which calls both picker
 * functions, and an adopted `wrcd.fish` that arrived without them would fail
 * the first time a name did not resolve — the exact moment the human is least
 * able to debug it. Declared order, not discovery order, so the answer is
 * deterministic (§6).
 */
export function helpersFor(shorthand: Shorthand): readonly ShellHelper[] {
  const wanted = new Set<string>();
  const walk = (names: readonly string[]): void => {
    for (const name of names) {
      if (wanted.has(name)) continue;
      wanted.add(name);
      const helper = FISH_HELPERS.find((candidate) => candidate.name === name);
      if (helper !== undefined) walk(helper.needs);
    }
  };
  walk(shorthand.needs);
  return FISH_HELPERS.filter((helper) => wanted.has(helper.name));
}
