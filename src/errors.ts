// The one error type the CLI presents to the user: a WardError's message is
// complete and legible on its own. Anything else escaping to the top is a bug
// and is allowed to crash with a stack trace (design/0002-store-and-workspace/).
export class WardError extends Error {}
