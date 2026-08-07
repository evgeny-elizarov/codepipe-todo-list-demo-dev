export const ColorPalette = {
  fontDark: "#101727",
  fontLight: "#f0f0f0",
  darkMode: "#383838",
  lightMode: "#ffffff",
  purple: "#b624ff",
  red: "#ff3131",
  orange: "#ff9318",
  orangeDark: "#ff9500",
  blue: "#29b6f6",
  // Neutral system colors used by the monochrome themes. Error keeps a (desaturated)
  // red hue so error states stay recognizable.
  monoWarningDark: "#D6D6D6",
  monoWarningLight: "#4A4A4A",
  monoInfoDark: "#8F8F8F",
  monoInfoLight: "#6B6B6B",
  monoErrorDark: "#E06C66",
  monoErrorLight: "#B23A34",
} as const satisfies Record<string, string>;

/**
 * Grayscale ramp used as the default task color palette.
 * Every step stays outside the #6C6C6C–#848484 band where neither font color reaches
 * a 4.5:1 contrast ratio, so `getFontColor` always yields readable text.
 */
export const grayscaleColorList: string[] = [
  "#F5F5F5",
  "#E0E0E0",
  "#C9C9C9",
  "#B2B2B2",
  "#9B9B9B",
  "#8A8A8A",
  "#666666",
  "#525252",
  "#3E3E3E",
  "#2C2C2C",
  "#1C1C1C",
  "#0D0D0D",
];

/**
 * Colors of the default categories — six well-separated steps of `grayscaleColorList`.
 */
export const defaultCategoryColors = {
  home: "#E0E0E0",
  work: "#C9C9C9",
  coding: "#9B9B9B",
  health: "#666666",
  education: "#3E3E3E",
  personal: "#1C1C1C",
} as const satisfies Record<string, string>;

export const themeConfig: { [key: string]: { primaryColor: string; secondaryColor?: string } } = {
  "Dark Purple": {
    // Default dark theme
    primaryColor: ColorPalette.purple,
  },
  "Light Purple": {
    // Default light theme
    primaryColor: ColorPalette.purple,
    secondaryColor: "#edeef6",
  },
  "Dark Blue": {
    primaryColor: "#106cff",
    secondaryColor: "#090815",
  },
  "Light Blue": {
    primaryColor: "#278ad2",
    secondaryColor: "#dddaf6",
  },
  "Dark Pink": {
    primaryColor: "#f2369d",
    secondaryColor: "#191218",
  },
  "Light Pink": {
    primaryColor: "#e5369a",
    secondaryColor: "#ffe3ff",
  },
  "Blush Blossom": {
    primaryColor: "#EC407A",
    secondaryColor: "#FCE4EC",
  },
  Cheesecake: {
    primaryColor: "#E14C94",
    secondaryColor: "#FDF0D5",
  },
  "Mystic Coral": {
    primaryColor: "#ff7b9c",
    secondaryColor: "#4a2333",
  },
  "Dark Orange": {
    primaryColor: "#FF5631",
    secondaryColor: "#0D0D0D",
  },
  "Light Orange": {
    primaryColor: "#F26E56",
    secondaryColor: "#F6F6F6",
  },
  Aurora: {
    primaryColor: "#00e952",
    secondaryColor: "#011926",
  },
  // Strictly achromatic primaries (R = G = B): this is what makes createCustomTheme
  // switch to the neutral system colors, and it keeps the task glow free of any color cast.
  // Keep new themes appended — Themes[0] / Themes[1] are the implicit system dark/light themes.
  "Monochrome Dark": {
    primaryColor: "#9E9E9E",
    secondaryColor: "#121212",
  },
  "Monochrome Light": {
    primaryColor: "#616161",
    secondaryColor: "#F2F2F2",
  },
};
