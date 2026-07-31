/**
 * Minimal in-house Markdown tokenizer for task descriptions.
 *
 * Deliberately dependency-free and React-free: the same tokenizer powers the
 * rich renderer (`MarkdownDescription`) and every plain-text consumer through
 * `stripMarkdown()`, and it has to stay unit-testable under the Vitest include
 * pattern, which only picks up `.ts` test files.
 *
 * Supported: bold, italic, strikethrough, inline code, fenced code blocks,
 * bulleted and numbered lists, `[text](url)` links, bare-URL autolinks and line
 * breaks. Everything else (headings, tables, quotes, images, nested lists,
 * unclosed markup) degrades to plain text without dropping characters.
 */

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "strong"; children: InlineToken[] }
  | { type: "em"; children: InlineToken[] }
  | { type: "del"; children: InlineToken[] }
  | { type: "codeSpan"; value: string }
  | { type: "link"; href: string; label: string }
  | { type: "autolink"; href: string }
  | { type: "break" };

export type Token =
  | { type: "paragraph"; children: InlineToken[] }
  | { type: "codeBlock"; value: string }
  | { type: "list"; ordered: boolean; start?: number; items: InlineToken[][] };

const FENCE_REGEX = /^\s*```/;
const FENCE_CLOSE_REGEX = /^\s*```\s*$/;
const ORDERED_ITEM_REGEX = /^ {0,3}(\d{1,9})[.)][ \t]+(.*)$/;
const BULLET_ITEM_REGEX = /^ {0,3}([-*+])[ \t]+(.*)$/;
const INLINE_LINK_REGEX = /^\[([^\]\n]*)\]\(([^()\s]*)\)/;
const IMAGE_REGEX = /^!\[([^\]\n]*)\]\(([^()\s]*)\)/;
// the trailing character class keeps sentence punctuation out of the url
const AUTOLINK_REGEX = /^https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/i;

/**
 * Drops every character up to and including U+0020. Browsers ignore those
 * inside a scheme, so `java<TAB>script:` would otherwise slip past the
 * allow-list below.
 */
const stripControlChars = (value: string): string =>
  [...value].filter((char) => char.charCodeAt(0) > 0x20).join("");

/** Link protocol allow-list — anything else is rendered as text, never as an anchor. */
const isSafeHref = (href: string): boolean => /^(https?:|mailto:)/i.test(stripControlChars(href));

const isWhitespace = (char: string | undefined): boolean => char !== undefined && /\s/.test(char);

const EMPHASIS_MARKERS = [
  { marker: "**", type: "strong" },
  { marker: "~~", type: "del" },
  { marker: "*", type: "em" },
] as const;

/** Index of the closing marker, or -1. For `*`, occurrences inside a `**` run are skipped. */
const findClosingMarker = (src: string, marker: string, from: number): number => {
  if (marker !== "*") return src.indexOf(marker, from);
  for (let i = from; i < src.length; i++) {
    if (src[i] !== "*" || src[i - 1] === "*" || src[i + 1] === "*") continue;
    return i;
  }
  return -1;
};

/** Visible text of a list of inline tokens — markup characters removed. */
const inlineText = (tokens: InlineToken[]): string =>
  tokens
    .map((token) => {
      switch (token.type) {
        case "text":
        case "codeSpan":
          return token.value;
        case "strong":
        case "em":
        case "del":
          return inlineText(token.children);
        case "link":
          return token.label;
        case "autolink":
          return token.href;
        case "break":
          return "\n";
      }
    })
    .join("");

