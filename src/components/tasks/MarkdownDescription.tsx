import { Fragment, memo, useMemo } from "react";
import type { ReactNode } from "react";
import styled from "@emotion/styled";
import { getFontColor, parseMarkdown } from "../../utils";
import type { InlineToken, ListItem, Token } from "../../utils";
import { DescriptionLink } from "./DescriptionLink";

interface MarkdownDescriptionProps {
  text: string;
  /** the surface the text sits on — drives getFontColor() */
  color: string;
}

/**
 * Renders a task description written in the app's small Markdown dialect.
 * All parsing lives in `src/utils/markdown.ts`; this component only walks the
 * tokens and emits React elements — never HTML (ADR-0002 on markdown
 * descriptions).
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

  // task-list checkboxes are read-only on purpose: ticking one here must not
  // change the task, so no onChange/onClick is wired up at all
  const renderItems = (items: ListItem[]) =>
    items.map((item, index) =>
      item.checked === undefined ? (
        <li key={index}>
          {renderInline(item.children)}
          {renderBlocks(item.blocks)}
        </li>
      ) : (
        <TaskListItem key={index}>
          <TaskCheckbox
            type="checkbox"
            checked={item.checked}
            disabled
            aria-label={item.checked ? "completed" : "not completed"}
          />
          <div>
            {renderInline(item.children)}
            {renderBlocks(item.blocks)}
          </div>
        </TaskListItem>
      ),
    );

  const renderBlocks = (blocks: Token[] | undefined) =>
    blocks?.map((token, index) => {
      switch (token.type) {
        case "paragraph":
          return <Paragraph key={index}>{renderInline(token.children)}</Paragraph>;
        case "heading":
          return (
            <Heading key={index} level={token.level}>
              {renderInline(token.children)}
            </Heading>
          );
        case "blockquote":
          return (
            <Blockquote key={index} clr={color}>
              {renderBlocks(token.children)}
            </Blockquote>
          );
        case "thematicBreak":
          return <Divider key={index} clr={color} />;
        case "codeBlock":
          return (
            <CodeBlock key={index} clr={color}>
              <code>{token.value}</code>
            </CodeBlock>
          );
        case "list":
          return token.ordered ? (
            <OrderedList key={index} start={token.start}>
              {renderItems(token.items)}
            </OrderedList>
          ) : (
            <UnorderedList key={index}>{renderItems(token.items)}</UnorderedList>
          );
      }
    });

  return <MarkdownContainer>{renderBlocks(tokens)}</MarkdownContainer>;
});

const MarkdownContainer = styled.div`
  width: 100%;
  min-width: 0;

  & > :first-child {
    margin-top: 0;
  }

  & > :last-child {
    margin-bottom: 0;
  }
`;

interface HeadingTagProps {
  level: 1 | 2 | 3;
  className?: string;
  children?: ReactNode;
}

// the tag is spelled out per level so the union never has to be widened to a
// generic element type
const HeadingTag = ({ level, className, children }: HeadingTagProps) => {
  if (level === 1) return <h1 className={className}>{children}</h1>;
  if (level === 2) return <h2 className={className}>{children}</h2>;
  return <h3 className={className}>{children}</h3>;
};

const Heading = styled(HeadingTag)`
  margin: 12px 0 6px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  font-size: ${({ level }) => (level === 1 ? "1.35em" : level === 2 ? "1.15em" : "1em")};
`;

const Blockquote = styled.blockquote<{ clr: string }>`
  margin: 4px 0 8px;
  padding: 2px 0 2px 12px;
  border-left: 3px solid ${({ clr }) => getFontColor(clr)}3b;
  opacity: 0.85;
`;

const Divider = styled.hr<{ clr: string }>`
  margin: 12px 0;
  border: none;
  border-top: 1px solid ${({ clr }) => getFontColor(clr)}3b;
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

// a task item drops its bullet and pulls back into the space the marker used
const TaskListItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 8px;
  list-style: none;
  margin-left: -20px;
`;

const TaskCheckbox = styled.input`
  margin: 4px 0 0;
  accent-color: currentColor;
  /* disabled beats readOnly here — browsers ignore readOnly on a checkbox and
     would still toggle it in the DOM on click — so undo the greying it causes */
  opacity: 1;
  cursor: default;
`;
