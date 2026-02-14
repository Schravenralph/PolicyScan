/**
 * Stub module for native Node.js modules that should never be imported in browser code
 * 
 * This prevents Vite from trying to bundle native modules (sharp, canvas, better-sqlite3)
 * which would cause SIGILL errors or other issues in the browser.
 * 
 * If you see this error, it means native Node.js modules are being imported in client code,
 * which should never happen. These modules are server-only.
 */

export default function nativeModuleStub() {
  throw new Error(
    'Native Node.js modules (sharp, canvas, better-sqlite3) cannot be used in browser code. ' +
    'These modules are server-only and should never be imported in client-side code. ' +
    'If you need similar functionality in the browser, use browser-compatible alternatives.'
  );
}

// Export as default and named exports to catch various import patterns
export const createCanvas = nativeModuleStub;
export const Database = nativeModuleStub;
export const sharp = nativeModuleStub;
