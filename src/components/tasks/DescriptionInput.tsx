import styled from "@emotion/styled";
import { useTheme } from "@emotion/react";
import { EditRounded, VisibilityRounded } from "@mui/icons-material";
import { TextField, ToggleButton, ToggleButtonGroup } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { applyMarkdownAction, getFontColor } from "../../utils";
import type { MarkdownAction } from "../../utils";
import { MarkdownDescription } from "./MarkdownDescription";
import { MarkdownToolbar } from "./MarkdownToolbar";

/**
 * Two hand-tuned spacing recipes, one per call site: the add-task page sits in a
 * 424px column with 12px gutters, the edit dialog fills its content width. An
 * enum keeps a third consumer from inventing a fourth geometry.
 */
type DescriptionLayout = "page" | "dialog";

interface DescriptionInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: boolean;
  helperText?: ReactNode;
  /** colour of the helper text — the red palette entry when the limit is blown */
  helperColor?: string;
  layout?: DescriptionLayout;
}

const SHORTCUTS: Record<string, MarkdownAction | undefined> = {
  b: "bold",
  i: "italic",
  k: "link",
};

/**
 * The task description field: formatting toolbar, Edit/Preview toggle, textarea
 * and the rendered preview. Shared by the add-task page and the edit dialog so
 * the markup exists exactly once.
 */
export const DescriptionInput = ({
  label,
  value,
  onChange,
  placeholder,
  error,
  helperText,
  helperColor,
  layout = "dialog",
}: DescriptionInputProps) => {
  const theme = useTheme();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);

  // the selection has to be restored *after* React commits the new value —
  // setting it earlier would be overwritten when the textarea re-renders
  useEffect(() => {
    const pending = pendingSelection.current;
    if (!pending || !inputRef.current) return;
    pendingSelection.current = null;
    inputRef.current.focus();
    inputRef.current.setSelectionRange(pending.start, pending.end);
  }, [value]);

  const applyAction = (action: MarkdownAction) => {
    const element = inputRef.current;
    if (!element) return;

    const next = applyMarkdownAction(
      { value, start: element.selectionStart, end: element.selectionEnd },
      action,
    );

    // no value change means no re-render, so the effect above would never fire
    if (next.value === value) {
      element.focus();
      element.setSelectionRange(next.start, next.end);
      return;
    }

    pendingSelection.current = { start: next.start, end: next.end };
    onChange(next.value);
  };

  // scoped to the textarea rather than the window, so other inputs and the
  // global shortcuts are left alone
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return;
    const action = SHORTCUTS[event.key.toLowerCase()];
    if (!action) return;
    event.preventDefault();
    applyAction(action);
  };

  return (
    <DescriptionField layout={layout}>
      <EditorHeader layout={layout}>
        {/* hidden rather than disabled in preview: dead buttons help nobody */}
        {mode === "edit" && <MarkdownToolbar onAction={applyAction} />}
        <DescriptionModeToggle
          value={mode}
          exclusive
          size="small"
          aria-label="description mode"
          onChange={(_event, next: "edit" | "preview" | null) => next && setMode(next)}
        >
          <ToggleButton value="edit" aria-label="edit description">
            <EditRounded /> &nbsp; Edit
          </ToggleButton>
          <ToggleButton value="preview" aria-label="preview description">
            <VisibilityRounded /> &nbsp; Preview
          </ToggleButton>
        </DescriptionModeToggle>
      </EditorHeader>
      {mode === "edit" ? (
        <DescriptionTextField
          label={label}
          name="description"
          placeholder={placeholder}
          autoComplete="off"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={handleKeyDown}
          inputRef={inputRef}
          multiline
          rows={4}
          fullWidth
          error={error}
          helperText={helperText}
          helpercolor={helperColor}
          layout={layout}
        />
      ) : (
        <>
          <PreviewBox layout={layout}>
            {value ? (
              <MarkdownDescription text={value} color={theme.secondary} />
            ) : (
              <PreviewPlaceholder>Nothing to preview</PreviewPlaceholder>
            )}
          </PreviewBox>
          {helperText && (
            <PreviewHelperText layout={layout} clr={helperColor}>
              {helperText}
            </PreviewHelperText>
          )}
        </>
      )}
    </DescriptionField>
  );
};

const DescriptionField = styled.div<{ layout: DescriptionLayout }>`
  display: flex;
  flex-direction: column;
  width: ${({ layout }) => (layout === "page" ? "424px" : "100%")};
  max-width: 100%;
`;

const EditorHeader = styled.div<{ layout: DescriptionLayout }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 4px;
  margin: ${({ layout }) => (layout === "page" ? "0 12px -4px" : "0 0 -8px")};
`;

const DescriptionModeToggle = styled(ToggleButtonGroup)`
  margin-left: auto;
  & .MuiToggleButton-root {
    border-radius: 12px;
    text-transform: none;
    padding: 4px 12px;
    color: ${({ theme }) => getFontColor(theme.secondary)};
    border-color: ${({ theme }) => getFontColor(theme.secondary)}3b;
  }
  & .MuiSvgIcon-root {
    font-size: 18px;
  }
`;

const DescriptionTextField = styled(TextField, {
  shouldForwardProp: (prop) => prop !== "layout" && prop !== "helpercolor",
})<{ layout: DescriptionLayout; helpercolor?: string }>`
  margin: ${({ layout }) => (layout === "page" ? "12px" : "14px 0")};
  & .MuiInputBase-root {
    border-radius: 16px;
    color: ${({ theme }) => getFontColor(theme.secondary)};
  }
  & .MuiFormHelperText-root {
    color: ${({ helpercolor, theme }) => helpercolor || getFontColor(theme.secondary)};
    opacity: 0.8;
  }
`;

const PreviewBox = styled.div<{ layout: DescriptionLayout }>`
  box-sizing: border-box;
  min-height: 106px;
  margin: ${({ layout }) => (layout === "page" ? "12px" : "22px 0 3px")};
  padding: 16px 14px;
  border: 1px solid ${({ theme }) => getFontColor(theme.secondary)}3b;
  border-radius: 16px;
  color: ${({ theme }) => getFontColor(theme.secondary)};
  overflow-wrap: anywhere;
`;

const PreviewPlaceholder = styled.span`
  opacity: 0.6;
`;

const PreviewHelperText = styled.span<{ layout: DescriptionLayout; clr?: string }>`
  margin: ${({ layout }) => (layout === "page" ? "-9px 26px 12px" : "0 14px 14px")};
  font-size: 0.75rem;
  opacity: 0.8;
  color: ${({ clr, theme }) => clr || getFontColor(theme.secondary)};
`;
