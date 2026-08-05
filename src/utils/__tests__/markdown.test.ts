import { parseMarkdown, stripMarkdown } from "../markdown";
import type { InlineToken } from "../markdown";

/** the inline children of a description that parses to a single paragraph */
const inlineOf = (text: string): InlineToken[] => {
  const [token] = parseMarkdown(text);
  if (!token || token.type !== "paragraph") {
    throw new Error(`expected a single paragraph, got ${JSON.stringify(token)}`);
  }
  return token.children;
};

/** syntax the dialect does not support — it has to survive as plain text */
const UNSUPPORTED_SYNTAX = [
  "#### too deep",
  "#nospace",
  "--",
  "| a | b |",
  "![alt](https://example.com/i.png)",
  "_underscore_",
  "2 * 3 = 6",
  "a * b * c",
  "****",
  "~~~~",
  "``",
  "unclosed **bold and *it",
  "text with `unclosed code",
  "[bad](javascript:alert(1))",
];

/** hrefs that must never become a link */
const HOSTILE_HREFS = [
  "javascript:alert(1)",
  "JaVaScRiPt:alert(1)",
  "java\tscript:alert(1)",
  "data:text/html;base64,PHNjcmlwdD4=",
  "vbscript:msgbox(1)",
  "%6a%61vascript:alert(1)",
  "//evil.com",
  "/relative/path",
  "evil.com",
];

