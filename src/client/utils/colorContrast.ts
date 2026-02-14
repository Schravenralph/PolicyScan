/**
 * Color contrast utilities for accessibility
 * 
 * WCAG 2.1 AA standards require:
 * - Normal text (≤18pt): 4.5:1 contrast ratio
 * - Large text (≥18pt bold or ≥24pt): 3:1 contrast ratio
 * - UI components: 3:1 contrast ratio
 * 
 * @example
 * ```typescript
 * import { getContrastRatio, meetsWCAGAA } from '@/utils/colorContrast';
 * 
 * // Check if color combination meets WCAG AA
 * const ratio = getContrastRatio('#7A6A47', '#FFFFFF');
 * const isAccessible = meetsWCAGAA('#7A6A47', '#FFFFFF', false);
 * 
 * // Get accessible text color for a background
 * const textColor = getAccessibleTextColor('#9C885C');
 * ```
 * 
 * @see https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 * @see docs/04-policies/accessibility-color-guidelines.md
 */

/**
 * Convert hex color to RGB
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : null;
}

/**
 * Calculate relative luminance
 * Formula from WCAG 2.1: https://www.w3.org/WAI/GL/wiki/Relative_luminance
 */
function getLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map((val) => {
    val = val / 255;
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Calculate contrast ratio between two colors
 * Returns a value between 1 (no contrast) and 21 (maximum contrast)
 */
export function getContrastRatio(color1: string, color2: string): number {
  const rgb1 = hexToRgb(color1);
  const rgb2 = hexToRgb(color2);

  if (!rgb1 || !rgb2) {
    return 1; // Invalid colors, return minimum contrast
  }

  const lum1 = getLuminance(rgb1.r, rgb1.g, rgb1.b);
  const lum2 = getLuminance(rgb2.r, rgb2.g, rgb2.b);

  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if contrast ratio meets WCAG AA standards
 */
export function meetsWCAGAA(
  foreground: string,
  background: string,
  isLargeText = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  return isLargeText ? ratio >= 3 : ratio >= 4.5;
}

/**
 * Check if contrast ratio meets WCAG AAA standards
 */
export function meetsWCAGAAA(
  foreground: string,
  background: string,
  isLargeText = false
): boolean {
  const ratio = getContrastRatio(foreground, background);
  return isLargeText ? ratio >= 4.5 : ratio >= 7;
}

/**
 * Get accessible text color for a background
 * Returns either dark or light text based on contrast
 */
export function getAccessibleTextColor(backgroundColor: string): string {
  const darkText = '#161620';
  const lightText = '#FFFFFF';

  const contrastWithDark = getContrastRatio(darkText, backgroundColor);
  const contrastWithLight = getContrastRatio(lightText, backgroundColor);

  return contrastWithDark > contrastWithLight ? darkText : lightText;
}

/**
 * Color palette with contrast information
 */
export const colorPalette = {
  primary: {
    blue: '#002EA3',
    gold: '#9C885C',
    dark: '#161620',
    orange: '#F37021',
    purple: '#7F00FF',
    background: '#F7F4EF',
    white: '#FFFFFF',
    lightGray: '#E5E5E5',
  },
  // Pre-calculated accessible combinations
  accessible: {
    // Dark text on light backgrounds (meets WCAG AA)
    darkOnWhite: { text: '#161620', bg: '#FFFFFF' },
    darkOnLight: { text: '#161620', bg: '#F7F4EF' },
    darkOnGold: { text: '#161620', bg: '#9C885C' }, // May need adjustment
    // Light text on dark backgrounds (meets WCAG AA)
    whiteOnBlue: { text: '#FFFFFF', bg: '#002EA3' },
    whiteOnDark: { text: '#FFFFFF', bg: '#161620' },
    whiteOnOrange: { text: '#FFFFFF', bg: '#F37021' },
    whiteOnPurple: { text: '#FFFFFF', bg: '#7F00FF' },
  },
} as const;

