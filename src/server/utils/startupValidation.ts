/**
 * Startup Validation Utilities
 * 
 * Validates critical aspects before server starts to provide better error messages
 * and catch common issues early.
 */

import { logger } from './logger.js';
import { spawnSync } from 'node:child_process';

export interface ValidationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Detects if an error is a compilation/transform error (esbuild, TypeScript, etc.)
 */
export function isCompilationError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  
  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();
  
  return (
    name === 'transformerror' ||
    name === 'compilationerror' ||
    message.includes('transform failed') ||
    message.includes('compilation failed') ||
    message.includes('has already been declared') ||
    message.includes('duplicate declaration') ||
    message.includes('error ts') ||
    message.includes('typescript error')
  );
}

/**
 * Detects if an error is related to missing exports
 */
export function isMissingExportError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  
  const message = error.message.toLowerCase();
  return (
    message.includes('does not provide an export') ||
    message.includes('missing export') ||
    message.includes('cannot find module') ||
    (error.name === 'SyntaxError' && message.includes('export'))
  );
}

/**
 * Extracts helpful information from missing export errors
 */
export function extractExportErrorInfo(error: Error): {
  missingExport?: string;
  modulePath?: string;
  suggestion?: string;
} {
  const message = error.message;
  const result: {
    missingExport?: string;
    modulePath?: string;
    suggestion?: string;
  } = {};
  
  // Pattern: "The requested module '../types/errors.js' does not provide an export named 'AuthorizationError'"
  const exportMatch = message.match(/does not provide an export named ['"]([^'"]+)['"]/);
  if (exportMatch) {
    result.missingExport = exportMatch[1];
  }
  
  // Pattern: "The requested module '../types/errors.js'..."
  const moduleMatch = message.match(/requested module ['"]([^'"]+)['"]/);
  if (moduleMatch) {
    result.modulePath = moduleMatch[1];
  }
  
  // Provide suggestions based on common patterns
  if (result.missingExport && result.modulePath) {
    if (result.modulePath.includes('errors.js')) {
      result.suggestion = `Add 'export { ${result.missingExport} }' to ${result.modulePath} or import directly from the source module`;
    } else if (result.missingExport.includes('Error')) {
      result.suggestion = `Check if ${result.missingExport} is exported from ${result.modulePath}. Common auth errors should be re-exported from src/server/types/errors.ts`;
    }
  }
  
  return result;
}

/**
 * Formats a user-friendly error message for compilation/transform errors
 */
export function formatCompilationErrorMessage(error: Error): string {
  let message = '❌ Compilation/Transform Error\n\n';
  
  // Extract file path and line number from error message
  const fileMatch = error.message.match(/([^:]+\.tsx?):(\d+):(\d+)/);
  if (fileMatch) {
    const [, filePath, line, col] = fileMatch;
    message += `File: ${filePath}\n`;
    message += `Line: ${line}, Column: ${col}\n\n`;
  }
  
  // Extract the actual error message
  const errorMatch = error.message.match(/ERROR:\s*(.+)/);
  if (errorMatch) {
    message += `Error: ${errorMatch[1]}\n\n`;
  } else {
    message += `Error: ${error.message}\n\n`;
  }
  
  message += 'This is a code compilation error that prevents the server from starting.\n';
  message += 'The error occurs during TypeScript/JavaScript transformation (esbuild).\n\n';
  
  message += 'Common causes:\n';
  message += '1. Duplicate variable/function declarations\n';
  message += '2. Syntax errors (missing brackets, semicolons, etc.)\n';
  message += '3. Type errors that prevent compilation\n';
  message += '4. Circular dependencies\n\n';
  
  message += 'To fix:\n';
  message += '1. Check the file and line number mentioned above\n';
  message += '2. Look for duplicate declarations or syntax errors\n';
  message += '3. Run: pnpm run lint (to check for linting issues)\n';
  message += '4. Run: pnpm exec tsc --noEmit (to check TypeScript errors)\n';
  message += '5. Check: docker logs beleidsscan-backend (for full error details)\n';
  
  return message;
}

/**
 * Formats a user-friendly error message for missing export errors
 */
export function formatMissingExportErrorMessage(error: Error): string {
  const info = extractExportErrorInfo(error);
  let message = '❌ Missing Export Error\n\n';
  
  if (info.missingExport) {
    message += `Missing export: ${info.missingExport}\n`;
  }
  
  if (info.modulePath) {
    message += `Module: ${info.modulePath}\n`;
  }
  
  message += '\nThis error prevents the server from starting.\n';
  
  if (info.suggestion) {
    message += `\n💡 Suggestion: ${info.suggestion}\n`;
  }
  
  message += '\nTo fix:\n';
  message += '1. Check the file that imports this export\n';
  message += '2. Verify the export exists in the source module\n';
  message += '3. If importing from a re-export module, ensure it re-exports the symbol\n';
  message += '4. Run: pnpm exec tsx scripts/validate-critical-exports.ts\n';
  
  return message;
}

/**
 * Validates that native Node.js modules can be loaded
 * This catches SIGILL errors early by detecting missing or corrupted native binaries
 */
