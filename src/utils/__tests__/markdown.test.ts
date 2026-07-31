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
  "# Heading",
  "## Another heading",
  "> a quote",
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
          [{ type: "text", value: "one" }],
          [{ type: "text", value: "two" }],
          [{ type: "text", value: "three" }],
          [{ type: "text", value: "four" }],
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
        items: [[{ type: "text", value: "one" }], [{ type: "text", value: "two" }]],
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
