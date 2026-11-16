# 0064 — Floor identity: an emoji of the floor's own, and a ground floor that looks the same everywhere

> A floor's emoji is chosen by whoever opens it, to fit what the floor is about, and no two open
> floors share one; Ward's own set is the fallback. The ground floor wears one reserved identity in
> every workspace. Every terminal title leads with the floor's emoji.
>
> **Status:** built — awaiting review · **Started:** 2026-11-15

Floor identity ([0060](../0060-floor-identity/README.md)) gave each floor a color and an emoji, with
ten of each. A workspace with thirteen open floors showed what that leaves out: the eleventh floor
repeats the first floor's color, which 0060 accepted, and also its emoji, so two floors side by side
were told apart by nothing. The [visual-theming](../../intent/02-subsystems/05-visual-theming.md)
seam has since settled what 0060's intent feedback asked: a floor may carry a per-instance glyph,
and the glyph is then held to the accent's standard of staying distinct among what is seen together.
The color cannot stay distinct past the size of a palette that is small on purpose. The emoji can,
since there are far more of them than floors.

Three things follow, and this entry builds them. An emoji drawn from a list says nothing about the
floor, while the one who opens a floor knows what it is for, so the open takes the emoji and the
list becomes what Ward falls back on. The ground floor is the one floor every workspace has, and it
took whatever came first in the pool; it now wears an identity of its own that is the same in every
workspace. And the title of a terminal, which a tab cuts to its first few cells, put the emoji in
its second segment ([0061](../0061-host-names-and-titles/README.md)); it now leads with it.

It supersedes three choices and nothing else: 0060's assignment rule for the emoji, 0060's "the
emoji is free" for the part that let two floors share one or wear a sequence a terminal measures
wrongly, and 0061's "the title leads with the window".

## Serves intent

- [`visual-theming`](../../intent/02-subsystems/05-visual-theming.md): the per-instance glyph is
  recorded, nameable, and kept distinct among the open floors at every write Ward makes or accepts,
  and an existing workspace is converged to that by an idempotent step.
- [`domain-model`](../../intent/01-concepts/00-domain-model.md): the ground floor is the standing
  project present in every workspace; its identity is now as fixed as its number.
- [`workspace-lifecycle`](../../intent/01-concepts/06-workspace-lifecycle.md): an existing workspace
  reaches the new rules through the upgrade's convergence, which names each record it rewrites.
- [`session-multiplexer`](../../intent/02-subsystems/01-session-multiplexer.md): sessions are
  labeled as a human recognizes the work, with the cue that tells floors apart where the eye lands
  first.
- [`human-shell`](../../intent/02-subsystems/07-human-shell.md): the manifest tells an agent that
  opening a floor includes choosing its emoji, with the one command that does it.

## Scope

- **In:**
  - `ward project open SLUG [--emoji EMOJI] [--color COLOR]`: the opener's choice is recorded, and
    Ward picks whatever is not named.
  - One rule for an emoji a floor is given, at open and at `ward project identity`: a single code
    point that presents as an emoji by itself, not the ground floor's, and not worn by another open
    floor. Each refusal says which rule and, for a worn emoji, names the floor that wears it.
  - A fallback set of forty emoji, four to a pool color, and an assignment that hands out one no
    open floor wears.
  - The ground floor's identity, `🔧 silver`: a color added to the palette and held out of the pool,
    an emoji held out of the fallback set, written at creation, and not changeable by the verb.
  - Convergence, in the existing `floor identities` step: the ground floor moves to its identity, a
    floor lacking an identity is given one, and a floor whose emoji a lower-numbered open floor
    wears is given another. The step's detail names each write with what it replaced and why.
  - Terminal titles lead with the floor's emoji: the host's, an attach view's, an observe view's,
    and the foreground one.
  - The workspace manifest's identity bullet, with the outgoing default added to its lineage.
- **Deferred:**
  - **More pool colors.** Ten stay ten. Past ten open floors a color repeats, and the emoji is what
    tells the two apart. Safe to defer because every added swatch is closer to its neighbours than
    the last, the name has to stay a word a human says, and the emoji now carries the burden the
    color cannot.
  - **A doctor finding for two open floors sharing an emoji.** Two machines that each open a floor
    before their records sync can still record the same one. Safe to defer because the next upgrade
    converges it and names what it changed, and nothing but the eye depends on the emoji.
  - **Re-validating an emoji already recorded.** A floor that wears a sequence the new rule would
    refuse (recorded by an earlier Ward) keeps it and its record still reads. Safe to defer because
    the human chose it and sees it; the verb changes it whenever they like.
  - **An "admin" display label for the ground floor.** See Decisions.