describe("parseMarkdown", () => {
  it("returns no tokens for empty or blank input", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("   \n  ")).toEqual([]);
  });

  it("parses plain text into a single paragraph", () => {
    expect(parseMarkdown("just some plain text")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "just some plain text" }] },
    ]);
  });

  it("parses bold, italic and strikethrough", () => {
    expect(inlineOf("**bold**")).toEqual([
      { type: "strong", children: [{ type: "text", value: "bold" }] },
    ]);
    expect(inlineOf("*italic*")).toEqual([
      { type: "em", children: [{ type: "text", value: "italic" }] },
    ]);
    expect(inlineOf("~~struck~~")).toEqual([
      { type: "del", children: [{ type: "text", value: "struck" }] },
    ]);
  });

  it("nests emphasis", () => {
    expect(inlineOf("**bold with *em* inside**")).toEqual([
      {
        type: "strong",
        children: [
          { type: "text", value: "bold with " },
          { type: "em", children: [{ type: "text", value: "em" }] },
          { type: "text", value: " inside" },
        ],
      },
    ]);
  });

  it("lets inline code win over every other marker", () => {
    expect(inlineOf("`**a**`")).toEqual([{ type: "codeSpan", value: "**a**" }]);
  });

  it("keeps stray markers literal without losing characters", () => {
    expect(inlineOf("***x***")).toEqual([
      { type: "text", value: "*" },
      { type: "strong", children: [{ type: "text", value: "x" }] },
      { type: "text", value: "*" },
    ]);
  });

  it("treats a marker at line start as emphasis, not a list item", () => {
    expect(inlineOf("*italic* at line start")).toEqual([
      { type: "em", children: [{ type: "text", value: "italic" }] },
      { type: "text", value: " at line start" },
    ]);
  });

  it("splits paragraphs on blank lines and keeps single newlines as breaks", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toEqual([
      {
        type: "paragraph",
        children: [
          { type: "text", value: "one" },
          { type: "break" },
          { type: "text", value: "two" },
        ],
      },
      { type: "paragraph", children: [{ type: "text", value: "three" }] },
    ]);
  });

  it("parses bulleted lists of every marker into one flat list", () => {
    expect(parseMarkdown("- one\n- two\n* three\n+ four")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          { children: [{ type: "text", value: "one" }] },
          { children: [{ type: "text", value: "two" }] },
          { children: [{ type: "text", value: "three" }] },
          { children: [{ type: "text", value: "four" }] },
        ],
      },
    ]);
  });

  it("parses numbered lists and keeps the first number", () => {
    expect(parseMarkdown("3) one\n4) two")).toEqual([
      {
        type: "list",
        ordered: true,
        start: 3,
        items: [
          { children: [{ type: "text", value: "one" }] },
          { children: [{ type: "text", value: "two" }] },
        ],
      },
    ]);
    expect(parseMarkdown("1. one\n2. two")[0]).toMatchObject({
      type: "list",
      ordered: true,
      start: 1,
    });
  });

  it("ends a list on a blank line", () => {
    expect(parseMarkdown("- a\n\n- b")).toHaveLength(2);
  });

  it("parses a fenced code block, closed or not", () => {
    expect(parseMarkdown("before\n```js\nconst a = 1;\n```\nafter")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "before" }] },
      { type: "codeBlock", value: "const a = 1;" },
      { type: "paragraph", children: [{ type: "text", value: "after" }] },
    ]);
    expect(parseMarkdown("```js\nconst a = 1;")).toEqual([
      { type: "codeBlock", value: "const a = 1;" },
    ]);
  });

  it("parses links and flattens their label to visible text", () => {
    expect(inlineOf("[**Docs**](https://example.com)")).toEqual([
      { type: "link", href: "https://example.com", label: "Docs" },
    ]);
  });

  it("parses bare urls and stops before sentence punctuation", () => {
    expect(inlineOf("see https://example.com/path?q=1, ok")).toEqual([
      { type: "text", value: "see " },
      { type: "autolink", href: "https://example.com/path?q=1" },
      { type: "text", value: ", ok" },
    ]);
  });

  it("leaves unsupported syntax as a single text token", () => {
    for (const input of UNSUPPORTED_SYNTAX) {
      expect(inlineOf(input)).toEqual([{ type: "text", value: input }]);
    }
  });

  it("does not turn the url inside an image into a link", () => {
    expect(inlineOf("![alt](https://example.com/i.png)")).toEqual([
      { type: "text", value: "![alt](https://example.com/i.png)" },
    ]);
  });

  it("parses headings of the three supported levels", () => {
    expect(parseMarkdown("# a\n## b\n### c")).toEqual([
      { type: "heading", level: 1, children: [{ type: "text", value: "a" }] },
      { type: "heading", level: 2, children: [{ type: "text", value: "b" }] },
      { type: "heading", level: 3, children: [{ type: "text", value: "c" }] },
    ]);
  });

  it("closes an open paragraph before a heading", () => {
    expect(parseMarkdown("text\n# a")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "text" }] },
      { type: "heading", level: 1, children: [{ type: "text", value: "a" }] },
    ]);
  });

  it("parses a blockquote and keeps its line breaks", () => {
    expect(parseMarkdown("> a\n> b")).toEqual([
      {
        type: "blockquote",
        children: [
          {
            type: "paragraph",
            children: [
              { type: "text", value: "a" },
              { type: "break" },
              { type: "text", value: "b" },
            ],
          },
        ],
      },
    ]);
  });

  it("parses blocks inside a blockquote", () => {
    expect(parseMarkdown("> # a")).toEqual([
      {
        type: "blockquote",
        children: [{ type: "heading", level: 1, children: [{ type: "text", value: "a" }] }],
      },
    ]);
  });

  it("splits paragraphs inside a blockquote on a bare marker line", () => {
    expect(parseMarkdown("> a\n>\n> b")).toEqual([
      {
        type: "blockquote",
        children: [
          { type: "paragraph", children: [{ type: "text", value: "a" }] },
          { type: "paragraph", children: [{ type: "text", value: "b" }] },
        ],
      },
    ]);
  });

  it("nests blockquotes", () => {
    expect(parseMarkdown(">> a")).toEqual([
      {
        type: "blockquote",
        children: [
          {
            type: "blockquote",
            children: [{ type: "paragraph", children: [{ type: "text", value: "a" }] }],
          },
        ],
      },
    ]);
  });

  it("degrades a quote past the nesting limit to text, losing no characters", () => {
    expect(stripMarkdown(">>>>>> a")).toBe(">> a");
  });

  it("parses a thematic break but not a shorter dash run", () => {
    expect(parseMarkdown("---")).toEqual([{ type: "thematicBreak" }]);
    expect(parseMarkdown("----")).toEqual([{ type: "thematicBreak" }]);
    expect(parseMarkdown("--")).toEqual([
      { type: "paragraph", children: [{ type: "text", value: "--" }] },
    ]);
  });

  it("parses task list items and their state", () => {
    expect(parseMarkdown("- [ ] a\n- [x] b\n- [X] c")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          { children: [{ type: "text", value: "a" }], checked: false },
          { children: [{ type: "text", value: "b" }], checked: true },
          { children: [{ type: "text", value: "c" }], checked: true },
        ],
      },
    ]);
  });

  it("parses a task item with no text", () => {
    expect(parseMarkdown("- [x]")).toEqual([
      { type: "list", ordered: false, items: [{ children: [], checked: true }] },
    ]);
  });

  it("only honours the task marker on bulleted items", () => {
    expect(parseMarkdown("1. [ ] a")).toEqual([
      {
        type: "list",
        ordered: true,
        start: 1,
        items: [{ children: [{ type: "text", value: "[ ] a" }] }],
      },
    ]);
  });

  it("nests a list under the item above it", () => {
    expect(parseMarkdown("- a\n  - b\n- c")).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          {
            children: [{ type: "text", value: "a" }],
            blocks: [
              {
                type: "list",
                ordered: false,
                items: [{ children: [{ type: "text", value: "b" }] }],
              },
            ],
          },
          { children: [{ type: "text", value: "c" }] },
        ],
      },
    ]);
  });

  it("nests with two spaces, four spaces or a tab alike", () => {
    for (const source of ["- a\n  - b", "- a\n    - b", "- a\n\t- b"]) {
      expect(parseMarkdown(source)[0]).toMatchObject({
        type: "list",
        items: [
          {
            children: [{ type: "text", value: "a" }],
            blocks: [{ type: "list", items: [{ children: [{ type: "text", value: "b" }] }] }],
          },
        ],
      });
    }
  });

  it("nests three levels deep", () => {
    expect(parseMarkdown("- a\n  - b\n    - c")[0]).toMatchObject({
      items: [
        {
          blocks: [
            { items: [{ blocks: [{ items: [{ children: [{ type: "text", value: "c" }] }] }] }] },
          ],
        },
      ],
    });
  });

  it("starts a nested ordered list under a bulleted item", () => {
    expect(parseMarkdown("- a\n  1. b")[0]).toMatchObject({
      type: "list",
      ordered: false,
      items: [{ blocks: [{ type: "list", ordered: true, start: 1 }] }],
    });
  });

  it("gives one item two sibling nested lists when the flavour switches", () => {
    expect(parseMarkdown("- a\n  - b\n  1. c")[0]).toMatchObject({
      type: "list",
      items: [
        {
          blocks: [
            { type: "list", ordered: false, items: [{ children: [{ type: "text", value: "b" }] }] },
            { type: "list", ordered: true, items: [{ children: [{ type: "text", value: "c" }] }] },
          ],
        },
      ],
    });
  });

  it("keeps a flavour switch on the base level as two lists", () => {
    expect(parseMarkdown("- a\n1. b")).toHaveLength(2);
  });

  it("normalises ragged nesting without losing text", () => {
    expect(stripMarkdown("- a\n   - b\n  - c")).toBe("a\nb\nc");
  });

  it("lets a fence win over every block construct", () => {
    expect(parseMarkdown("```\n# a\n> b\n- [ ] c\n---\n```")).toEqual([
      { type: "codeBlock", value: "# a\n> b\n- [ ] c\n---" },
    ]);
  });
});

