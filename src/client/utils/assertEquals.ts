import { logError } from './errorHandler.js';

export type AssertEqualsOptions = {
  message?: string;
  tolerance?: number;
  throwOnError?: boolean;
  context?: Record<string, unknown>;
};

interface ImportMetaEnv {
  DEV?: boolean;
}

interface ImportMeta {
  env?: ImportMetaEnv;
}

const isDevEnv =
  (typeof import.meta !== 'undefined' && Boolean((import.meta as unknown as ImportMeta).env?.DEV)) ||
  false;

const defaultFormatter = (actual: unknown, expected: unknown) =>
  `assertEquals failed: expected ${String(actual)} to equal ${String(expected)}`;

const nearlyEqual = (a: number, b: number, tolerance: number) =>
  Math.abs(a - b) <= tolerance;

const deepEqual = (a: unknown, b: unknown): boolean => {
  if (Object.is(a, b)) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, idx) => deepEqual(val, b[idx]));
  }
  if (
    a &&
    b &&
    typeof a === 'object' &&
    typeof b === 'object' &&
    !Array.isArray(a) &&
    !Array.isArray(b)
  ) {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => keysB.includes(key) && deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
  }
  return false;
};

export function assertEquals<T>(
  actual: T,
  expected: T,
  options: AssertEqualsOptions = {}
): void {
  if (!isDevEnv) return;

  const { message, tolerance = 0, throwOnError = true, context } = options;

  const matches =
    typeof actual === 'number' && typeof expected === 'number'
      ? nearlyEqual(actual, expected, tolerance)
      : deepEqual(actual, expected);

  if (!matches) {
    const detail = message ?? defaultFormatter(actual, expected);
    const debugInfo = { actual, expected, tolerance, context };
    const error = new Error(`${detail} - Debug: ${JSON.stringify(debugInfo)}`);
     
    logError(error, 'assertEquals');
    if (throwOnError) {
      throw new Error(detail);
    }
  }
}