- **Acceptance:**
  1. `test/theme/palette.test.ts`: every fallback emoji is one Unicode 6.0 code point with default
     emoji presentation and none repeats; the ground floor's color and emoji are in the palette and
     out of the pool; `silver` holds 4.5:1 under its ink; the table of what a floor may be given.
  2. `test/workspace/floor-identity.test.ts`: forty floors opened in a row wear forty emoji, and
     eighty wear eighty distinct pairs; the verb's refusals; convergence on a thirteen-floor
     workspace as 0060 left it rewrites floors 0, 11 and 12 and no other, reports each, and is
     satisfied on the next run; a pick stays clear of a higher floor not yet reached.
  3. `test/cli/floor-identity.test.ts`: `project open --emoji`, `--color`, both, and each refusal
     opening nothing; the ground floor refused a change and re-dressed with no flag.
  4. `test/host/tmux.test.ts`, `test/agent/labels.test.ts`: the title string with and without an
     emoji, and the foreground title.
  5. `test/host/tmux-live.test.ts`, against a real tmux on a private server: a client on a pty is
     handed `🌊 alpha · <workspace> f1`; a standing host, a standing attach view and a standing
     observe view are retitled in place by one refresh, the observe view reading
     `🔧 coord · <workspace> f0 (observing)`.
  6. `mise run check` passes.

## Design

- **Decisions:** rests on [ADR 0006](../decisions/0006-tmux-detached-host.md). Entry-local:
  - **The opener chooses the emoji; Ward's set is the fallback.** A larger curated list was built
    first, and would have been enough to stop the repeats. It lost because a list can only be
    unrelated to the floor: the one opening a floor for fantasy football knows it wants a football,
    and an agent opening a floor can choose as well as a human. Ward calls no model, so "choose"
    means the caller passes `--emoji`. The cost is a refusal path at open that did not exist, and a
    manifest bullet that has to ask for the choice, since a flag nobody knows about is never passed.
  - **An emoji another open floor wears is refused, at open and at the verb.** Recording it and
    naming who shares it, as the verb does for a color, was attractive for symmetry. It lost on two
    counts. A color is drawn from ten, so sharing is forced and the human must be allowed to choose
    how; an emoji is drawn from more than a thousand, so the caller can always name another. And the
    upgrade gives a floor a new emoji when a lower floor wears its own, so a deliberate duplicate
    would be undone by the next upgrade, which is worse than being told no. The cost: a human who
    wants a floor's emoji must first move it off the floor that has it.
  - **A chosen emoji must be one code point with default emoji presentation.** 0060 accepted any
    single grapheme and left the width to the chooser. Measured on tmux 3.7 with
    `display -p '#{w:…}'`: `⚙️` (a variation selector) is counted one cell where a terminal draws
    two, and `👩‍💻` and `👍🏽` four where a terminal draws two. Either way the status line and the title
    are laid out to a width the terminal does not draw. Accepting them and documenting the risk lost
    because the failure is a misaligned bar on a surface seen all day, and the refusal costs the
    caller one retry with the reason in hand. A flag is refused as not one emoji. The rule is a
    property test (`\p{Emoji_Presentation}`, one code point), so it admits an emoji newer than a
    given terminal's Unicode tables; that remains the chooser's trade.
  - **The fallback set is forty: four to a color.** It has to be large enough that a floor opened
    with no emoji named is never handed one an open floor wears, for a few dozen open floors, and no
    larger. Each color keeps the emoji 0060 gave it as its first choice, so a workspace that never
    passes `--emoji` is assigned as before for its first ten floors. Every member is one Unicode 6.0
    code point with emoji presentation (measured two cells wide on tmux), a thing with a plain name,
    no face or hand, no mark that reads as a state, and no tool. Within a row the four differ in
    outline, because a row is what tells two floors of one color apart and the reader who most needs
    the emoji is the one who cannot rely on hue.
  - **Assignment prefers the color's own row, then the rest of the set from the back.** The color is
    still the pool color fewest open floors wear. The emoji is the first of that color's row no open
    floor wears; failing that, the first free one of the whole set, taking the last of each row
    before any color's first choice. Past forty an emoji repeats, and then it is the least-worn one
    that no floor of the same color wears, so a floor is never handed both the color and the emoji
    of another while a pair is left (four hundred of them).
  - **The ground floor wears `🔧 silver`, and neither half is in the pool.** The ground floor is
    where the workspace's own upkeep happens: upgrades, migrations, reflections. A wrench says
    maintenance without borrowing a mark that means a state, and it is one Unicode 6.0 code point.
    Silver (xterm 250 under dark ink, 11:1) is a neutral beside nine hues and a dark gray, so the
    floor reads as infrastructure and as not one of the projects; and the pair is a thing with a
    name, "the silver wrench". Reserving an existing color was the alternative: gray is the obvious
    one, and it lost because floors already wear it and would then share the reserved color, and
    because it would take the pool to nine. The cost is an eleventh palette name, which a Ward from
    before this entry does not know: see Mechanisms.
  - **`ward project identity 0` cannot change it.** Letting a human override it was attractive
    because every other identity is theirs to change. It lost because the point of the reservation
    is that the ground floor is the same wherever it is met: in another workspace, in a screenshot,
    in the manifest every agent reads, which can now say what floor 0 looks like. A per-workspace
    override makes that sentence false, and the upgrade would have to either undo it or stop
    converging the floor. With no flag, or with its own values, the verb still dresses the host as
    it does for any floor. No other floor can be given silver or the wrench, by `--emoji` at open,
    by `--color`, or by the verb; `project open --color` does not offer silver at all.
  - **Convergence touches a floor only for one of three stated reasons.** It is the ground floor and
    does not wear its identity; it lacks a color or an emoji; or a lower-numbered open floor wears
    its emoji. The lower floor keeps what it has because it had it first. A chosen emoji that
    nothing below repeats is never rewritten, and a floor keeps its color in every case but the
    ground floor's. Each pick is made clear of every other open floor, including higher ones the
    walk has not reached, so the walk cannot make a duplicate that a later iteration then has to
    move. A second run finds nothing to do.
  - **A title leads with the floor's emoji.** 0061 led with the window's name, on the reasoning that
    a tab shows the head of a title and the window is the specific thing. In use the tab is narrower
    than the window's name, and with several floors open the first question is which floor. The
    emoji answers it in two cells, so it goes first: `🌸 ward-development · main f7 · <pane title>`
    where 0061 and 0060 gave `ward-development · 🌸 main f7 · <pane title>`. The window's name still
    comes before where it stands. Putting it on the window's name instead lost because a window name
    is shared by every host the window is linked into, and the coordinator's window is linked into
    all of them. The foreground title follows: `🌸 f7 ward-development · main`, the emoji set apart
    from the address by a space, where it was `🌸f7 ward-development · main`. A floor with no emoji
    has no lead and no gap. Window names, host names and the status line are unchanged.
  - **No "admin" label.** The ground floor is named "ground floor" in the intent, the glossary, the
    manifest, and on every listing (`(ground floor)`), and its slug is `workspace`. Showing "admin"
    would be one more string in two functions (the listing's note and the host's status label). It
    was not built because it gives one concept a second name that no record and no document uses,
    and the reserved identity already does what the word was for: the floor is recognizable as the
    workspace's own. If the word is wanted, the smallest honest form is to change the listing note
    to `(ground floor · admin)` and leave slug, directory and host name alone.
