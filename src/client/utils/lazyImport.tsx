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

import { ComponentType, lazy } from 'react';

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
export function lazyImport<T extends ComponentType<any>>(
  importFn: () => Promise<{ default?: T; [key: string]: any }>,
  componentName: string,
  options: LazyImportOptions = {}
): React.LazyExoticComponent<T> {
  const {
    defaultExport = false,
    errorPrefix = componentName,
    fixInstructions = 'pnpm run clean:vite && pnpm run dev:frontend:clean'
  } = options;

  return lazy(() => {
    return importFn()
      .then(module => {
        // Try to get the component
        let Component: T | undefined;
        
        if (defaultExport) {
          // Try default export first, then named export
          Component = module.default || (module[componentName] as T);
        } else {
          // Try named export first, then default export
          Component = (module[componentName] as T) || module.default;
        }

        if (!Component) {
          throw new Error(
            `Component ${componentName} not found in module. ` +
            `Available exports: ${Object.keys(module).join(', ')}`
          );
        }

        return { default: Component };
      })
      .catch((error) => {
        // Detect MIME type errors specifically
        const isMimeTypeError = error?.message?.includes('MIME type') || 
                                error?.message?.includes('text/html') ||
                                error?.message?.includes('Failed to fetch dynamically imported module');
        
        const errorMessage = error?.message || 'Unknown error';
        const isServerReturningHtml = isMimeTypeError || errorMessage.includes('text/html');
        
        console.error(`[${errorPrefix}] Failed to load module:`, error);
        console.error(`[${errorPrefix}] Error details:`, {
          message: errorMessage,
          stack: error?.stack,
          name: error?.name,
          isMimeTypeError,
          isServerReturningHtml
        });
        
        // Provide specific guidance for MIME type errors
        if (isServerReturningHtml) {
          console.error(`[${errorPrefix}] ⚠️  MIME Type Error Detected:`);
          console.error(`   The server returned HTML instead of JavaScript for this module.`);
          console.error(`   This usually indicates:`);
          console.error(`   1. Vite dev server is serving index.html as fallback`);
          console.error(`   2. The module file doesn't exist or can't be resolved`);
          console.error(`   3. Reverse proxy misconfiguration`);
          console.error(`   Solutions:`);
          console.error(`   1. Check if Vite dev server is running`);
          console.error(`   2. Clear Vite cache: pnpm run clean:vite`);
          console.error(`   3. Restart dev server: pnpm run dev:frontend:clean`);
          console.error(`   4. Check for reverse proxy configuration issues`);
        }

        // Return a fallback component
        const FallbackComponent = () => (
          <div className="p-8">
            <h2 className="text-2xl font-bold mb-4">Error loading {componentName}</h2>
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
              <p className="text-red-800 dark:text-red-200 mb-2">
                The {componentName} module could not be loaded. This is usually caused by:
              </p>
              <ul className="list-disc list-inside text-sm text-red-700 dark:text-red-300 space-y-1 mb-4">
                {isServerReturningHtml ? (
                  <>
                    <li><strong>MIME Type Error:</strong> Server returned HTML instead of JavaScript</li>
                    <li>Vite dev server may be serving index.html as fallback</li>
                    <li>Module file may not exist or can't be resolved</li>
                    <li>Reverse proxy misconfiguration</li>
                  </>
                ) : (
                  <>
                    <li>Vite dev server cache issues</li>
                    <li>Network connectivity problems</li>
                    <li>Module compilation errors</li>
                  </>
                )}
              </ul>
              <p className="text-sm text-red-600 dark:text-red-400 mb-2">
                <strong>Error:</strong> {errorMessage}
              </p>
              {isServerReturningHtml && (
                <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded">
                  <p className="text-sm text-yellow-800 dark:text-yellow-200 font-semibold mb-1">
                    MIME Type Error Detected
                  </p>
                  <p className="text-xs text-yellow-700 dark:text-yellow-300">
                    The server returned HTML instead of JavaScript. Check the browser console and Vite dev server logs for details.
                  </p>
                </div>
              )}
            </div>
            <div className="space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 mr-2"
              >
                Refresh Page
              </button>
              <button
                onClick={() => {
                  console.log(`To fix: Run "${fixInstructions}"`);
                  alert(
                    `To fix this issue:\n` +
                    `1. Stop the Vite dev server\n` +
                    `2. Run: ${fixInstructions}\n` +
                    `3. Restart the dev server`
                  );
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
              >
                Show Fix Instructions
              </button>
            </div>
          </div>
        );
        
        return { default: FallbackComponent as unknown as T };
      });
  }) as React.LazyExoticComponent<T>;
}
