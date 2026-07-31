import { Category, Task } from "../types/user";
import { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { AddTaskButton, Container, StyledInput } from "../styles";
import { AddTaskRounded, CancelRounded, EditRounded, VisibilityRounded } from "@mui/icons-material";
import {
  IconButton,
  InputAdornment,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from "@mui/material";
import { DESCRIPTION_MAX_LENGTH, TASK_NAME_MAX_LENGTH } from "../constants";
import { ColorPicker, TopBar, CustomEmojiPicker } from "../components";
import { UserContext } from "../contexts/UserContext";
import { useStorageState } from "../hooks/useStorageState";
import { useTheme } from "@emotion/react";
import { generateUUID, getFontColor, isDark, showToast } from "../utils";
import { ColorPalette } from "../theme/themeConfig";
import InputThemeProvider from "../contexts/InputThemeProvider";
import { CategorySelect } from "../components/CategorySelect";
import { useToasterStore } from "react-hot-toast";
import { MarkdownDescription } from "../components/tasks/MarkdownDescription";
import styled from "@emotion/styled";

const AddTask = () => {
  const { user, setUser } = useContext(UserContext);
  const theme = useTheme();
  const [name, setName] = useStorageState<string>("", "name", "sessionStorage");
  const [emoji, setEmoji] = useStorageState<string | null>(null, "emoji", "sessionStorage");
  const [color, setColor] = useStorageState<string>(theme.primary, "color", "sessionStorage");
  const [description, setDescription] = useStorageState<string>(
    "",
    "description",
    "sessionStorage",
  );
  const [deadline, setDeadline] = useStorageState<string>("", "deadline", "sessionStorage");
  const [nameError, setNameError] = useState<string>("");
  const [descriptionError, setDescriptionError] = useState<string>("");
  const [selectedCategories, setSelectedCategories] = useStorageState<Category[]>(
    [],
    "categories",
    "sessionStorage",
  );

  const [isDeadlineFocused, setIsDeadlineFocused] = useState<boolean>(false);
  const [descriptionMode, setDescriptionMode] = useState<"edit" | "preview">("edit");

  const n = useNavigate();
  const { toasts } = useToasterStore();

  useEffect(() => {
    document.title = "Todo App - Add Task";
  }, []);

  useEffect(() => {
    if (name.length > TASK_NAME_MAX_LENGTH) {
      setNameError(`Name should be less than or equal to ${TASK_NAME_MAX_LENGTH} characters`);
    } else {
      setNameError("");
    }
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      setDescriptionError(
        `Description should be less than or equal to ${DESCRIPTION_MAX_LENGTH} characters`,
      );
    } else {
      setDescriptionError("");
    }
  }, [description.length, name.length]);

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newName = event.target.value;
    setName(newName);
    if (newName.length > TASK_NAME_MAX_LENGTH) {
      setNameError(`Name should be less than or equal to ${TASK_NAME_MAX_LENGTH} characters`);
    } else {
      setNameError("");
    }
  };

  const handleDescriptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newDescription = event.target.value;
    setDescription(newDescription);
    if (newDescription.length > DESCRIPTION_MAX_LENGTH) {
      setDescriptionError(
        `Description should be less than or equal to ${DESCRIPTION_MAX_LENGTH} characters`,
      );
    } else {
      setDescriptionError("");
    }
  };

  const handleDeadlineChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setDeadline(event.target.value);
  };

  // the counter and the limit are deliberately measured on the raw markdown source,
  // because that is what gets stored
  const descriptionHelperText =
    description === ""
      ? undefined
      : !descriptionError
        ? `${description.length}/${DESCRIPTION_MAX_LENGTH}`
        : descriptionError;

  const handleAddTask = () => {
    if (name === "") {
      showToast("Task name is required.", {
        type: "error",
        id: "task-name-required",
        preventDuplicate: true,
        visibleToasts: toasts,
      });
      return;
    }

    if (nameError !== "" || descriptionError !== "") {
      return; // Do not add the task if the name or description exceeds the maximum length
    }

    const newTask: Task = {
      id: generateUUID(),
      done: false,
      pinned: false,
      name,
      description: description !== "" ? description : undefined,
      emoji: emoji ? emoji : undefined,
      color,
      date: new Date(),
      deadline: deadline !== "" ? new Date(deadline) : undefined,
      category: selectedCategories ? selectedCategories : [],
    };

    setUser((prevUser) => ({
      ...prevUser,
      tasks: [...prevUser.tasks, newTask],
    }));

    n("/");

    showToast(
      <div>
        Added task - <b>{newTask.name}</b>
      </div>,
      {
        icon: <AddTaskRounded />,
      },
    );

    const itemsToRemove = ["name", "color", "description", "emoji", "deadline", "categories"];
    itemsToRemove.map((item) => sessionStorage.removeItem(item));
  };

  return (
    <>
      <TopBar title="Add New Task" />
      <Container>
        <CustomEmojiPicker
          emoji={typeof emoji === "string" ? emoji : undefined}
          setEmoji={setEmoji}
          color={color}
          name={name}
          type="task"
        />
        {/* fix for input colors */}
        <InputThemeProvider>
          <StyledInput
            label="Task Name"
            name="name"
            placeholder="Enter task name"
            autoComplete="off"
            value={name}
            onChange={handleNameChange}
            required
            error={nameError !== ""}
            helpercolor={nameError && ColorPalette.red}
            helperText={
              name === ""
                ? undefined
                : !nameError
                  ? `${name.length}/${TASK_NAME_MAX_LENGTH}`
                  : nameError
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
                label="Task Description"
                name="name"
                placeholder="Enter task description"
                autoComplete="off"
                value={description}
                onChange={handleDescriptionChange}
                multiline
                rows={4}
                error={descriptionError !== ""}
                helpercolor={descriptionError && ColorPalette.red}
                helperText={descriptionHelperText}
              />
            ) : (
              <>
                <PreviewBox>
                  {description ? (
                    <MarkdownDescription text={description} color={theme.secondary} />
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
            label="Task Deadline"
            name="name"
            placeholder="Enter deadline date"
            type="datetime-local"
            value={deadline}
            onChange={handleDeadlineChange}
            onFocus={() => setIsDeadlineFocused(true)}
            onBlur={() => setIsDeadlineFocused(false)}
            hidetext={(!deadline || deadline === "") && !isDeadlineFocused} // fix for label overlapping with input
            sx={{
              colorScheme: isDark(theme.secondary) ? "dark" : "light",
            }}
            slotProps={{
              input: {
                startAdornment:
                  deadline && deadline !== "" ? (
                    <InputAdornment position="start">
                      <Tooltip title="Clear">
                        <IconButton color="error" onClick={() => setDeadline("")}>
                          <CancelRounded />
                        </IconButton>
                      </Tooltip>
                    </InputAdornment>
                  ) : undefined,
              },
            }}
          />

          {user.settings.enableCategories !== undefined && user.settings.enableCategories && (
            <div style={{ marginBottom: "14px" }}>
              <br />
              <CategorySelect
                selectedCategories={selectedCategories}
                onCategoryChange={(categories) => setSelectedCategories(categories)}
                width="400px"
                fontColor={getFontColor(theme.secondary)}
              />
            </div>
          )}
        </InputThemeProvider>
        <ColorPicker
          color={color}
          width="400px"
          onColorChange={(color) => {
            setColor(color);
          }}
          fontColor={getFontColor(theme.secondary)}
        />
        <AddTaskButton
          onClick={handleAddTask}
          disabled={
            name.length > TASK_NAME_MAX_LENGTH || description.length > DESCRIPTION_MAX_LENGTH
          }
        >
          Create Task
        </AddTaskButton>
      </Container>
    </>
  );
};

export default AddTask;

// 400px input + the 12px margin StyledInput carries on each side
const DescriptionField = styled.div`
  display: flex;
  flex-direction: column;
  width: 424px;
  max-width: 100%;
`;

const DescriptionModeToggle = styled(ToggleButtonGroup)`
  align-self: flex-end;
  margin: 0 12px -4px;
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
  margin: 12px;
  padding: 16px 14px;
  border: 1px solid ${({ theme }) => getFontColor(theme.secondary)}3b;
  border-radius: 16px;
  color: ${({ theme }) => getFontColor(theme.secondary)};
  overflow-wrap: anywhere;
`;

const PreviewPlaceholder = styled.span`
  opacity: 0.6;
`;

const PreviewHelperText = styled.span<{ clr?: string }>`
  margin: -9px 26px 12px;
  font-size: 0.75rem;
  opacity: 0.8;
  color: ${({ clr, theme }) => clr || getFontColor(theme.secondary)};
`;
