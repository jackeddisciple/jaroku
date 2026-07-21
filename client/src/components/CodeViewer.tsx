// Read-only code viewer with shiki highlighting (doc §8).
//
// Two deliberate choices:
//   * shiki is dynamically imported and loads only the four grammars a generated project
//     can contain. The highlighter is a module-level singleton — creating one per mount
//     would re-parse the grammars on every file switch.
//   * While a file is still streaming it renders as plain text and only gets highlighted
//     once complete. Re-tokenizing a whole file on every delta is wasted work, and
//     half-written Python highlights wrong anyway (an unclosed string colours the rest of
//     the file). Streaming stays fast; the highlight lands the moment the file closes.

import { useEffect, useState } from "react";
import { useBuildStore } from "../store/buildStore.ts";

const LANGS = ["python", "json", "markdown", "toml"] as const;
const THEME = "vitesse-dark"; // muted, close to the app's near-black palette

type Highlighter = { codeToHtml: (code: string, opts: { lang: string; theme: string }) => string };

let highlighterPromise: Promise<Highlighter> | null = null;

function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((shiki) =>
      shiki.createHighlighter({ themes: [THEME], langs: [...LANGS] }),
    ) as Promise<Highlighter>;
  }
  return highlighterPromise;
}

function langFor(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".toml")) return "toml";
  return "text";
}

export function CodeViewer() {
  const activeFile = useBuildStore((s) => s.activeFile);
  const file = useBuildStore((s) => (s.activeFile ? s.files[s.activeFile] : undefined));
  const [html, setHtml] = useState<string | null>(null);

  const content = file?.content ?? "";
  const complete = file?.complete ?? false;
  const lang = activeFile ? langFor(activeFile) : "text";

  useEffect(() => {
    // Only highlight finished files in a supported language.
    if (!complete || lang === "text" || !content) {
      setHtml(null);
      return;
    }
    let cancelled = false;
    getHighlighter()
      .then((h) => {
        if (!cancelled) setHtml(h.codeToHtml(content, { lang, theme: THEME }));
      })
      .catch(() => {
        if (!cancelled) setHtml(null); // fall back to plain text; never blank the pane
      });
    return () => {
      cancelled = true;
    };
  }, [content, complete, lang]);

  if (!file) {
    return (
      <div className="flex h-full items-center justify-center px-6 text-[12px] text-muted">
        Select a file to view it.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-6 py-2 shrink-0 border-b border-hair">
        <span className="text-ink text-[12px] truncate">{file.path}</span>
        <span className="text-faint text-[11px] shrink-0">{lang}</span>
        {!complete && <span className="text-run text-[11px] animate-pulse shrink-0">writing…</span>}
        <span className="ml-auto text-faint text-[11px] shrink-0 tabular-nums">
          {content.split("\n").length} lines
        </span>
      </div>

      <div className="flex-1 overflow-auto px-6 py-4 text-[12px] leading-relaxed">
        {html ? (
          <div className="shiki-host [&_pre]:!bg-transparent" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <pre className="whitespace-pre text-ink">{content}</pre>
        )}
      </div>
    </div>
  );
}
