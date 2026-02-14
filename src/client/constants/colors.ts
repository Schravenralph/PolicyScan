/**
 * Centralized Accessible Color Constants
 * 
 * Color contrast utilities for accessibility.
 * These colors have been chosen to meet WCAG AA standards.
 * 
 * **Contrast Ratios (on white background):**
 * - `goldLight` (#9C885C): 3.45:1 - Below WCAG AA for normal text (4.5:1 required)
 * - `goldText` (#7A6A47): 4.5:1+ - Meets WCAG AA for normal text
 * - `goldDark` (#5C4F35): 6.5:1+ - Exceeds WCAG AA, good for small text
 * 
 * **Usage Guidelines:**
 * - **Text elements**: Always use `goldText` or `goldDark` for readable text
 * - **Icons**: Can use `goldLight` for decorative icons (3:1 required for large icons)
 * - **Borders/Accents**: `goldLight` acceptable for non-text elements
 * 
 * **⚠️ IMPORTANT:**
 * - NEVER use `goldLight` (#9C885C) for text - it fails WCAG AA
 * - Always use `goldText` or `goldDark` for text elements
 * - Use `goldLight` only for decorative icons, borders, or backgrounds
 * 
 * @example
 * ```tsx
 * // ✅ CORRECT - Use goldText for text
 * <p style={{ color: ACCESSIBLE_COLORS.goldText }}>Readable text</p>
 * 
 * // ❌ WRONG - Don't use goldLight for text
 * <p style={{ color: ACCESSIBLE_COLORS.goldLight }}>Hard to read</p>
 * 
 * // ✅ CORRECT - goldLight OK for decorative icons
 * <Icon style={{ color: ACCESSIBLE_COLORS.goldLight }} aria-hidden="true" />
 * ```
 * 
 * @see https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html
 * @see docs/04-policies/accessibility-color-guidelines.md
 */

export const ACCESSIBLE_COLORS = {
  /**
   * Darker gold that meets WCAG AA (4.5:1) on white background.
   * ✅ USE FOR TEXT ELEMENTS
   * Contrast: 5.28:1 on white
   */
  goldText: '#7A6A47',
  
  /**
   * Original gold color for icons and accents only.
   * ⚠️ DO NOT USE FOR TEXT - Only 3.45:1 contrast (fails WCAG AA)
   * ✅ OK for: Decorative icons, borders, backgrounds
   * Contrast: 3.45:1 on white (fails normal text, passes large text)
   */
  goldLight: '#9C885C',
  
  /**
   * Even darker gold for small text (exceeds WCAG AA).
   * ✅ USE FOR TEXT ELEMENTS (especially small text)
   * Contrast: 8.00:1 on white
   */
  goldDark: '#5C4F35',
  
  /**
   * Status colors with good contrast
   */
  approved: '#002EA3',    // Blue - meets WCAG AA
  rejected: '#BF581A',    // Orange - meets WCAG AA
  pending: '#6B7280',     // Gray - meets WCAG AA
} as const;

/**
 * Type for ACCESSIBLE_COLORS keys
 */
export type AccessibleColorKey = keyof typeof ACCESSIBLE_COLORS;

/**
 * Brand colors used throughout the application
 * Note: secondary uses goldText (#7A6A47) instead of goldLight for WCAG AA compliance
 */
export const BRAND_COLORS = {
  primary: '#002EA3',     // Primary blue
  secondary: '#7A6A47',   // Gold accent (goldText - meets WCAG AA for text)
  accent: '#BF581A',      // Orange accent (accessible)
  dark: '#161620',        // Dark text/background
  light: '#F7F4EF',       // Light background
} as const;

/**
 * Overheidslaag (government layer) colors
 * Used for visual distinction of different government types
 * Note: provincie uses goldText (#7A6A47) instead of goldLight for WCAG AA compliance
 */
export const OVERHEIDSLAAG_COLORS = {
  gemeente: '#002EA3',      // Municipality - Blue
  waterschap: '#7F00FF',    // Water board - Purple
  provincie: '#7A6A47',     // Province - Gold (goldText - meets WCAG AA for text)
  rijk: '#BF581A',          // National - Orange (accessible)
  kennisinstituut: '#161620', // Knowledge institute - Dark
} as const;

export type OverheidslaagColorKey = keyof typeof OVERHEIDSLAAG_COLORS;

