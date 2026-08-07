import type { SystemTheme } from "../../hooks/useSystemTheme";
import { ColorPalette, themeConfig } from "../../theme/themeConfig";
import type { DarkModeOptions } from "../../types/user";
import { getFontColor, isDark, isDarkMode, isHexColor } from "../colorUtils";

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

const isDarkModeCases: [string, DarkModeOptions, SystemTheme, string, boolean][] = [
  ["force light mode", "light", "dark", "#000000", false],
  ["force dark mode", "dark", "light", "#ffffff", true],
  ["auto mode with system light", "auto", "light", "#ffffff", false],
  ["auto mode with system dark", "auto", "dark", "#ffffff", false],
  ["auto mode with dark background", "auto", "light", "#000000", true],
  ["auto mode with light background", "auto", "dark", "#ffffff", false],
  // The opposing systemTheme proves the result comes from the background, not the system theme
  ["auto mode with Dark Lavender background", "auto", "light", "#1a1220", true],
  ["auto mode with Light Lavender background", "auto", "dark", "#f6e9fb", false],
];

describe("isDarkMode", () => {
  test.each(isDarkModeCases)(
    "should return correct value for %s",
    (_, darkmode, systemTheme, backgroundColor, expected) => {
      expect(isDarkMode(darkmode, systemTheme, backgroundColor)).toBe(expected);
    },
  );
});

// The app never computes a WCAG ratio at runtime - getFontColor only compares brightness -
// so these helpers stay local to the test instead of becoming a production util.
const channels = (hexColor: string): number[] =>
  [1, 3, 5].map((index) => parseInt(hexColor.slice(index, index + 2), 16));

const relativeLuminance = (hexColor: string): number => {
  const [red, green, blue] = channels(hexColor)
    .map((channel) => channel / 255)
    .map((channel) => (channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
};

const contrastRatio = (colorA: string, colorB: string): number => {
  const luminances = [relativeLuminance(colorA), relativeLuminance(colorB)];
  return (Math.max(...luminances) + 0.05) / (Math.min(...luminances) + 0.05);
};

const channelSpread = (hexColor: string): number => {
  const values = channels(hexColor);
  return Math.max(...values) - Math.min(...values);
};

// Scoped deliberately to the lavender themes: several older primaries (Dark Pink, Light Pink,
// Blush Blossom, Dark Purple) are below AA today, so an all-themes loop would fail on legacy data.
const lavenderThemes = ["Dark Lavender", "Light Lavender"] as const;

// Both entries declare secondaryColor explicitly; omitting it would fall back to the "#232e58"
// default of createCustomTheme, so the isHexColor check below is also an "it is declared" check.
const lavenderSurfaces = lavenderThemes.flatMap((name): [string, string][] => {
  const { primaryColor, secondaryColor = "" } = themeConfig[name];
  return [
    [`${name} primaryColor`, primaryColor],
    [`${name} secondaryColor`, secondaryColor],
  ];
});

describe("lavender themes", () => {
  test.each(lavenderSurfaces)(
    "%s reaches WCAG AA against the font color the app picks",
    (_, color) => {
      expect(isHexColor(color)).toBe(true);
      expect(contrastRatio(color, getFontColor(color))).toBeGreaterThanOrEqual(4.5);
    },
  );

  // Guards against the primaries being treated as achromatic (channel spread <= 8), which would
  // swap the system error/warning/info colors for neutral ones.
  test.each(lavenderThemes)("%s primaryColor stays chromatic", (name) => {
    expect(channelSpread(themeConfig[name].primaryColor)).toBeGreaterThan(8);
  });

  // Themes[0] / Themes[1] are the implicit system dark/light themes, indexed positionally.
  it("are appended after the existing themes", () => {
    expect(Object.keys(themeConfig).slice(-2)).toEqual([...lavenderThemes]);
  });
});
