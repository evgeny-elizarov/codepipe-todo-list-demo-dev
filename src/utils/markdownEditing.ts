/**
 * Pure text-and-selection transforms behind the description formatting toolbar.
 *
 * Kept free of React and the DOM on purpose: Vitest in this repo only collects
 * `.ts` test files under `src/`, so everything worth testing has to live in a
 * `.ts` module and the toolbar component stays a thin wrapper that feeds it the
 * textarea's current value and selection.
 */

export type MarkdownAction =
  | "bold"
  | "italic"
  | "strikethrough"
  | "code"
  | "bulletList"
  | "checkList"
  | "heading"
  | "link";

/** A textarea's value together with its selection range. */
export interface EditorSelection {
  value: string;
  start: number;
  end: number;
}

type WrapAction = "bold" | "italic" | "strikethrough" | "code";
type LinePrefixAction = "bulletList" | "checkList" | "heading";

const WRAP_MARKERS: Record<WrapAction, string> = {
  bold: "**",
  italic: "*",
  strikethrough: "~~",
  code: "`",
};

/**
 * One button has to pick one heading level; `##` reads as a heading inside a
 * task card without dwarfing the text. `#` and `###` stay available by hand.
 */
const LINE_PREFIXES: Record<LinePrefixAction, string> = {
  bulletList: "- ",
  checkList: "- [ ] ",
  heading: "## ",
};

const LINK_PLACEHOLDER_LABEL = "text";
const LINK_PLACEHOLDER_URL = "url";

const INDENT_REGEX = /^[ \t]*/;
// the optional group swallows a task marker, so the checklist button replaces a
// bullet prefix instead of stacking a second one on top of it
const BULLET_MARKER_REGEX = /^[-*+][ \t]+(\[[ xX]\][ \t]*)?/;
const HEADING_MARKER_REGEX = /^#{1,3}[ \t]+/;

/**
 * Wraps the selection in `marker`. Pressing the same button again unwraps,
 * whether the markers sit just outside the selection or inside it; with nothing
 * selected it inserts an empty pair and puts the caret between them.
 */
const wrapSelection = (selection: EditorSelection, marker: string): EditorSelection => {
  const { value, start, end } = selection;
  const len = marker.length;

  if (start === end) {
    return {
      value: value.slice(0, start) + marker + marker + value.slice(start),
      start: start + len,
      end: start + len,
    };
  }

  const selected = value.slice(start, end);

  if (
    start >= len &&
    value.slice(start - len, start) === marker &&
    value.slice(end, end + len) === marker
  ) {
    return {
      value: value.slice(0, start - len) + selected + value.slice(end + len),
      start: start - len,
      end: end - len,
    };
  }

  if (selected.length > 2 * len && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(len, selected.length - len);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      start,
      end: start + inner.length,
    };
  }

  return {
    value: value.slice(0, start) + marker + selected + marker + value.slice(end),
    start: start + len,
    end: end + len,
  };
};

/**
 * Inserts a link. With text selected the url placeholder is selected so the
 * address can be typed straight over it; with nothing selected the label is.
 */
const insertLink = (selection: EditorSelection): EditorSelection => {
  const { value, start, end } = selection;

  if (start === end) {
    const inserted = `[${LINK_PLACEHOLDER_LABEL}](${LINK_PLACEHOLDER_URL})`;
    return {
      value: value.slice(0, start) + inserted + value.slice(start),
      start: start + 1,
      end: start + 1 + LINK_PLACEHOLDER_LABEL.length,
    };
  }

  const label = value.slice(start, end);
  const inserted = `[${label}](${LINK_PLACEHOLDER_URL})`;
  // "[" + label + "]("
  const urlStart = start + label.length + 3;
  return {
    value: value.slice(0, start) + inserted + value.slice(end),
    start: urlStart,
    end: urlStart + LINK_PLACEHOLDER_URL.length,
  };
};

/** Splits a line into its indent, an existing related marker and the rest. */
const splitLine = (line: string, action: LinePrefixAction) => {
  const indent = INDENT_REGEX.exec(line)?.[0] ?? "";
  const rest = line.slice(indent.length);
  const regex = action === "heading" ? HEADING_MARKER_REGEX : BULLET_MARKER_REGEX;
  const marker = regex.exec(rest)?.[0] ?? "";
  return { indent, marker, body: rest.slice(marker.length) };
};

/**
 * Puts a line prefix on every non-blank line the selection touches. A related
 * prefix is replaced rather than stacked (`- item` becomes `- [ ] item`), and
 * the prefix is removed when every affected line already carries exactly it.
 *
 * Blank lines are skipped — unless the range holds nothing but blank lines, in
 * which case they get the prefix as a stub, so pressing the button on an empty
 * field or on a fresh line inserts `- `/`- [ ] `/`## ` with the caret behind it
 * instead of doing nothing at all.
 */
const applyLinePrefix = (selection: EditorSelection, action: LinePrefixAction): EditorSelection => {
  const { value, start, end } = selection;
  const target = LINE_PREFIXES[action];

  // grow the range to whole lines
  const blockStart = value.lastIndexOf("\n", start - 1) + 1;
  const nextNewline = value.indexOf("\n", end);
  const blockEnd = nextNewline === -1 ? value.length : nextNewline;

  const lines = value.slice(blockStart, blockEnd).split("\n");
  const affected = lines.filter((line) => line.trim() !== "");
  const prefixBlank = affected.length === 0;
  const remove =
    affected.length > 0 &&
    affected.every((line) => splitLine(line, action).marker.trimEnd() === target.trimEnd());

  let caretDelta = 0;
  let offset = blockStart;
  const rebuilt = lines.map((line) => {
    const lineStart = offset;
    offset += line.length + 1; // the newline split() dropped
    if (line.trim() === "" && !prefixBlank) return line;

    const { indent, body } = splitLine(line, action);
    const next = indent + (remove ? "" : target) + body;
    if (start >= lineStart && start <= lineStart + line.length) {
      caretDelta = next.length - line.length;
    }
    return next;
  });

  const block = rebuilt.join("\n");
  const nextValue = value.slice(0, blockStart) + block + value.slice(blockEnd);

  return start === end
    ? { value: nextValue, start: start + caretDelta, end: start + caretDelta }
    : { value: nextValue, start: blockStart, end: blockStart + block.length };
};

/**
 * Applies a toolbar action to the current value and selection, returning the
 * next value and the selection to restore afterwards.
 */
export function applyMarkdownAction(
  selection: EditorSelection,
  action: MarkdownAction,
): EditorSelection {
  switch (action) {
    case "bold":
    case "italic":
    case "strikethrough":
    case "code":
      return wrapSelection(selection, WRAP_MARKERS[action]);
    case "bulletList":
    case "checkList":
    case "heading":
      return applyLinePrefix(selection, action);
    case "link":
      return insertLink(selection);
  }
}
