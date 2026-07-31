import React, { memo, useContext, useMemo } from "react";
import { URL_REGEX, DESCRIPTION_SHORT_LENGTH } from "../../constants";
import { Task } from "../../types/user";
import { Button } from "@mui/material";
import { TaskContext } from "../../contexts/TaskContext";
import styled from "@emotion/styled";
import { getFontColor, stripMarkdown } from "../../utils";
import { DescriptionLink } from "./DescriptionLink";

interface RenderTaskDescriptionProps {
  task: Task;
  textHighlighter?: (text: string) => React.ReactNode;
  enableLinks?: boolean;
  enableMoreButton?: boolean;
}

export const RenderTaskDescription = memo(
  ({
    task,
    textHighlighter = (text) => text,
    enableLinks = true,
    enableMoreButton = false,
  }: RenderTaskDescriptionProps) => {
    const { expandedTasks, toggleShowMore } = useContext(TaskContext);
    // cards show clean text: markdown syntax is removed, not rendered
    const strippedDescription = useMemo(
      () => stripMarkdown(task.description ?? ""),
      [task.description],
    );
    if (!strippedDescription.trim()) return null;

    const isExpanded = enableMoreButton ? expandedTasks.includes(task.id) : false;

    const { color } = task;

    // split the description into parts preserving links
    const parts = strippedDescription.split(URL_REGEX);

    // calculate effective length where urls count as their domain name length
    const effectiveLength = parts.reduce((length, part, index) => {
      const isURL = index % 2 === 1;
      if (isURL) {
        try {
          const domain = new URL(part).hostname.replace("www.", "");
          return length + domain.length;
        } catch {
          return length + part.length;
        }
      }
      return length + part.length;
    }, 0);

    const shouldShowButton = enableMoreButton && effectiveLength > DESCRIPTION_SHORT_LENGTH;

    let truncatedParts = parts;
    let showMore = false;

    if (!isExpanded && effectiveLength > DESCRIPTION_SHORT_LENGTH) {
      let currentLength = 0;
      let truncateIndex = -1;

      // find where to truncate while keeping links intact
      for (let i = 0; i < parts.length; i++) {
        const isURL = i % 2 === 1;
        const part = parts[i];

        if (isURL) {
          // calculate urls effective displayed length (domain name length)
          let urlEffectiveLength;
          try {
            const domain = new URL(part).hostname.replace("www.", "");
            urlEffectiveLength = domain.length;
          } catch {
            urlEffectiveLength = part.length;
          }

          if (currentLength < DESCRIPTION_SHORT_LENGTH) {
            currentLength += urlEffectiveLength;
            if (currentLength > DESCRIPTION_SHORT_LENGTH) {
              truncateIndex = i;
              break;
            }
          } else {
            truncateIndex = i;
            break;
          }
        } else {
          // for text parts
          if (currentLength + part.length > DESCRIPTION_SHORT_LENGTH) {
            truncateIndex = i;
            const remainingLength = DESCRIPTION_SHORT_LENGTH - currentLength;
            parts[i] = part.slice(0, remainingLength);
            break;
          }
          currentLength += part.length;
        }
      }

      if (truncateIndex !== -1) {
        truncatedParts = parts.slice(0, truncateIndex + 1);
        showMore = true;
      }
    }

    const descriptionWithLinks = truncatedParts.map((part, index) => {
      const isURL = index % 2 === 1;
      return isURL ? (
        <DescriptionLink
          key={index}
          url={part}
          color={color}
          disabled={!enableLinks}
          textHighlighter={textHighlighter}
        />
      ) : (
        <React.Fragment key={index}>{textHighlighter(part)}</React.Fragment>
      );
    });

    return (
      <>
        <ScreenDescription
          title={!isExpanded && shouldShowButton ? strippedDescription : undefined}
        >
          {descriptionWithLinks}
          {!isExpanded && showMore && !task.done && "..."}
          {shouldShowButton && !task.done && (
            <ShowMoreBtn onClick={() => toggleShowMore(task.id)} clr={color}>
              {isExpanded ? "Show Less" : "Show More"}
            </ShowMoreBtn>
          )}
        </ScreenDescription>
        <PrintDescription>{strippedDescription}</PrintDescription>
      </>
    );
  },
);

const ShowMoreBtn = styled(Button)<{ clr: string }>`
  background: none;
  border: none;
  cursor: pointer;
  font-size: 16px;
  font-weight: bolder;
  transition: 0.3s color;
  color: ${({ clr }) => getFontColor(clr)};
  text-shadow: ${({ clr }) => `0 0 8px ${getFontColor(clr) + 45}`};
  text-transform: capitalize;
  border-radius: 6px;
  padding: 0 4px;
  margin: 0 4px;
  @media print {
    color: black;
  }
`;

const ScreenDescription = styled.div`
  @media print {
    display: none !important;
  }
`;

const PrintDescription = styled.div`
  display: none;

  @media print {
    display: block !important;
    color: black !important;
  }
`;
