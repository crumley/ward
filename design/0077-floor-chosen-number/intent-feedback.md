# 0077 — Intent feedback

> Intent frictions found while building a floor opened at a chosen number.

This file is the entry's adjudication surface and is read on its own. An adjudication session loads
it without the entry's README, so each intent-feedback item carries enough context to be ruled on
directly.

The build: `ward project open SLUG --floor N` opens a floor at N when the record has never spent N.
A number is spent when a floor holds it (open or closed), when a record retired it (`previousFloor`,
the number the standing project left when it moved to floor 0), or when a `projects/<N>-*` directory
leads with it even though its record does not read. `0` stays reserved, and choices above 999 are
refused. Left unchosen, a floor takes one past the highest number ever spent.

## IF-001 — "monotonic" assumes Ward assigns every floor number

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_: "**Floor numbers are monotonic and never reused.** A closed project's floor number
  is retired — retained for history — and the next project takes the next number", the floor-`0`
  paragraph ("they are allocated monotonically from `1`, and never reused"), and the identity table
  row for Project ("**monotonic, never reused**"). The same word appears in
  [`glossary.md`](../../intent/00-foundation/glossary.md) (_Floor_),
  [`open-questions.md`](../../intent/00-foundation/open-questions.md) (_Identity edges closed_) and
  [`04-walkthrough-delivering-work.md`](../../intent/04-walkthrough-delivering-work.md) (§1).
- **Friction:** the slice's _why_ is about reuse: a reused floor number would make every historical
  room address under it ambiguous. Monotonic, meaning each new floor is numbered above every earlier
  one, is a property of an allocator that hands out every number, and it does not hold once an
  opener can choose. A floor opened at 5 after floor 12 is never a reuse, but it is not monotonic
  either. The _why_ still holds in full. Only the word over-states the rule.
- **Assumption made to keep moving:** "never reused" is the invariant, and "monotonic" describes the
  default numbering only. A choice is accepted whenever the record has never spent the number,
  whether it is above or below the highest.
- **Proposed revision:** in _Identity_, replace the bold sentence and the one after it with:
  "**Floor numbers are never reused.** A closed project's floor number is retired — retained for
  history. A floor takes the next number unless its opener chooses one, and a chosen number must be
  one the workspace has never spent." In the floor-`0` paragraph, read "they are numbered from `1`,
  and never reused". In the table row, read "**never reused**". Make the same edit in the glossary
  (_Floor_: "Floor numbers are **never reused** — a closed floor's number is retired"), in
  open-questions ("**Floor numbers are never reused**"), and in the walkthrough ("its floor number,
  never reused").
- **Status:** pending.

## IF-002 — what "the next number" is once numbers can be chosen

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_: "the next project takes the next number".
- **Friction:** with every number assigned in order, "the next number" has one reading. Once an
  opener can choose, it has two: one past the highest number ever spent, or the lowest number never
  spent, which fills the gaps choices leave. They give different answers in any workspace that has
  made a choice. After floors 1–3 and a chosen 40, the first gives 41 and the second gives 4. The
  slice does not say which, and the reasons for each are identity reasons, so they belong in intent.
  Filling gaps keeps numbers short. Going past the highest keeps the numbers in opening order, so a
  higher number is always a later floor among the unchosen ones, and it leaves a gap a workspace
  reserved for a convention untouched.
- **Assumption made to keep moving:** one past the highest number ever spent, a chosen number
  included, which is what the allocator did before choices existed. To keep one mistyped choice from
  moving every later floor, choices are capped at 999 (a design limit, not proposed here).
- **Proposed revision:** after the sentence IF-001 proposes, add: "Left unchosen, a floor takes one
  past the highest number the workspace has ever spent, a chosen number included. **Why:** numbers
  Ward picks then run in opening order, and a gap a workspace has left for its own convention is
  never filled behind its back."
- **Status:** pending.

## IF-003 — the ordering paragraph says no low floor can be had

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_, "The ordering of floors carries no semantics Ward assigns": "Ward cannot allocate
  'the next low floor' without breaking the rule that makes historical room addresses trustworthy;
  the convention is a workspace's practice".
- **Friction:** the paragraph is right that Ward must not allocate into a range on a workspace's
  behalf. But it presents the convention as something a workspace can hold and never act on: with
  only the next number available, a workspace with "low numbers for what recurs" had no way to put a
  recurring floor on a low number. With a choice, the opener practises the convention and Ward
  enforces only never-reused. The paragraph's reasoning should now point at the choice rather than
  at impossibility.
- **Assumption made to keep moving:** Ward still neither enforces nor infers a convention. The
  opener applies it by choosing a number, and Ward checks only that the number was never spent.
- **Proposed revision:** replace the paragraph's **Why** with: "**Why:** a convention is a
  workspace's practice, written in its own guidance and applied by whoever opens a floor, who may
  choose its number. Ward does not pick a number by convention: it would have to know the
  convention, and a number it guessed into a range would still be a number spent."
- **Status:** pending.

## IF-004 — two machines can spend one floor number, and the slice does not say what follows

- **Slice:** [`intent/01-concepts/00-domain-model.md`](../../intent/01-concepts/00-domain-model.md)
  — _Identity_. The room-collision paragraph ("Two machines can still fill one slot at once …")
  covers rooms, and the session rule ("two machines sharing one are two allocators, each reading its
  own view") covers sessions. Nothing covers floors.
- **Friction:** floor numbers are allocated the same way rooms are, by each machine from its own
  copy of the record, so two machines that each open a floor before syncing produce two floors on
  one number. A chosen number makes this more likely, since two openers following one convention
  reach for the same number. The slice's own rule, never reused, is broken by such a collision
  without either machine reusing anything, and the room rule does not carry over: a room collision
  clears when all but one holder closes, but a floor number is retired, never freed, so a floor
  collision never clears by itself. The slice gives no rule for what names each floor meanwhile or
  how the collision ends.
- **Assumption made to keep moving:** the collision is tolerated and reported, as for rooms. Doctor
  names each floor by its directory (`projects/<N>-<slug>`). A verb given the number reaches the
  first by directory name, and task addresses on both floors stay nameable through the room rule
  (the slug-qualified address where a room is shared). It is resolved by giving all but one floor
  another number, which is a later entry's verb. No machine part is added to floor numbers.
- **Proposed revision:** after the room-collision paragraph, add: "Floors can collide the same way:
  two machines that each open a floor before their records meet can spend one number twice. A floor
  number does not empty the way a room does, since it is retired, never freed, so the collision does
  not clear by itself. It is broken by context meanwhile, the floor's slug beside its number, and
  ended by giving all but one of the floors a number of its own, which retires the number each one
  left. Ward reports a floor collision and never picks a winner silently."
- **Status:** pending.
