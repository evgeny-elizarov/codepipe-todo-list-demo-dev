import type { SystemTheme } from "../../hooks/useSystemTheme";
import {
  ColorPalette,
  defaultCategoryColors,
  grayscaleColorList,
  themeConfig,
} from "../../theme/themeConfig";
import type { DarkModeOptions } from "../../types/user";
import { getFontColor, isDark, isDarkMode, isGrayscaleColor, isHexColor } from "../colorUtils";

describe("isHexColor", () => {
  it("validates correct hex colors", () => {
    expect(isHexColor("#FFFFFF")).toBe(true);
    expect(isHexColor("#FFF")).toBe(true);
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#123456")).toBe(true);
  });

  it("rejects incorrect hex colors", () => {
    expect(isHexColor("FFFFFF")).toBe(false);
    expect(isHexColor("#FFFF")).toBe(false);
    expect(isHexColor("#GGGGGG")).toBe(false);
    expect(isHexColor("#1234567")).toBe(false);
  });
});

describe("getFontColor", () => {
  it("returns dark font color for bright backgrounds", () => {
    const result = getFontColor("#FFF");
    expect(result).toBe(ColorPalette.fontDark);
  });

  it("returns light font color for dark backgrounds", () => {
    const result = getFontColor("#000000");
    expect(result).toBe(ColorPalette.fontLight);
  });

  it("returns dark font color for mid-tone bright backgrounds", () => {
    const result = getFontColor("#F0F0F0");
    expect(result).toBe(ColorPalette.fontDark);
  });

  it("returns light font color for mid-tone dark backgrounds", () => {
    const result = getFontColor("#202020");
    expect(result).toBe(ColorPalette.fontLight);
  });

  it("handles hex colors with lowercase letters", () => {
    const result = getFontColor("#abcdef");
    expect(result).toBe(ColorPalette.fontDark);
  });

  it("returns correct color for near-threshold brightness", () => {
    const result = getFontColor("#7F7F7F"); // Near threshold value
    expect(result).toBe(ColorPalette.fontLight);
  });
});

describe("isDark", () => {
  it("returns true for dark colors", () => {
    expect(isDark("#202020")).toBe(true);
    expect(isDark("#7F7F7F")).toBe(true); // Near-threshold gray
  });

  it("returns false for light colors", () => {
    expect(isDark("#F0F0F0")).toBe(false);
    expect(isDark("#abcdef")).toBe(false);
  });
});

describe("isGrayscaleColor", () => {
  const monochromePrimaries = [
    themeConfig["Monochrome Dark"].primaryColor,
    themeConfig["Monochrome Light"].primaryColor,
  ];

  it.each([...monochromePrimaries, ...grayscaleColorList, ...Object.values(defaultCategoryColors)])(
    "returns true for the grayscale color %s",
    (color) => {
      expect(isGrayscaleColor(color)).toBe(true);
    },
  );

  // Guards the monochrome branch of createCustomTheme: no existing theme may silently
  // switch to the neutral system colors.
  it.each(Object.entries(themeConfig).filter(([name]) => !name.startsWith("Monochrome")))(
    "returns false for the primary color of theme %s",
    (_, config) => {
      expect(isGrayscaleColor(config.primaryColor)).toBe(false);
    },
  );

  it("returns false for an invalid hex color", () => {
    expect(isGrayscaleColor("888888")).toBe(false);
    expect(isGrayscaleColor("#GGGGGG")).toBe(false);
    expect(isGrayscaleColor("")).toBe(false);
  });

  it("expands shorthand hex colors", () => {
    expect(isGrayscaleColor("#888")).toBe(true);
    expect(isGrayscaleColor("#f00")).toBe(false);
  });

  it("respects the tolerance argument", () => {
    expect(isGrayscaleColor("#807F7F")).toBe(true); // spread of 1
    expect(isGrayscaleColor("#807F7F", 0)).toBe(false);
    expect(isGrayscaleColor("#9E8E8E")).toBe(false); // spread of 16
    expect(isGrayscaleColor("#9E8E8E", 16)).toBe(true);
  });
});

/**
 * WCAG relative luminance — kept local to the test so the shipped color values are
 * checked against an independent implementation.
 */
const relativeLuminance = (hexColor: string): number => {
  const hex = hexColor.slice(1);
  const [red, green, blue] = [0, 2, 4]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4),
    );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (a: string, b: string): number => {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (lighter + 0.05) / (darker + 0.05);
};

describe("contrast of the monochrome palettes", () => {
  // getFontColor flips at brightness 128, and around that switch neither font color
  // reaches WCAG AA. Every shipped gray must stay outside that band.
  it.each([
    ...grayscaleColorList,
    ...Object.values(defaultCategoryColors),
    themeConfig["Monochrome Dark"].primaryColor,
    themeConfig["Monochrome Light"].primaryColor,
  ])("gives %s a font color with at least a 4.5:1 ratio", (color) => {
    expect(contrastRatio(color, getFontColor(color))).toBeGreaterThanOrEqual(4.5);
  });

  it.each([
    ["warning", ColorPalette.monoWarningDark, ColorPalette.monoWarningLight],
    ["info", ColorPalette.monoInfoDark, ColorPalette.monoInfoLight],
    ["error", ColorPalette.monoErrorDark, ColorPalette.monoErrorLight],
  ])("keeps the monochrome %s color readable on both backgrounds", (_, dark, light) => {
    expect(
      contrastRatio(dark, themeConfig["Monochrome Dark"].secondaryColor as string),
    ).toBeGreaterThanOrEqual(4.5);
    expect(
      contrastRatio(light, themeConfig["Monochrome Light"].secondaryColor as string),
    ).toBeGreaterThanOrEqual(4.5);
  });
});

const isDarkModeCases: [string, DarkModeOptions, SystemTheme, string, boolean][] = [
  ["force light mode", "light", "dark", "#000000", false],
  ["force dark mode", "dark", "light", "#ffffff", true],
  ["auto mode with system light", "auto", "light", "#ffffff", false],
  ["auto mode with system dark", "auto", "dark", "#ffffff", false],
  ["auto mode with dark background", "auto", "light", "#000000", true],
  ["auto mode with light background", "auto", "dark", "#ffffff", false],
  ["auto mode with the Monochrome Dark background", "auto", "light", "#121212", true],
  ["auto mode with the Monochrome Light background", "auto", "dark", "#F2F2F2", false],
];

describe("isDarkMode", () => {
  test.each(isDarkModeCases)(
    "should return correct value for %s",
    (_, darkmode, systemTheme, backgroundColor, expected) => {
      expect(isDarkMode(darkmode, systemTheme, backgroundColor)).toBe(expected);
    },
  );
});
