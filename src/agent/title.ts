// The title of the caller's own terminal (design/0061-host-names-and-titles/).
// A run in the FOREGROUND has no host to title its terminal, and the terminal
// would otherwise show the command that started it — `ward`. So Ward names
// the terminal itself, with the one escape every terminal emulator and
// multiplexer reads (OSC 2), the instant before it hands the terminal over.
// What the run does with the title after that is the run's own business.
import { oneLine } from './labels.ts';

/** What a title is written to: a stream, and whether a terminal is reading it. */
export interface TitleSink {
  readonly isTTY?: boolean;
  write(text: string): unknown;
}

/** The escape that sets a terminal's title, with nothing in it that could end the escape early. */
export function titleEscape(title: string): string {
  return `\u001b]2;${oneLine(title)}\u0007`;
}

/**
 * Title the terminal — only when one is there. Piped or captured output gets
 * no escape: a title is for a human's eyes, and bytes in a pipe are data.
 */
export function setTerminalTitle(title: string, sink: TitleSink = process.stdout): boolean {
  if (sink.isTTY !== true) return false;
  sink.write(titleEscape(title));
  return true;
}
