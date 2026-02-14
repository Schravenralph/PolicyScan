/**
 * Normalizes color-related environment variables to prevent Node.js warnings.
 * 
 * Node.js warns when both NO_COLOR and FORCE_COLOR are set because FORCE_COLOR
 * takes precedence, making NO_COLOR ignored. This utility resolves the conflict
 * by unsetting NO_COLOR when FORCE_COLOR is set.
 * 
 * This should be called at the very beginning of the application startup,
 * before any imports that might trigger the warning.
 * 
 * @returns Object with information about what was normalized
 */
export function normalizeColorEnvironment(): {
  noColorWasSet: boolean;
  forceColorWasSet: boolean;
  action: 'none' | 'unset-no-color' | 'already-clean';
} {
  const noColorSet = process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== '';
  const forceColorSet = process.env.FORCE_COLOR !== undefined && process.env.FORCE_COLOR !== '';

  // If both are set, FORCE_COLOR takes precedence, so unset NO_COLOR
  if (noColorSet && forceColorSet) {
    delete process.env.NO_COLOR;
    return {
      noColorWasSet: true,
      forceColorWasSet: true,
      action: 'unset-no-color',
    };
  }

  // If only NO_COLOR is set, leave it (that's valid)
  if (noColorSet && !forceColorSet) {
    return {
      noColorWasSet: true,
      forceColorWasSet: false,
      action: 'already-clean',
    };
  }

  // If only FORCE_COLOR is set, that's fine
  if (!noColorSet && forceColorSet) {
    return {
      noColorWasSet: false,
      forceColorWasSet: true,
      action: 'already-clean',
    };
  }

  // Neither is set, which is also fine
  return {
    noColorWasSet: false,
    forceColorWasSet: false,
    action: 'none',
  };
}




