/**
 * Utility for lazy loading React components with error handling
 *
 * Provides a consistent pattern for lazy imports with:
 * - Error handling and fallback components
 * - Support for both default and named exports
 * - Clear error messages and recovery suggestions
 *
 * @example
 * ```tsx
 * const WorkflowPage = lazyImport(
 *   () => import('./pages/WorkflowPage'),
 *   'WorkflowPage',
 *   {
 *     defaultExport: true, // Try default export first, then named export
 *   }
 * );
 * ```
 */
import { ComponentType } from 'react';
interface LazyImportOptions {
    /** Whether to try default export first, then fall back to named export */
    defaultExport?: boolean;
    /** Custom error message prefix (defaults to component name) */
    errorPrefix?: string;
    /** Custom fix instructions (defaults to Vite cache clearing) */
    fixInstructions?: string;
}
/**
 * Creates a lazy-loaded component with error handling
 *
 * @param importFn - Function that returns the import promise
 * @param componentName - Name of the component (for error messages)
 * @param options - Configuration options
 * @returns Lazy-loaded component with error handling
 */
export declare function lazyImport<T extends ComponentType<any>>(importFn: () => Promise<{
    default?: T;
    [key: string]: any;
}>, componentName: string, options?: LazyImportOptions): React.LazyExoticComponent<T>;
export {};
