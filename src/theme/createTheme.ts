import type { PaletteMode, Theme } from "@mui/material";
import { createTheme } from "@mui/material";
import { isGrayscaleColor } from "../utils/colorUtils";
import { muiComponentsProps } from "./muiComponents";
import { ColorPalette, themeConfig } from "./themeConfig";

/**
 * Creates a custom MUI theme based on provided primary color, background color, and palette mode.
 */
export const createCustomTheme = (
  primaryColor: string,
  backgroundColor = "#232e58",
  mode: PaletteMode = "dark",
): Theme => {
  // A grayscale primary marks a monochrome theme, which gets neutral system colors.
  // Derived from the color itself because App.tsx rebuilds the theme from the palette
  // values alone — a flag on the themeConfig entry would not survive that round trip.
  const neutral = isGrayscaleColor(primaryColor);

  return createTheme({
    components: {
      ...muiComponentsProps,
    },
    palette: {
      primary: {
        main: primaryColor,
      },
      secondary: {
        main: backgroundColor,
      },
      warning: {
        main: neutral
          ? mode === "dark"
            ? ColorPalette.monoWarningDark
            : ColorPalette.monoWarningLight
          : mode === "dark"
            ? ColorPalette.orange
            : ColorPalette.orangeDark,
      },
      info: {
        main: neutral
          ? mode === "dark"
            ? ColorPalette.monoInfoDark
            : ColorPalette.monoInfoLight
          : ColorPalette.blue,
      },
      error: {
        main: neutral
          ? mode === "dark"
            ? ColorPalette.monoErrorDark
            : ColorPalette.monoErrorLight
          : ColorPalette.red,
      },
      // background: {
      //   paper: mode === "dark" ? ColorPalette.darkMode : ColorPalette.lightMode,
      // },
      mode,
    },
  });
};

/**
 * List of available themes with their name and corresponding MUI theme object.
 */
export const Themes: { name: string; MuiTheme: Theme }[] = Object.entries(themeConfig).map(
  ([name, config]) => ({
    name,
    MuiTheme: createCustomTheme(config.primaryColor, config.secondaryColor),
  }),
);
