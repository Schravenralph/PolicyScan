/**
 * Stub module for native Node.js modules that should never be imported in browser code
 *
 * This prevents Vite from trying to bundle native modules (sharp, canvas, better-sqlite3)
 * which would cause SIGILL errors or other issues in the browser.
 *
 * If you see this error, it means native Node.js modules are being imported in client code,
 * which should never happen. These modules are server-only.
 */
export default function nativeModuleStub(): void;
export declare const createCanvas: typeof nativeModuleStub;
export declare const Database: typeof nativeModuleStub;
export declare const sharp: typeof nativeModuleStub;
