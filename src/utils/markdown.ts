/**
 * Minimal in-house Markdown tokenizer for task descriptions.
 *
 * Deliberately dependency-free and React-free: the same tokenizer powers the
 * rich renderer (`MarkdownDescription`) and every plain-text consumer through
 * `stripMarkdown()`, and it has to stay unit-testable under the Vitest include
 * pattern, which only picks up `.ts` test files.
 *
 * Supported: headings (`#`–`###`), blockquotes, thematic breaks (`---`), bold,
 * italic, strikethrough, inline code, fenced code blocks, bulleted, numbered and
 * task lists (`- [ ]` / `- [x]`) with nesting, `[text](url)` links, bare-URL
 * autolinks and line breaks. Everything else (tables, images, setext headings,
 * lazy continuations, unclosed markup) degrades to plain text without dropping
 * characters.
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

export interface ListItem {
  children: InlineToken[];
  /** set only for task-list items — `- [ ]` / `- [x]`; plain items leave it undefined */
  checked?: boolean;
  /** blocks nested inside the item; today only `list` ever lands here */
  blocks?: Token[];
}

export type Token =
  | { type: "paragraph"; children: InlineToken[] }
  | { type: "heading"; level: 1 | 2 | 3; children: InlineToken[] }
  | { type: "blockquote"; children: Token[] }
  | { type: "thematicBreak" }
  | { type: "codeBlock"; value: string }
  | { type: "list"; ordered: boolean; start?: number; items: ListItem[] };

type ListToken = Extract<Token, { type: "list" }>;

const FENCE_REGEX = /^\s*```/;
const FENCE_CLOSE_REGEX = /^\s*```\s*$/;
const HEADING_REGEX = /^ {0,3}(#{1,3})[ \t]+(.*)$/;
const QUOTE_REGEX = /^ {0,3}>[ \t]?(.*)$/;
const THEMATIC_BREAK_REGEX = /^ {0,3}-{3,}[ \t]*$/;
// list indentation is load-bearing for nesting, so it is captured, not skipped
const ORDERED_ITEM_REGEX = /^([ \t]*)(\d{1,9})[.)][ \t]+(.*)$/;
const BULLET_ITEM_REGEX = /^([ \t]*)([-*+])[ \t]+(.*)$/;
const TASK_MARKER_REGEX = /^\[([ xX])\](?:[ \t]+(.*))?$/;
const INLINE_LINK_REGEX = /^\[([^\]\n]*)\]\(([^()\s]*)\)/;
const IMAGE_REGEX = /^!\[([^\]\n]*)\]\(([^()\s]*)\)/;
// the trailing character class keeps sentence punctuation out of the url
const AUTOLINK_REGEX = /^https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"]/i;

/** a quote deeper than this stops being a quote and degrades to plain text */
const MAX_QUOTE_DEPTH = 4;
/** columns a list item must gain over the open level to nest under it */
const NEST_INDENT = 2;

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

/** one recognised list line, before the nesting tree is built */
interface ListEntry {
  indent: number;
  ordered: boolean;
  start?: number;
  checked?: boolean;
  content: string;
}

/** Indent width in columns; a tab counts as four, so both notations nest alike. */
const indentWidth = (prefix: string): number =>
  [...prefix].reduce((width, char) => width + (char === "\t" ? 4 : 1), 0);

/**
 * Recognises a single list line. The task marker is only honoured on bulleted
 * items, so `1. [ ] a` stays an ordinary item whose text is `[ ] a` (as in GFM).
 */
const matchListLine = (line: string): ListEntry | null => {
  // ordered is checked first so `1.` never reads as a bullet
  const ordered = ORDERED_ITEM_REGEX.exec(line);
  if (ordered) {
    return {
      indent: indentWidth(ordered[1]),
      ordered: true,
      start: Number(ordered[2]),
      content: ordered[3],
    };
  }

  const bullet = BULLET_ITEM_REGEX.exec(line);
  if (!bullet) return null;

  const task = TASK_MARKER_REGEX.exec(bullet[3]);
  if (task) {
    return {
      indent: indentWidth(bullet[1]),
      ordered: false,
      checked: task[1].toLowerCase() === "x",
      content: task[2] ?? "",
    };
  }
  return { indent: indentWidth(bullet[1]), ordered: false, content: bullet[3] };
};

const newList = (entry: ListEntry): ListToken => ({
  type: "list",
  ordered: entry.ordered,
  start: entry.ordered ? entry.start : undefined,
  items: [],
});