- **Layout:**
  - `src/theme/palette.ts` stays the leaf. It now separates what a record may carry (`FLOOR_COLORS`,
    eleven names) from what assignment draws on (`POOL_COLORS`, `POOL_EMOJI`), and holds
    `GROUND_IDENTITY` and the test of an emoji a floor may be given (`isPlainEmoji`). The record's
    schema keeps the looser single-grapheme test, so no existing record stops reading.
  - `src/workspace/floor-identity.ts` owns every rule about who may wear what: assignment, the
    identity at open, the verb, and convergence. `openProject` asks it for an identity and holds no
    rule itself.
  - The host seam is unchanged in shape. A group's `title` no longer carries the emoji; the adapter
    takes it from the `identity` the group or view already carries, so where the emoji stands in a
    title is `src/host/tmux.ts`'s alone, beside the format string it belongs to.
- **Mechanisms:**
  - **Refusal before the lock, and before the number.** At open, the color and emoji are validated
    before the store lock is taken, and the worn-emoji check runs under it before the floor's number
    is allocated, so a refused open writes nothing.
  - **Titles reach standing hosts and views through 0063's refresh.** The title is a session option
    set again on every hosted launch, every attach, and every run of `ward project identity`, on the
    host and on each view found for it. Nothing new walks tmux. Because the option is the session's,
    the coordinator's one window is titled with the emoji of whichever host it is seen through.
  - **The upgrade's writes are on the workspace's main line**, in the convergence commit, as 0060's
    backfill was; the manifest reaches the stewardship branch as before.
  - **A Ward from before this entry cannot read `color: silver`.** The record schema is a closed
    enum, so once a workspace is upgraded an older binary refuses the ground floor's record on every
    read. Every machine sharing a workspace has to run a Ward with this entry before or with the
    upgrade. This is the cost of a reserved color that is not one of the ten, and it was accepted
    over reserving gray for the reasons above.
  - **Lineage.** The manifest default of 0060 is the newest entry of the `AGENTS.md` lineage, so an
    untouched manifest is brought forward by the upgrade's artifact pass.