const parseInline = (src: string): InlineToken[] => {
  const tokens: InlineToken[] = [];
  let buffer = "";

  const flush = () => {
    if (buffer) {
      tokens.push({ type: "text", value: buffer });
      buffer = "";
    }
  };

  let i = 0;
  scan: while (i < src.length) {
    const char = src[i];

    // line break
    if (char === "\n") {
      flush();
      tokens.push({ type: "break" });
      i++;
      continue;
    }

    // inline code — wins over every other marker
    if (char === "`") {
      const close = src.indexOf("`", i + 1);
      if (close > i + 1) {
        flush();
        tokens.push({ type: "codeSpan", value: src.slice(i + 1, close) });
        i = close + 1;
        continue;
      }
    }

    // emphasis
    if (char === "*" || char === "~") {
      for (const { marker, type } of EMPHASIS_MARKERS) {
        if (!src.startsWith(marker, i)) continue;
        const contentStart = i + marker.length;
        const first = src[contentStart];
        // `****` / `~~~~`, and a marker followed by whitespace, stay literal
        if (first === undefined || first === marker[0] || isWhitespace(first)) continue;
        const close = findClosingMarker(src, marker, contentStart);
        if (close === -1 || close === contentStart || isWhitespace(src[close - 1])) continue;
        flush();
        tokens.push({ type, children: parseInline(src.slice(contentStart, close)) });
        i = close + marker.length;
        continue scan;
      }
    }

    // images are unsupported: keep the match verbatim, which also stops the url
    // inside it from becoming an autolink
    if (char === "!") {
      const image = IMAGE_REGEX.exec(src.slice(i));
      if (image) {
        buffer += image[0];
        i += image[0].length;
        continue;
      }
    }

    // links
    if (char === "[") {
      const link = INLINE_LINK_REGEX.exec(src.slice(i));
      if (link) {
        const href = stripControlChars(link[2]);
        if (isSafeHref(href)) {
          flush();
          tokens.push({ type: "link", href, label: inlineText(parseInline(link[1])) });
        } else {
          // an unsafe link stays visible text, never an anchor, losing no characters
          buffer += link[0];
        }
        i += link[0].length;
        continue;
      }
    }

    // bare url
    if (char === "h" || char === "H") {
      const autolink = AUTOLINK_REGEX.exec(src.slice(i));
      if (autolink) {
        flush();
        tokens.push({ type: "autolink", href: autolink[0] });
        i += autolink[0].length;
        continue;
      }
    }

    buffer += char;
    i++;
  }

  flush();
  return tokens;
};

/** Parses description text into block tokens. */
export function parseMarkdown(text: string): Token[] {
  if (!text) return [];

  const lines = text.split(/\r\n|\r|\n/);
  const tokens: Token[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      tokens.push({ type: "paragraph", children: parseInline(paragraph.join("\n")) });
      paragraph = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // fenced code block — an unclosed fence runs to the end of the text
    if (FENCE_REGEX.test(line)) {
      flushParagraph();
      i++;
      const code: string[] = [];
      while (i < lines.length && !FENCE_CLOSE_REGEX.test(lines[i])) {
        code.push(lines[i]);
        i++;
      }
      i++; // skip the closing fence when there is one
      tokens.push({ type: "codeBlock", value: code.join("\n") });
      continue;
    }

    // lists — ordered is checked first so `1.` never reads as a bullet.
    // consecutive lines of the same flavour form one flat list
    const ordered = ORDERED_ITEM_REGEX.exec(line);
    let match = ordered ?? BULLET_ITEM_REGEX.exec(line);
    if (match) {
      flushParagraph();
      const itemRegex = ordered ? ORDERED_ITEM_REGEX : BULLET_ITEM_REGEX;
      const start = ordered ? Number(ordered[1]) : undefined;
      const items: InlineToken[][] = [];
      while (match) {
        items.push(parseInline(match[2]));
        i++;
        match = i < lines.length ? itemRegex.exec(lines[i]) : null;
      }
      tokens.push({ type: "list", ordered: ordered !== null, start, items });
      continue;
    }

    if (line.trim() === "") {
      flushParagraph();
    } else {
      paragraph.push(line);
    }
    i++;
  }

  flushParagraph();
  return tokens;
}

/** Same tokenizer, but returns only the visible text — no markup characters. */
export function stripMarkdown(text: string): string {
  return parseMarkdown(text)
    .map((token) => {
      switch (token.type) {
        case "paragraph":
          return inlineText(token.children);
        case "codeBlock":
          return token.value;
        case "list":
          return token.items.map(inlineText).join("\n");
      }
    })
    .join("\n");
}