/**
 * Folds a flat run of list lines into a tree. Ragged indentation normalises to
 * the nearest open level, which is unambiguous and never drops a character.
 */
const buildList = (entries: ListEntry[]): ListToken => {
  const root = newList(entries[0]);
  const stack: { indent: number; list: ListToken }[] = [{ indent: entries[0].indent, list: root }];

  for (const entry of entries) {
    // leave every level deeper than this line
    while (stack.length > 1 && entry.indent < stack[stack.length - 1].indent) stack.pop();
    let top = stack[stack.length - 1];

    if (entry.indent >= top.indent + NEST_INDENT && top.list.items.length > 0) {
      const parent = top.list.items[top.list.items.length - 1];
      const blocks = (parent.blocks ??= []);
      const last = blocks[blocks.length - 1];
      let child: ListToken;
      if (last && last.type === "list" && last.ordered === entry.ordered) {
        child = last;
      } else {
        child = newList(entry);
        blocks.push(child);
      }
      stack.push({ indent: entry.indent, list: child });
      top = stack[stack.length - 1];
    } else if (entry.ordered !== top.list.ordered && stack.length > 1) {
      // a flavour switch on a nested level opens a sibling list under the same
      // parent item; on the base level the run has already been cut short
      const owner = stack[stack.length - 2].list;
      const parent = owner.items[owner.items.length - 1];
      const sibling = newList(entry);
      (parent.blocks ??= []).push(sibling);
      stack[stack.length - 1] = { indent: top.indent, list: sibling };
      top = stack[stack.length - 1];
    }

    top.list.items.push({ children: parseInline(entry.content), checked: entry.checked });
  }

  return root;
};

/**
 * Parses a block of lines. Blockquotes recurse with the `>` prefix stripped, so
 * every construct works inside a quote for free.
 */
function parseBlocks(lines: string[], quoteDepth: number): Token[] {
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

    // thematic break — before lists, so `---` never reads as a bullet marker
    if (THEMATIC_BREAK_REGEX.test(line)) {
      flushParagraph();
      tokens.push({ type: "thematicBreak" });
      i++;
      continue;
    }

    const heading = HEADING_REGEX.exec(line);
    if (heading) {
      flushParagraph();
      tokens.push({
        type: "heading",
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2]),
      });
      i++;
      continue;
    }

    // blockquote — consecutive `>` lines are re-parsed one level deeper
    if (quoteDepth < MAX_QUOTE_DEPTH) {
      const quote = QUOTE_REGEX.exec(line);
      if (quote) {
        flushParagraph();
        const inner: string[] = [];
        let quoted: RegExpExecArray | null = quote;
        while (quoted) {
          inner.push(quoted[1]);
          i++;
          quoted = i < lines.length ? QUOTE_REGEX.exec(lines[i]) : null;
        }
        tokens.push({ type: "blockquote", children: parseBlocks(inner, quoteDepth + 1) });
        continue;
      }
    }

    // lists — consecutive item lines form one run, folded into a tree afterwards
    const first = matchListLine(line);
    if (first) {
      flushParagraph();
      const entries: ListEntry[] = [];
      let entry: ListEntry | null = first;
      while (entry) {
        // a flavour switch that is not deep enough to nest closes the list
        if (
          entries.length &&
          entry.indent < first.indent + NEST_INDENT &&
          entry.ordered !== first.ordered
        ) {
          break;
        }
        entries.push(entry);
        i++;
        entry = i < lines.length ? matchListLine(lines[i]) : null;
      }
      tokens.push(buildList(entries));
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

/** Parses description text into block tokens. */
export function parseMarkdown(text: string): Token[] {
  if (!text) return [];
  return parseBlocks(text.split(/\r\n|\r|\n/), 0);
}

/** One line of visible text per block; a thematic break contributes nothing. */
const stripTokens = (tokens: Token[]): string[] =>
  tokens.flatMap((token) => {
    switch (token.type) {
      case "paragraph":
      case "heading":
        return [inlineText(token.children)];
      case "blockquote":
        return stripTokens(token.children);
      case "thematicBreak":
        return [];
      case "codeBlock":
        return [token.value];
      case "list":
        return stripItems(token.items);
    }
  });

const stripItems = (items: ListItem[]): string[] =>
  items.flatMap((item) => [inlineText(item.children), ...stripTokens(item.blocks ?? [])]);

/** Same tokenizer, but returns only the visible text — no markup characters. */
export function stripMarkdown(text: string): string {
  return stripTokens(parseMarkdown(text)).join("\n");
}
