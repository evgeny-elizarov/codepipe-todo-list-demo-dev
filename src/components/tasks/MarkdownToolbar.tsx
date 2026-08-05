import styled from "@emotion/styled";
import {
  ChecklistRounded,
  CodeRounded,
  FormatBoldRounded,
  FormatItalicRounded,
  FormatListBulletedRounded,
  LinkRounded,
  StrikethroughSRounded,
  TitleRounded,
} from "@mui/icons-material";
import { IconButton, Tooltip } from "@mui/material";
import type { ReactNode } from "react";
import { getFontColor, systemInfo } from "../../utils";
import type { MarkdownAction } from "../../utils";

interface MarkdownToolbarProps {
  onAction: (action: MarkdownAction) => void;
}

const cmdOrCtrl = systemInfo.isAppleDevice ? "⌘" : "Ctrl";

const BUTTONS: { action: MarkdownAction; title: string; icon: ReactNode }[] = [
  { action: "bold", title: `Bold (${cmdOrCtrl}+B)`, icon: <FormatBoldRounded /> },
  { action: "italic", title: `Italic (${cmdOrCtrl}+I)`, icon: <FormatItalicRounded /> },
  { action: "strikethrough", title: "Strikethrough", icon: <StrikethroughSRounded /> },
  { action: "code", title: "Code", icon: <CodeRounded /> },
  { action: "bulletList", title: "Bulleted list", icon: <FormatListBulletedRounded /> },
  { action: "checkList", title: "Checklist", icon: <ChecklistRounded /> },
  { action: "heading", title: "Heading", icon: <TitleRounded /> },
  { action: "link", title: `Link (${cmdOrCtrl}+K)`, icon: <LinkRounded /> },
];

/**
 * Formatting buttons for the description editor. Stateless — it knows nothing
 * about the textarea; the owner turns an action into a text edit.
 */
export const MarkdownToolbar = ({ onAction }: MarkdownToolbarProps) => (
  <ToolbarRow>
    {BUTTONS.map(({ action, title, icon }) => (
      <Tooltip key={action} title={title}>
        <ToolbarButton
          type="button"
          size="small"
          aria-label={title}
          // without this the click steals focus from the textarea and the
          // selection collapses before the handler ever runs
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onAction(action)}
        >
          {icon}
        </ToolbarButton>
      </Tooltip>
    ))}
  </ToolbarRow>
);

const ToolbarRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
`;

const ToolbarButton = styled(IconButton)`
  color: ${({ theme }) => getFontColor(theme.secondary)};
  border-radius: 10px;
  padding: 5px;

  & .MuiSvgIcon-root {
    font-size: 20px;
  }
`;