export function validateNativeModules(): ValidationResult {
  const result: ValidationResult = {
    success: true,
    errors: [],
    warnings: [],
  };

  // List of native modules to validate
  const nativeModules = [
    { name: 'sharp', required: false }, // Image processing - optional
    { name: 'canvas', required: false }, // Canvas rendering - optional
    { name: 'better-sqlite3', required: false }, // SQLite bindings - optional
  ];

  for (const module of nativeModules) {
    // Run validation in a separate process to catch SIGILL/SIGSEGV
    const script = `try { require('${module.name}'); process.exit(0); } catch (e) { console.error(e.message); process.exit(1); }`;
    const child = spawnSync(process.execPath, ['-e', script], {
        encoding: 'utf-8',
        stdio: ['ignore', 'ignore', 'pipe'] // Capture stderr
    });

    if (child.error) {
       // Failed to spawn
       const errorDetails = `Failed to spawn validation process for '${module.name}': ${child.error.message}`;
       if (module.required) {
           result.errors.push(errorDetails);
           result.success = false;
           logger.error({ module: module.name, error: child.error }, `Required native module check failed`);
       } else {
           result.warnings.push(errorDetails);
           logger.warn({ module: module.name, error: child.error }, `Optional native module check failed`);
       }
       continue;
    }

    if (child.status !== 0) {
        // Process failed or crashed
        let errorDetails = `Failed to load native module '${module.name}'`;

        if (child.signal) {
            // Crashed with signal (e.g. SIGILL)
            errorDetails += `: Process crashed with signal ${child.signal}`;
            if (child.signal === 'SIGILL') {
                errorDetails += ' (Illegal Instruction - likely CPU architecture mismatch)';
            }
        } else {
            // Exited with error code
            const stderr = child.stderr ? child.stderr.trim() : 'Unknown error';
            errorDetails += `: ${stderr}`;
        }

        if (module.required) {
            result.errors.push(errorDetails);
            result.success = false;
            logger.error({ module: module.name, signal: child.signal, stderr: child.stderr }, `Required native module '${module.name}' failed to load`);
        } else {
            result.warnings.push(errorDetails);
            logger.warn({ module: module.name, signal: child.signal, stderr: child.stderr }, `Optional native module '${module.name}' failed to load`);
        }
    } else {
        logger.debug(`Native module '${module.name}' loaded successfully`);
    }
  }

  if (result.success && result.warnings.length === 0) {
    logger.info('All native modules validated successfully');
  }

  return result;
}

/**
 * Validates startup prerequisites
 */
export async function validateStartup(): Promise<ValidationResult> {
  const result: ValidationResult = {
    success: true,
    errors: [],
    warnings: [],
  };
  
  // Check critical environment variables
  if (!process.env.MONGODB_URI && process.env.NODE_ENV !== 'test') {
    result.errors.push('MONGODB_URI environment variable is not set');
    result.success = false;
  }
  
  // Check if running in Docker (warning, not error)
  try {
    const { isRunningInDocker } = await import('./dockerDetection.js');
    if (!isRunningInDocker() && process.env.NODE_ENV !== 'test') {
      result.warnings.push('Not running in Docker - some features may not work correctly');
    }
  } catch {
    // dockerDetection may not be available, that's okay
  }

  // Validate native modules (only in non-test environments)
  // Skip in test to avoid issues with test mocks
  if (process.env.NODE_ENV !== 'test' && process.env.TEST_MODE !== 'true') {
    try {
      const nativeModuleValidation = validateNativeModules();
      // Merge results
      result.errors.push(...nativeModuleValidation.errors);
      result.warnings.push(...nativeModuleValidation.warnings);
      if (!nativeModuleValidation.success) {
        result.success = false;
      }
    } catch (validationError) {
      // Don't fail startup if native module validation itself fails
      logger.warn({ error: validationError }, 'Native module validation check failed (continuing anyway)');
      result.warnings.push('Native module validation could not be completed');
    }
  }
  
  return result;
}

/**
 * Enhanced error handler for startup errors
 */
export function handleStartupError(error: unknown, context?: string): never {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const errorName = error instanceof Error ? error.name : 'UnknownError';
  
  // Detect and format missing export errors
  if (isMissingExportError(error)) {
    const formattedMessage = formatMissingExportErrorMessage(error as Error);
    logger.fatal(
      {
        error: {
          name: errorName,
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        context,
        exportInfo: extractExportErrorInfo(error as Error),
      },
      formattedMessage
    );
  } else {
    // Generic startup error
    logger.fatal(
      {
        error: {
          name: errorName,
          message: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
        },
        context,
      },
      `❌ Startup failed${context ? ` in ${context}` : ''}: ${errorMessage}`
    );
  }
  
  // Provide troubleshooting steps
  logger.fatal(
    {
      troubleshooting: [
        'Check server logs for detailed error messages',
        'Verify all environment variables are set correctly',
        'Run: pnpm exec tsx scripts/validate-critical-exports.ts',
        'Check: docker logs beleidsscan-backend',
        'Verify database connections are available',
      ],
    },
    'Troubleshooting steps:'
  );
  
  throw error;
}

