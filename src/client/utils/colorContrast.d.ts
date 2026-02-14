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
 * Calculate contrast ratio between two colors
 * Returns a value between 1 (no contrast) and 21 (maximum contrast)
 */
export declare function getContrastRatio(color1: string, color2: string): number;
/**
 * Check if contrast ratio meets WCAG AA standards
 */
export declare function meetsWCAGAA(foreground: string, background: string, isLargeText?: boolean): boolean;
/**
 * Check if contrast ratio meets WCAG AAA standards
 */
export declare function meetsWCAGAAA(foreground: string, background: string, isLargeText?: boolean): boolean;
/**
 * Get accessible text color for a background
 * Returns either dark or light text based on contrast
 */
export declare function getAccessibleTextColor(backgroundColor: string): string;
/**
 * Color palette with contrast information
 */
export declare const colorPalette: {
    readonly primary: {
        readonly blue: "#002EA3";
        readonly gold: "#9C885C";
        readonly dark: "#161620";
        readonly orange: "#F37021";
        readonly purple: "#7F00FF";
        readonly background: "#F7F4EF";
        readonly white: "#FFFFFF";
        readonly lightGray: "#E5E5E5";
    };
    readonly accessible: {
        readonly darkOnWhite: {
            readonly text: "#161620";
            readonly bg: "#FFFFFF";
        };
        readonly darkOnLight: {
            readonly text: "#161620";
            readonly bg: "#F7F4EF";
        };
        readonly darkOnGold: {
            readonly text: "#161620";
            readonly bg: "#9C885C";
        };
        readonly whiteOnBlue: {
            readonly text: "#FFFFFF";
            readonly bg: "#002EA3";
        };
        readonly whiteOnDark: {
            readonly text: "#FFFFFF";
            readonly bg: "#161620";
        };
        readonly whiteOnOrange: {
            readonly text: "#FFFFFF";
            readonly bg: "#F37021";
        };
        readonly whiteOnPurple: {
            readonly text: "#FFFFFF";
            readonly bg: "#7F00FF";
        };
    };
};
