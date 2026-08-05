import { applyMarkdownAction } from "../markdownEditing";
import type { EditorSelection, MarkdownAction } from "../markdownEditing";

const apply = (
  value: string,
  start: number,
  end: number,
  action: MarkdownAction,
): EditorSelection => applyMarkdownAction({ value, start, end }, action);

describe("applyMarkdownAction — inline wrapping", () => {
  it("wraps the selection and keeps it on the text", () => {
    expect(apply("abc", 0, 3, "bold")).toEqual({ value: "**abc**", start: 2, end: 5 });
    expect(apply("say abc now", 4, 7, "bold")).toEqual({
      value: "say **abc** now",
      start: 6,
      end: 9,
    });
  });

  it("unwraps when the markers sit just outside the selection", () => {
    expect(apply("**abc**", 2, 5, "bold")).toEqual({ value: "abc", start: 0, end: 3 });
  });

  it("unwraps when the markers sit inside the selection", () => {
    expect(apply("**abc**", 0, 7, "bold")).toEqual({ value: "abc", start: 0, end: 3 });
  });

  it("inserts an empty pair and parks the caret between the markers", () => {
    expect(apply("", 0, 0, "bold")).toEqual({ value: "****", start: 2, end: 2 });
    expect(apply("", 0, 0, "code")).toEqual({ value: "``", start: 1, end: 1 });
  });

  it("uses the right marker for every inline action", () => {
    expect(apply("abc", 0, 3, "italic")).toEqual({ value: "*abc*", start: 1, end: 4 });
    expect(apply("abc", 0, 3, "strikethrough")).toEqual({ value: "~~abc~~", start: 2, end: 5 });
    expect(apply("abc", 0, 3, "code")).toEqual({ value: "`abc`", start: 1, end: 4 });
  });
});

describe("applyMarkdownAction — link", () => {
  it("keeps the selection as the label and selects the url placeholder", () => {
    expect(apply("Docs", 0, 4, "link")).toEqual({ value: "[Docs](url)", start: 7, end: 10 });
  });

  it("inserts a full placeholder and selects its label when nothing is selected", () => {
    expect(apply("", 0, 0, "link")).toEqual({ value: "[text](url)", start: 1, end: 5 });
  });
});

describe("applyMarkdownAction — line prefixes", () => {
  it("prefixes a single line and selects it whole", () => {
    expect(apply("one", 0, 3, "bulletList")).toEqual({ value: "- one", start: 0, end: 5 });
  });

  it("prefixes every line of a multi-line selection", () => {
    expect(apply("a\nb\nc", 0, 5, "bulletList")).toEqual({
      value: "- a\n- b\n- c",
      start: 0,
      end: 11,
    });
  });

  it("removes the prefix when every affected line already carries it", () => {
    expect(apply("- a\n- b", 0, 7, "bulletList")).toEqual({ value: "a\nb", start: 0, end: 3 });
  });

  it("keeps the prefix when only some lines carry it", () => {
    expect(apply("- a\nb", 0, 5, "bulletList")).toEqual({ value: "- a\n- b", start: 0, end: 7 });
  });

  it("skips blank lines", () => {
    expect(apply("a\n\nb", 0, 4, "bulletList")).toEqual({ value: "- a\n\n- b", start: 0, end: 8 });
  });

  it("inserts a stub prefix on an empty field and parks the caret behind it", () => {
    expect(apply("", 0, 0, "bulletList")).toEqual({ value: "- ", start: 2, end: 2 });
    expect(apply("", 0, 0, "checkList")).toEqual({ value: "- [ ] ", start: 6, end: 6 });
    expect(apply("", 0, 0, "heading")).toEqual({ value: "## ", start: 3, end: 3 });
  });

  it("inserts a stub prefix when the caret sits on a blank line", () => {
    expect(apply("a\n\nb", 2, 2, "bulletList")).toEqual({ value: "a\n- \nb", start: 4, end: 4 });
    expect(apply("shopping\n", 9, 9, "checkList")).toEqual({
      value: "shopping\n- [ ] ",
      start: 15,
      end: 15,
    });
  });

  it("replaces a related prefix instead of stacking a second one", () => {
    expect(apply("- item", 0, 6, "checkList")).toEqual({ value: "- [ ] item", start: 0, end: 10 });
    expect(apply("- [x] a", 0, 7, "checkList")).toEqual({ value: "- [ ] a", start: 0, end: 7 });
  });

  it("keeps the indentation of a nested item", () => {
    expect(apply("  - a", 0, 5, "checkList")).toEqual({ value: "  - [ ] a", start: 0, end: 9 });
  });

  it("replaces a heading of another level, then removes it", () => {
    expect(apply("# a", 0, 3, "heading")).toEqual({ value: "## a", start: 0, end: 4 });
    expect(apply("## a", 0, 4, "heading")).toEqual({ value: "a", start: 0, end: 1 });
  });

  it("shifts a bare caret by the prefix it just added", () => {
    expect(apply("hello", 2, 2, "bulletList")).toEqual({ value: "- hello", start: 4, end: 4 });
  });

  it("grows a selection that starts mid-line to whole lines", () => {
    expect(apply("hello world", 3, 5, "bulletList")).toEqual({
      value: "- hello world",
      start: 0,
      end: 13,
    });
    expect(apply("one\ntwo", 1, 5, "bulletList")).toEqual({
      value: "- one\n- two",
      start: 0,
      end: 11,
    });
  });
});
