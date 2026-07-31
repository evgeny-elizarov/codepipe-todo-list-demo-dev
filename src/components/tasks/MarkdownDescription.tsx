import { Fragment, memo, useMemo } from "react";
import styled from "@emotion/styled";
import { getFontColor, parseMarkdown } from "../../utils";
import type { InlineToken } from "../../utils";
import { DescriptionLink } from "./DescriptionLink";

interface MarkdownDescriptionProps {
  text: string;
  /** the surface the text sits on — drives getFontColor() */
  color: string;
}

/**
 * Renders a task description written in the app's small Markdown dialect.
 * All parsing lives in `src/utils/markdown.ts`; this component only walks the
 * tokens and emits React elements — never HTML (ADR on markdown descriptions).
 */
export const MarkdownDescription = memo(({ text, color }: MarkdownDescriptionProps) => {
  const tokens = useMemo(() => parseMarkdown(text), [text]);

  const renderInline = (inline: InlineToken[]) =>
    inline.map((token, index) => {
      switch (token.type) {
        case "text":
          return <Fragment key={index}>{token.value}</Fragment>;
        case "strong":
          return <strong key={index}>{renderInline(token.children)}</strong>;
        case "em":
          return <em key={index}>{renderInline(token.children)}</em>;
        case "del":
          return <s key={index}>{renderInline(token.children)}</s>;
        case "codeSpan":
          return (
            <CodeSpan key={index} clr={color}>
              {token.value}
            </CodeSpan>
          );
        case "link":
          return <DescriptionLink key={index} url={token.href} label={token.label} color={color} />;
        case "autolink":
          return <DescriptionLink key={index} url={token.href} color={color} />;
        case "break":
          return <br key={index} />;
      }
    });

  return (
    <MarkdownContainer>
      {tokens.map((token, index) => {
        switch (token.type) {
          case "paragraph":
            return <Paragraph key={index}>{renderInline(token.children)}</Paragraph>;
          case "codeBlock":
            return (
              <CodeBlock key={index} clr={color}>
                <code>{token.value}</code>
              </CodeBlock>
            );
          case "list":
            return token.ordered ? (
              <OrderedList key={index} start={token.start}>
                {token.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </OrderedList>
            ) : (
              <UnorderedList key={index}>
                {token.items.map((item, itemIndex) => (
                  <li key={itemIndex}>{renderInline(item)}</li>
                ))}
              </UnorderedList>
            );
        }
      })}
    </MarkdownContainer>
  );
});

const MarkdownContainer = styled.div`
  width: 100%;
  min-width: 0;

  & > :last-child {
    margin-bottom: 0;
  }
`;

const Paragraph = styled.p`
  margin: 0 0 8px;
  overflow-wrap: anywhere;
`;

const CodeBlock = styled.pre<{ clr: string }>`
  margin: 4px 0 8px;
  padding: 10px 12px;
  border-radius: 12px;
  background: ${({ clr }) => getFontColor(clr)}14;
  white-space: pre-wrap;
  overflow-x: auto;
  max-width: 100%;

  & code {
    font-family: monospace;
    font-size: 0.9em;
  }
`;

const CodeSpan = styled.code<{ clr: string }>`
  font-family: monospace;
  font-size: 0.9em;
  background: ${({ clr }) => getFontColor(clr)}18;
  border-radius: 6px;
  padding: 2px 5px;
`;

const listStyles = `
  margin: 4px 0 8px;
  padding-left: 24px;
  overflow-wrap: anywhere;
`;

const UnorderedList = styled.ul`
  ${listStyles}
`;

const OrderedList = styled.ol`
  ${listStyles}
`;
