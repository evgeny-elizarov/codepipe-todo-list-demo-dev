import styled from "@emotion/styled";
import {
  CancelRounded,
  EditCalendarRounded,
  EditRounded,
  SaveRounded,
  VisibilityRounded,
} from "@mui/icons-material";
import {
  Dialog,
  DialogActions,
  DialogContent,
  IconButton,
  InputAdornment,
  TextField,
  TextFieldProps,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import { useContext, useEffect, useMemo, useState } from "react";
import { ColorPicker, CustomDialogTitle, CustomEmojiPicker } from "..";
import { DESCRIPTION_MAX_LENGTH, TASK_NAME_MAX_LENGTH } from "../../constants";
import { UserContext } from "../../contexts/UserContext";
import { DialogBtn } from "../../styles";
import { Category, Task } from "../../types/user";
import { formatDate, getFontColor, showToast, timeAgo } from "../../utils";
import { useTheme } from "@emotion/react";
import { ColorPalette } from "../../theme/themeConfig";
import { CategorySelect } from "../CategorySelect";
import { MarkdownDescription } from "./MarkdownDescription";

const DEFAULT_EDIT_TASK_SUBTITLE = "Edit the details of the task.";

interface EditTaskProps {
  open: boolean;
  task?: Task;
  onClose: () => void;
}

export const EditTask = ({ open, task, onClose }: EditTaskProps) => {
  const { user, setUser } = useContext(UserContext);
  const { settings } = user;
  const [editedTask, setEditedTask] = useState<Task | undefined>(task);
  const [emoji, setEmoji] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [editLastSaveLabel, setEditLastSaveLabel] = useState<string>(DEFAULT_EDIT_TASK_SUBTITLE);
  const [descriptionMode, setDescriptionMode] = useState<"edit" | "preview">("edit");

  const theme = useTheme();

  const nameError = useMemo(
    () => (editedTask?.name ? editedTask.name.length > TASK_NAME_MAX_LENGTH : undefined),
    [editedTask?.name],
  );
  const descriptionError = useMemo(
    () =>
      editedTask?.description ? editedTask.description.length > DESCRIPTION_MAX_LENGTH : undefined,
    [editedTask?.description],
  );

  // the counter and the limit are deliberately measured on the raw markdown source,
  // because that is what gets stored
  const descriptionHelperText =
    editedTask?.description === "" || editedTask?.description === undefined
      ? undefined
      : descriptionError
        ? `Description is too long (maximum ${DESCRIPTION_MAX_LENGTH} characters)`
        : `${editedTask?.description?.length}/${DESCRIPTION_MAX_LENGTH}`;

  // Effect hook to update the editedTask with the selected emoji.
  useEffect(() => {
    setEditedTask((prevTask) => ({
      ...(prevTask as Task),
      emoji: emoji || undefined,
    }));
  }, [emoji]);

  // Effect hook to update the editedTask when the task prop changes.
  useEffect(() => {
    setEditedTask(task);
    setSelectedCategories(task?.category as Category[]);
    if (task?.lastSave) {
      setEditLastSaveLabel(
        `Last edited ${timeAgo(new Date(task.lastSave))} • ${formatDate(new Date(task.lastSave))}`,
      );
    } else {
      setEditLastSaveLabel(DEFAULT_EDIT_TASK_SUBTITLE);
    }
  }, [task]);

  // Event handler for input changes in the form fields.
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;

    // Update the editedTask state with the changed value.
    setEditedTask((prevTask) => ({
      ...(prevTask as Task),
      [name]: value,
    }));
  };
  // Event handler for saving the edited task.
  const handleSave = () => {
    document.body.style.overflow = "auto";
    if (editedTask && !nameError && !descriptionError) {
      const updatedTasks = user.tasks.map((task) => {
        if (task.id === editedTask.id) {
          return {
            ...task,
            name: editedTask.name,
            color: editedTask.color,
            emoji: editedTask.emoji || undefined,
            description: editedTask.description || undefined,
            deadline: editedTask.deadline || undefined,
            category: editedTask.category || undefined,
            lastSave: new Date(),
          };
        }
        return task;
      });
      setUser((prevUser) => ({
        ...prevUser,
        tasks: updatedTasks,
      }));
      onClose();
      showToast(
        <div>
          Task <b translate="no">{editedTask.name}</b> updated.
        </div>,
      );
    }
  };

  const handleCancel = () => {
    onClose();
    setEditedTask(task);
    setSelectedCategories(task?.category as Category[]);
  };

  useEffect(() => {
    setEditedTask((prevTask) => ({
      ...(prevTask as Task),
      category: (selectedCategories as Category[]) || undefined,
    }));
  }, [selectedCategories]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (JSON.stringify(editedTask) !== JSON.stringify(task) && open) {
        const message = "You have unsaved changes. Are you sure you want to leave?";
        e.returnValue = message;
        return message;
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [editedTask, open, task]);

  return (
    <Dialog
      open={open}
      onClose={() => {
        onClose();
      }}
      slotProps={{
        paper: {
          style: {
            borderRadius: "24px",
            padding: "12px",
            maxWidth: "600px",
          },
        },
      }}
    >
      <CustomDialogTitle
        title="Edit Task"
        subTitle={editLastSaveLabel}
        icon={<EditCalendarRounded />}
        onClose={onClose}
      />

      <DialogContent>
        <CustomEmojiPicker
          emoji={editedTask?.emoji || undefined}
          setEmoji={setEmoji}
          color={editedTask?.color}
          name={editedTask?.name || ""}
          type="task"
        />
        <StyledInput
          label="Name"
          name="name"
          autoComplete="off"
          value={editedTask?.name || ""}
          onChange={handleInputChange}
          error={nameError || editedTask?.name === ""}
          helperText={
            editedTask?.name
              ? editedTask?.name.length === 0
                ? "Name is required"
                : editedTask?.name.length > TASK_NAME_MAX_LENGTH
                  ? `Name is too long (maximum ${TASK_NAME_MAX_LENGTH} characters)`
                  : `${editedTask?.name?.length}/${TASK_NAME_MAX_LENGTH}`
              : "Name is required"
          }
        />
        <DescriptionField>
          <DescriptionModeToggle
            value={descriptionMode}
            exclusive
            size="small"
            aria-label="description mode"
            onChange={(_event, value: "edit" | "preview" | null) =>
              value && setDescriptionMode(value)
            }
          >
            <ToggleButton value="edit" aria-label="edit description">
              <EditRounded /> &nbsp; Edit
            </ToggleButton>
            <ToggleButton value="preview" aria-label="preview description">
              <VisibilityRounded /> &nbsp; Preview
            </ToggleButton>
          </DescriptionModeToggle>
          {descriptionMode === "edit" ? (
            <StyledInput
              label="Description"
              name="description"
              autoComplete="off"
              value={editedTask?.description || ""}
              onChange={handleInputChange}
              multiline
              rows={4}
              margin="normal"
              error={descriptionError}
              helperText={descriptionHelperText}
            />
          ) : (
            <>
              <PreviewBox>
                {editedTask?.description ? (
                  <MarkdownDescription text={editedTask.description} color={theme.secondary} />
                ) : (
                  <PreviewPlaceholder>Nothing to preview</PreviewPlaceholder>
                )}
              </PreviewBox>
              {descriptionHelperText && (
                <PreviewHelperText clr={descriptionError ? ColorPalette.red : undefined}>
                  {descriptionHelperText}
                </PreviewHelperText>
              )}
            </>
          )}
        </DescriptionField>
        <StyledInput
          label="Deadline date"
          name="deadline"
          type="datetime-local"
          value={
            editedTask?.deadline
              ? new Date(editedTask.deadline).toLocaleString("sv").replace(" ", "T").slice(0, 16)
              : ""
          }
          onChange={handleInputChange}
          slotProps={{
            inputLabel: {
              shrink: true,
            },
            input: {
              startAdornment: editedTask?.deadline ? (
                <InputAdornment position="start">
                  <Tooltip title="Clear">
                    <IconButton
                      color="error"
                      onClick={() => {
                        setEditedTask((prevTask) => ({
                          ...(prevTask as Task),
                          deadline: undefined,
                        }));
                      }}
                    >
                      <CancelRounded />
                    </IconButton>
                  </Tooltip>
                </InputAdornment>
              ) : undefined,
            },
          }}
          sx={{
            colorScheme: theme.darkmode ? "dark" : "light",
            " & .MuiInputBase-root": {
              transition: ".3s all",
            },
          }}
        />

        {settings.enableCategories !== undefined && settings.enableCategories && (
          <CategorySelect
            fontColor={theme.darkmode ? ColorPalette.fontLight : ColorPalette.fontDark}
            selectedCategories={selectedCategories}
            onCategoryChange={(categories) => setSelectedCategories(categories)}
          />
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            marginTop: "8px",
          }}
        >
          <ColorPicker
            width={"100%"}
            color={editedTask?.color || "#000000"}
            fontColor={theme.darkmode ? ColorPalette.fontLight : ColorPalette.fontDark}
            onColorChange={(color) => {
              setEditedTask((prevTask) => ({
                ...(prevTask as Task),
                color: color,
              }));
            }}
          />
        </div>
      </DialogContent>
      <DialogActions>
        <DialogBtn onClick={handleCancel}>Cancel</DialogBtn>
        <DialogBtn
          onClick={handleSave}
          color="primary"
          disabled={
            nameError ||
            editedTask?.name === "" ||
            descriptionError ||
            nameError ||
            JSON.stringify(editedTask) === JSON.stringify(task)
          }
        >
          <SaveRounded /> &nbsp; Save
        </DialogBtn>
      </DialogActions>
    </Dialog>
  );
};

const UnstyledTextField = ({ ...props }: TextFieldProps) => <TextField fullWidth {...props} />;

const StyledInput = styled(UnstyledTextField)`
  margin: 14px 0;
  & .MuiInputBase-root {
    border-radius: 16px;
  }
`;

const DescriptionField = styled.div`
  display: flex;
  flex-direction: column;
  width: 100%;
`;

const DescriptionModeToggle = styled(ToggleButtonGroup)`
  align-self: flex-end;
  margin-bottom: -8px;
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

const PreviewBox = styled.div`
  box-sizing: border-box;
  min-height: 106px;
  margin: 22px 0 3px;
  padding: 16px 14px;
  border: 1px solid ${({ theme }) => getFontColor(theme.secondary)}3b;
  border-radius: 16px;
  color: ${({ theme }) => getFontColor(theme.secondary)};
  overflow-wrap: anywhere;
`;

const PreviewHelperText = styled.span<{ clr?: string }>`
  margin: 0 14px 14px;
  font-size: 0.75rem;
  opacity: 0.8;
  color: ${({ clr, theme }) => clr || getFontColor(theme.secondary)};
`;

const PreviewPlaceholder = styled.span`
  opacity: 0.6;
`;