describe("stripMarkdown", () => {
  it("returns an empty string for empty or blank input", () => {
    expect(stripMarkdown("")).toBe("");
    expect(stripMarkdown("   \n  ")).toBe("");
  });

  it("returns plain text unchanged", () => {
    expect(stripMarkdown("just some plain text")).toBe("just some plain text");
  });

  it("removes emphasis, code and fence markers", () => {
    expect(stripMarkdown("a **b** *c* ~~d~~ `e`")).toBe("a b c d e");
    expect(stripMarkdown("```js\nconst a = 1;\n```")).toBe("const a = 1;");
  });

  it("removes list markers but keeps one item per line", () => {
    expect(stripMarkdown("- one\n- two")).toBe("one\ntwo");
    expect(stripMarkdown("1. one\n2. two")).toBe("one\ntwo");
  });

  it("collapses a markdown link to its label", () => {
    expect(stripMarkdown("see [Docs](https://example.com/docs) now")).toBe("see Docs now");
  });

  it("keeps a bare url verbatim so link chips and the .ics url field still work", () => {
    expect(stripMarkdown("see https://example.com/path?q=1, ok")).toBe(
      "see https://example.com/path?q=1, ok",
    );
  });

  it("preserves every character of unsupported syntax", () => {
    for (const input of UNSUPPORTED_SYNTAX) {
      expect(stripMarkdown(input)).toBe(input);
    }
  });

  it("removes heading, quote and task markers", () => {
    expect(stripMarkdown("## Heading")).toBe("Heading");
    expect(stripMarkdown("> quoted")).toBe("quoted");
    expect(stripMarkdown("> # a")).toBe("a");
    expect(stripMarkdown("- [x] buy bread")).toBe("buy bread");
  });

  it("drops a thematic break without leaving a blank line behind", () => {
    expect(stripMarkdown("---")).toBe("");
    expect(stripMarkdown("a\n---\nb")).toBe("a\nb");
  });

  it("keeps one line per item in a nested list", () => {
    expect(stripMarkdown("- a\n  - b\n- c")).toBe("a\nb\nc");
  });

  it("leaves no markers behind for read aloud, .ics and home cards", () => {
    const description = [
      "# Title",
      "",
      "> a quote",
      "",
      "- [x] done",
      "- [ ] todo",
      "  - nested",
      "",
      "---",
      "",
      "1. first",
    ].join("\n");

    const stripped = stripMarkdown(description);

    expect(stripped).toBe("Title\na quote\ndone\ntodo\nnested\nfirst");
    for (const marker of ["#", ">", "- [", "---"]) {
      expect(stripped).not.toContain(marker);
    }
  });
});

describe("link safety", () => {
  it("never turns a hostile href into a link and keeps the source text", () => {
    for (const href of HOSTILE_HREFS) {
      const source = `[click](${href})`;
      const tokens = inlineOf(source);
      expect(tokens.some((token) => token.type === "link")).toBe(false);
      expect(tokens).toEqual([{ type: "text", value: source }]);
      expect(stripMarkdown(source)).toBe(source);
    }
  });

  it("ignores a hostile href split across lines", () => {
    const tokens = inlineOf("[click](java\nscript:alert(1))");
    expect(tokens.some((token) => token.type === "link")).toBe(false);
  });

  it("allows http, https and mailto with the href intact", () => {
    const allowed = ["http://example.com", "https://example.com/a?b=c", "mailto:a@b.com"];
    for (const href of allowed) {
      expect(inlineOf(`[click](${href})`)).toEqual([{ type: "link", href, label: "click" }]);
    }
  });
});
