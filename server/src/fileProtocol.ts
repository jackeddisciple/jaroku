// Incremental parser for the file-emission protocol:
//
//     <<<FILE path="agent.py">>>
//     ...contents...
//     <<<ENDFILE>>>
//
// Delimiters rather than JSON on purpose: streaming *partial* JSON means escaping every
// newline in every source file, which is both fragile to parse mid-stream and materially
// more expensive in tokens for code payloads.
//
// The parser is fed arbitrary chunk boundaries, so the only subtle requirement is: never
// emit content that might turn out to be the front of a delimiter. It therefore holds back
// a tail of (delimiter length - 1) characters until it can prove they are content.

export type ProtocolEvent =
  | { type: "file_start"; path: string }
  | { type: "file_delta"; path: string; text: string }
  | { type: "file_end"; path: string };

// The newline after ">>>" is NOT consumed here. A chunk boundary can fall between ">>>" and
// that newline, and an optional `\n?` would then match early and leak the newline into the
// file body. It is stripped from the first delta instead (see stripLeadingNewline).
const OPEN_RE = /<<<FILE\s+path="([^"]+)"\s*>>>/;
const CLOSE = "<<<ENDFILE>>>";
// Longest prefix of an opening delimiter we might be holding mid-chunk.
const MAX_PARTIAL = Math.max(CLOSE.length, '<<<FILE path="'.length + 120);

export class FileProtocolParser {
  private buf = "";
  private current: string | null = null;
  private seen: string[] = [];
  // Text outside file blocks. Generation forbids it (and ignores it); the edit protocol
  // uses the line before the first block as the change summary.
  private proseParts: string[] = [];
  // Set right after an opening delimiter: the first content character may be the newline
  // that terminated that delimiter line, and belongs to the protocol, not the file.
  private stripLeadingNewline = false;

  constructor(private readonly emit: (event: ProtocolEvent) => void) {}

  get openFile(): string | null {
    return this.current;
  }

  get files(): string[] {
    return [...this.seen];
  }

  /** Everything the model wrote outside file blocks, in order. Complete only after finish(). */
  get prose(): string {
    return this.proseParts.join("");
  }

  push(chunk: string): void {
    this.buf += chunk;

    for (;;) {
      if (this.current === null) {
        const match = OPEN_RE.exec(this.buf);
        if (!match) {
          // Prose outside a file block is captured (the edit flow reads it as the summary
          // line; generation ignores it), keeping a tail that could be the start of an
          // opening delimiter split across chunks.
          if (this.buf.length > MAX_PARTIAL) {
            this.proseParts.push(this.buf.slice(0, this.buf.length - MAX_PARTIAL));
            this.buf = this.buf.slice(this.buf.length - MAX_PARTIAL);
          }
          return;
        }
        this.current = match[1]!;
        this.seen.push(this.current);
        if (match.index > 0) this.proseParts.push(this.buf.slice(0, match.index));
        this.buf = this.buf.slice(match.index + match[0].length);
        this.stripLeadingNewline = true;
        this.emit({ type: "file_start", path: this.current });
        continue;
      }

      // Consume the delimiter's own line ending, once we can actually see it.
      if (this.stripLeadingNewline) {
        if (this.buf.startsWith("\r\n")) this.buf = this.buf.slice(2);
        else if (this.buf.startsWith("\n")) this.buf = this.buf.slice(1);
        else if (this.buf.length === 0) return; // wait for the next chunk to decide
        this.stripLeadingNewline = false;
      }

      const close = this.buf.indexOf(CLOSE);
      if (close >= 0) {
        const text = this.buf.slice(0, close);
        if (text) this.emit({ type: "file_delta", path: this.current, text });
        this.emit({ type: "file_end", path: this.current });
        this.buf = this.buf.slice(close + CLOSE.length);
        this.current = null;
        continue;
      }

      // No close yet — emit everything except a possible partial delimiter.
      const safe = this.buf.length - (CLOSE.length - 1);
      if (safe > 0) {
        this.emit({ type: "file_delta", path: this.current, text: this.buf.slice(0, safe) });
        this.buf = this.buf.slice(safe);
      }
      return;
    }
  }

  /**
   * Call when the model stream ends. Returns an error string if a file was left open.
   * `allowEmpty` accepts a zero-file response (a valid "no-op" edit — the summary line
   * explains why); generation keeps treating it as an error.
   */
  finish(opts?: { allowEmpty?: boolean }): string | null {
    if (this.current !== null) {
      return `stream ended inside ${this.current} (no ${CLOSE}) — generation was truncated`;
    }
    // Whatever is left in the buffer is trailing prose, not a partial delimiter.
    if (this.buf) {
      this.proseParts.push(this.buf);
      this.buf = "";
    }
    if (this.seen.length === 0 && !opts?.allowEmpty) return "the model produced no files";
    return null;
  }
}
