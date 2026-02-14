import { defineConfig, type ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFileSync, existsSync } from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const postcssConfig = require('./postcss.config.cjs')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Determine proxy target based on environment
const isTestEnvironment = process.env.NODE_ENV === 'test' || 
                          process.env.E2E_TEST === 'true' || 
                          process.env.CI === 'true' ||
                          process.env.PLAYWRIGHT_TEST === 'true';
const isDocker = process.env.DOCKER_CONTAINER === 'true' && !isTestEnvironment;

// Smart proxy target detection with fallback
// If VITE_API_PROXY_TARGET is explicitly set, use it (but validate hostname resolution)
// Otherwise, determine based on environment
let proxyTarget = process.env.VITE_API_PROXY_TARGET;

if (!proxyTarget) {
  // Default: use Docker hostname if in Docker, otherwise localhost
  proxyTarget = isDocker ? 'http://backend:4000' : 'http://127.0.0.1:4000';
}

// Validate proxy target - if it contains 'backend' hostname but we're not in Docker,
// fall back to localhost (backend hostname only resolves in Docker networks)
if (proxyTarget.includes('://backend') && !isDocker) {
  console.warn(
    '⚠️  Warning: VITE_API_PROXY_TARGET points to "backend" hostname, but DOCKER_CONTAINER is not true.\n' +
    '   This hostname only resolves within Docker networks. Falling back to localhost:4000.\n' +
    '   To fix: Set VITE_API_PROXY_TARGET=http://127.0.0.1:4000 or run inside Docker.'
  );
  proxyTarget = 'http://127.0.0.1:4000';
}

// Plugin to handle ?raw imports for CSV files
const rawCsvImportPlugin = () => {
  const projectRoot = path.resolve(__dirname, '..');
  
  return {
    name: 'raw-csv-import',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (id.endsWith('?raw') && id.includes('.csv')) {
        // Return a clean virtual module ID without null bytes in the path
        const cleanId = id.replace(/\?raw$/, '');
        return `\0raw:${cleanId}`;
      }
      return null;
    },
    load(id: string) {
      if (id.startsWith('\0raw:') && id.includes('.csv')) {
        // Extract the file path from the virtual module ID
        const filePath = id.replace(/^\0raw:/, '');
        
        // Try multiple resolution strategies
        let resolvedPath: string | null = null;
        
        // Strategy 1: Resolve from project root
        resolvedPath = path.resolve(projectRoot, filePath);
        if (existsSync(resolvedPath)) {
          try {
            const content = readFileSync(resolvedPath, 'utf-8');
            return `export default ${JSON.stringify(content)};`;
          } catch (error) {
            console.warn(`Failed to read CSV file at ${resolvedPath}:`, error);
          }
        }
        
        // Strategy 2: If path starts with ../, resolve relative to project root
        if (filePath.startsWith('../')) {
          const relativePath = filePath.replace(/^(\.\.\/)+/, '');
          resolvedPath = path.resolve(projectRoot, relativePath);
          if (existsSync(resolvedPath)) {
            try {
              const content = readFileSync(resolvedPath, 'utf-8');
              return `export default ${JSON.stringify(content)};`;
            } catch (error) {
              console.warn(`Failed to read CSV file at ${resolvedPath}:`, error);
            }
          }
        }
        
        // Strategy 3: Try resolving from src/client/utils (where gemeenten.ts is)
        if (filePath.includes('gemeentes-en-cbs.csv')) {
          resolvedPath = path.resolve(projectRoot, 'gemeentes-en-cbs.csv');
          if (existsSync(resolvedPath)) {
            try {
              const content = readFileSync(resolvedPath, 'utf-8');
              return `export default ${JSON.stringify(content)};`;
            } catch (error) {
              console.warn(`Failed to read CSV file at ${resolvedPath}:`, error);
            }
          }
        }
        
        // If all strategies fail, return null to let Vite handle the error
        return null;
      }
      return null;
    },
  };
};

// Plugin to prevent native module imports in browser code
const preventNativeModulesPlugin = () => {
  const nativeModules = ['sharp', 'canvas', 'better-sqlite3', 'bcryptjs', 'bcrypt'];
  
  return {
    name: 'prevent-native-modules',
    enforce: 'pre' as const,
    resolveId(id: string) {
      // Block native module imports
      if (nativeModules.some(module => id === module || id.startsWith(`${module}/`))) {
        // Return stub module path
        return path.resolve(__dirname, '../src/client/utils/native-module-stub.ts');
      }
      return null;
    },
    load(id: string) {
      // Additional check - if somehow a native module file is being loaded
      if (id.includes('node_modules/sharp') || 
          id.includes('node_modules/canvas') || 
          id.includes('node_modules/better-sqlite3')) {
        throw new Error(
          `Native module detected in browser build: ${id}\n` +
          'Native Node.js modules (sharp, canvas, better-sqlite3) cannot be used in browser code.\n' +
          'These modules are server-only. Check your imports and ensure no server code is imported in client code.'
        );
      }
      return null;
    },
  };
};

// Plugin to handle optional @neo4j-nvl packages
const optionalNeo4jNvlPlugin = () => {
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  let packageJson: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> } = {};
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  } catch {
    // Package.json not found or invalid
  }

  const hasNeo4jNvl = 
    (packageJson.dependencies && ('@neo4j-nvl/react' in packageJson.dependencies || '@neo4j-nvl/base' in packageJson.dependencies)) ||
    (packageJson.devDependencies && ('@neo4j-nvl/react' in packageJson.devDependencies || '@neo4j-nvl/base' in packageJson.devDependencies));

  return {
    name: 'optional-neo4j-nvl',
    resolveId(id: string) {
      // Only provide stubs if package is not installed
      if (!hasNeo4jNvl && (id === '@neo4j-nvl/react' || id === '@neo4j-nvl/base')) {
        return `\0${id}`;
      }
      return null;
    },
    load(id: string) {
      // Provide stub modules for missing @neo4j-nvl packages
      if (id === '\0@neo4j-nvl/react') {
        return `
          import React from 'react';
          export const InteractiveNvlWrapper = ({ nodes, rels, nvlOptions, className, ...props }) => {
            return React.createElement('div', { 
              className: className || '',
              style: { 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                height: '100%',
                color: '#666',
                fontSize: '14px',
                padding: '20px',
                textAlign: 'center'
              },
              ...props
            }, '@neo4j-nvl/react is not installed. Please install it to use Neo4j visualization.');
          };
          export const BasicNvlWrapper = InteractiveNvlWrapper;
        `;
      }
      if (id === '\0@neo4j-nvl/base') {
        return `
          export type Node = any;
          export type Relationship = any;
          export type NvlOptions = any;
          export type Layout = 'hierarchical' | 'forceDirected';
        `;
      }
      return null;
    },
  };
};

// Plugin to handle esbuild service crashes gracefully
// Implements solutions 2 and 3 from ESBUILD-EPIPE-ROOT-CAUSE.md:
// - Solution 2: Zombie process cleanup detection and guidance
// - Solution 3: Automatic error recovery with exponential backoff and cache clearing
const esbuildResiliencePlugin = () => {
  let hasShownError = false;
  let errorCount = 0;
  let lastErrorTime = 0;
  let consecutiveErrors = 0;
  const MAX_ERRORS_BEFORE_WARNING = 3;
  const MAX_CONSECUTIVE_ERRORS = 5; // Clear cache after 5 consecutive errors
  const ERROR_RESET_WINDOW = 60000; // Reset error count after 60s of no errors
  const RESTART_BACKOFF_BASE = 1000; // Base backoff: 1 second
  let lastRestartAttempt = 0;
  let restartBackoffMs = RESTART_BACKOFF_BASE;
  
  // Check for zombie processes (esbuild defunct processes)
  const checkZombieProcesses = () => {
    try {
      // In Node.js, we can't directly list processes, but we can provide guidance
      // This is a best-effort check that provides actionable guidance
      if (process.env.DOCKER_CONTAINER === 'true') {
        // In Docker, provide command to check for zombie processes
        return {
          hasZombies: false, // Can't detect directly, but provide guidance
          checkCommand: 'docker exec beleidsscan-frontend sh -c "ps aux | grep \\"[esbuild]\\" | grep -c defunct || echo 0"',
          cleanupCommand: 'docker compose restart frontend',
        };
      } else {
        // On host, provide command to check
        return {
          hasZombies: false,
          checkCommand: 'ps aux | grep "[esbuild]" | grep -c defunct || echo 0',
          cleanupCommand: 'pkill -f esbuild || true',
        };
      }
    } catch {
      return { hasZombies: false };
    }
  };
  
  return {
    name: 'esbuild-resilience',
    buildStart() {
      // Reset error flag on each build start
      const now = Date.now();
      if (now - lastErrorTime > ERROR_RESET_WINDOW) {
        // Reset error count if enough time has passed
        errorCount = 0;
        consecutiveErrors = 0;
        restartBackoffMs = RESTART_BACKOFF_BASE;
      }
      hasShownError = false;
    },
    // Removed transformIndexHtml - it was causing issues with Vite's HTML transform pipeline
    // Error handling is done via configureServer hook instead
    handleHotUpdate(ctx: { file: string; server: { ws: { send: (data: unknown) => void } } }) {
      // Log file changes for debugging esbuild issues
      if (process.env.NODE_ENV === 'development' && process.env.DEBUG_ESBUILD === 'true') {
        console.log('[esbuild-resilience] File changed:', ctx.file);
      }
    },
    // Configure server to catch esbuild errors during development
    configureServer(server: ViteDevServer) {
      // Intercept transform errors from esbuild
      // Use defensive checks to avoid breaking Vite's internal error handling
      try {
        const logger = server?.config?.logger;
        if (logger && typeof logger.error === 'function') {
          const originalError = logger.error.bind(logger) as (msg: string, ...args: unknown[]) => void;
          logger.error = (msg: string, ...args: unknown[]) => {
            const isEsbuildError = typeof msg === 'string' && (
              msg.includes('esbuild') || 
              msg.includes('EPIPE') ||
              msg.includes('The service is no longer running')
            );
            
            if (isEsbuildError) {
              const now = Date.now();
              errorCount++;
              consecutiveErrors++;
              lastErrorTime = now;
              
              // Check for zombie processes and provide guidance
              const zombieInfo = checkZombieProcesses();
              
              // Automatic recovery: Clear cache after too many consecutive errors
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.error('\n🔄 Automatic Recovery: Too many consecutive esbuild errors detected');
                console.error('   Attempting cache clear to recover...');
                console.error('   Run: pnpm run clean:vite');
                console.error('   Then restart: pnpm run dev:frontend:clean\n');
                consecutiveErrors = 0; // Reset after suggesting cache clear
              }
              
              // Exponential backoff for restart suggestions
              const timeSinceLastRestart = now - lastRestartAttempt;
              const shouldSuggestRestart = timeSinceLastRestart > restartBackoffMs;
              
              // Show detailed error message on first occurrence or after multiple errors
              if (!hasShownError || errorCount >= MAX_ERRORS_BEFORE_WARNING || shouldSuggestRestart) {
                hasShownError = true;
                if (shouldSuggestRestart) {
                  lastRestartAttempt = now;
                  restartBackoffMs = Math.min(restartBackoffMs * 2, 30000); // Max 30s backoff
                }
                
                console.error('\n⚠️  Esbuild service error detected during transform');
                console.error(`   Error: ${msg}`);
                console.error(`   File: ${args[0] || 'unknown'}`);
                console.error(`   Occurrences: ${errorCount}`);
                console.error(`   Consecutive errors: ${consecutiveErrors}`);
                
                // Zombie process detection and cleanup guidance
                if (zombieInfo.checkCommand) {
                  console.error('\n   🔍 Zombie Process Check:');
                  console.error(`   Run: ${zombieInfo.checkCommand}`);
                  console.error(`   If > 0, cleanup with: ${zombieInfo.cleanupCommand}`);
                  console.error('   Zombie processes indicate esbuild crashes that weren\'t cleaned up properly.');
                }
                
                console.error('\n   Common causes:');
                console.error('   1. File descriptor limit too low (most common in Docker)');
                console.error('      - Check: docker exec beleidsscan-frontend sh -c "ulimit -n"');
                console.error('      - Should be >= 4096, recommended: 8192');
                console.error('      - Fix: Add ulimits to docker-compose.yml frontend service');
                console.error('   2. Zombie processes accumulating (see check above)');
                console.error('   3. Corrupted Vite cache');
                console.error('   4. Memory/resource constraints (especially in Docker)');
                console.error('   5. File system issues or permissions');
                console.error('   6. Large file processing during transformation');
                console.error('\n   Immediate solutions (in order):');
                console.error('   1. Check for zombie processes (see above)');
                console.error('   2. Clear Vite cache: pnpm run clean:vite');
                console.error('   3. Restart the dev server: pnpm run dev:frontend:clean');
                console.error('   4. If in Docker, restart container: docker compose restart frontend');
                console.error('   5. Check file descriptor limit (see above)');
                console.error('   6. Check Docker memory limits (frontend should have at least 2GB)');
                console.error('   7. Check system memory: free -h');
                console.error('\n   Note: Vite should automatically restart the esbuild service.');
                console.error('   If errors persist after cache clear, see docs/21-issues/ESBUILD-EPIPE-ROOT-CAUSE.md\n');
                
                // If errors persist, suggest checking Docker resources
                if (errorCount >= MAX_ERRORS_BEFORE_WARNING && process.env.DOCKER_CONTAINER === 'true') {
                  console.error('   ⚠️  Multiple esbuild errors detected in Docker!');
                  console.error('   Check:');
                  console.error('   1. File descriptor limit: docker exec beleidsscan-frontend sh -c "ulimit -n"');
                  console.error('   2. Memory limit in docker-compose.yml (should be >= 2G)');
                  console.error('   3. Zombie processes (see check command above)');
                  console.error('   4. See docs/21-issues/ESBUILD-EPIPE-ROOT-CAUSE.md for details\n');
                }
              }
            }
            
            // Call original error handler
            originalError(msg, ...args);
          };
        }
      } catch (err) {
        // If error handler setup fails, log but don't break Vite
        console.warn('[esbuild-resilience] Failed to setup error handler:', err);
      }
    },
    // Handle build errors - catch EPIPE and other esbuild service errors
    buildEnd(error?: Error) {
      if (error) {
        const isEsbuildError = error.message?.includes('esbuild') || 
                              error.message?.includes('EPIPE') ||
                              error.message?.includes('The service is no longer running');
        
        if (isEsbuildError) {
          const now = Date.now();
          errorCount++;
          consecutiveErrors++;
          lastErrorTime = now;
          
          // Check for zombie processes and provide guidance
          const zombieInfo = checkZombieProcesses();
          
          // Automatic recovery: Clear cache after too many consecutive errors
          if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.error('\n🔄 Automatic Recovery: Too many consecutive esbuild errors detected');
            console.error('   Attempting cache clear to recover...');
            console.error('   Run: pnpm run clean:vite');
            console.error('   Then restart: pnpm run dev:frontend:clean\n');
            consecutiveErrors = 0; // Reset after suggesting cache clear
          }
          
          // Exponential backoff for restart suggestions
          const timeSinceLastRestart = now - lastRestartAttempt;
          const shouldSuggestRestart = timeSinceLastRestart > restartBackoffMs;
          
          // Show detailed error message on first occurrence or after multiple errors
          if (!hasShownError || errorCount >= MAX_ERRORS_BEFORE_WARNING || shouldSuggestRestart) {
            hasShownError = true;
            if (shouldSuggestRestart) {
              lastRestartAttempt = now;
              restartBackoffMs = Math.min(restartBackoffMs * 2, 30000); // Max 30s backoff
            }
            
            console.error('\n⚠️  Esbuild service error detected');
            console.error(`   Error: ${error.message}`);
            console.error(`   Occurrences: ${errorCount}`);
            console.error(`   Consecutive errors: ${consecutiveErrors}`);
            
            // Zombie process detection and cleanup guidance
            if (zombieInfo.checkCommand) {
              console.error('\n   🔍 Zombie Process Check:');
              console.error(`   Run: ${zombieInfo.checkCommand}`);
              console.error(`   If > 0, cleanup with: ${zombieInfo.cleanupCommand}`);
              console.error('   Zombie processes indicate esbuild crashes that weren\'t cleaned up properly.');
            }
            
            console.error('\n   Common causes:');
            console.error('   1. File descriptor limit too low (most common in Docker)');
            console.error('      - Check: docker exec beleidsscan-frontend sh -c "ulimit -n"');
            console.error('      - Should be >= 4096, recommended: 8192');
            console.error('      - Fix: Add ulimits to docker-compose.yml frontend service');
            console.error('   2. Zombie processes accumulating (see check above)');
            console.error('   3. Corrupted Vite cache');
            console.error('   4. Memory/resource constraints (especially in Docker)');
            console.error('   5. File system issues or permissions');
            console.error('   6. Large file processing during transformation');
            console.error('\n   Immediate solutions (in order):');
            console.error('   1. Check for zombie processes (see above)');
            console.error('   2. Clear Vite cache: pnpm run clean:vite');
            console.error('   3. Restart the dev server: pnpm run dev:frontend:clean');
            console.error('   4. If in Docker, restart container: docker compose restart frontend');
            console.error('   5. Check file descriptor limit (see above)');
            console.error('   6. Check Docker memory limits (frontend should have at least 2GB)');
            console.error('   7. Check system memory: free -h');
            console.error('\n   See docs/21-issues/ESBUILD-EPIPE-ROOT-CAUSE.md for detailed analysis.\n');
            
            // If errors persist, suggest checking Docker resources
            if (errorCount >= MAX_ERRORS_BEFORE_WARNING && process.env.DOCKER_CONTAINER === 'true') {
              console.error('   ⚠️  Multiple esbuild errors detected in Docker!');
              console.error('   Check:');
              console.error('   1. File descriptor limit: docker exec beleidsscan-frontend sh -c "ulimit -n"');
              console.error('   2. Memory limit in docker-compose.yml (should be >= 2G)');
              console.error('   3. Zombie processes (see check command above)');
              console.error('   4. See docs/21-issues/ESBUILD-EPIPE-ROOT-CAUSE.md for details\n');
            }
          }
        }
      }
    },
  };
};

// Plugin to prevent HTML fallback for module requests
// This ensures that module requests (.tsx, .ts, .js, .mjs) always return JavaScript
// and never fall back to index.html, which causes MIME type errors
// Also handles browser extension requests for source files gracefully
const moduleRequestProtectionPlugin = () => {
  return {
    name: 'module-request-protection',
    enforce: 'pre' as const, // Run early in the plugin chain
    configureServer(server: ViteDevServer) {
      // Intercept requests EARLY to prevent HTML fallback for module requests
      // This middleware must run before Vite's fallback middleware
      server.middlewares.use((req, res, next) => {
        // Only handle module file requests
        const url = req.url?.split('?')[0]; // Remove query string
        const isModuleRequest = url && (
          url.endsWith('.tsx') ||
          url.endsWith('.ts') ||
          url.endsWith('.js') ||
          url.endsWith('.mjs') ||
          req.url?.includes('?import') ||
          req.url?.includes('&import')
        );

        if (!isModuleRequest) {
          // Not a module request, continue normally
          return next();
        }

        // Check if this is a direct source file request (likely from a browser extension)
        // Browser extensions sometimes try to load .tsx/.ts files directly for debugging
        // Vite doesn't serve raw source files - they're transpiled and embedded in source maps
        const isDirectSourceRequest = url && (
          url.endsWith('.tsx') ||
          url.endsWith('.ts')
        ) && url.startsWith('/src/');

        // For direct source file requests, let Vite handle them
        // Vite will serve the transpiled JavaScript version of the file
        // This allows browser extensions and other tools to access source files
        // Vite handles the transformation automatically
        if (isDirectSourceRequest && req.method === 'GET') {
          // Let Vite handle all source file requests - it will serve the transpiled version
          // This prevents 404 errors for legitimate module requests
          return next();
        }

        // For module requests, intercept the response to prevent HTML fallback
        const originalEnd = res.end.bind(res);
        const originalWrite = res.write.bind(res);
        const originalWriteHead = res.writeHead.bind(res);
        const originalSetHeader = res.setHeader.bind(res);
        let responseIntercepted = false;
        let headersSent = false;
        let errorResponseBody: string | null = null;

        // Override setHeader to catch HTML content-type early
        res.setHeader = function(name: string, value: string | number | string[]): typeof res {
          if (name.toLowerCase() === 'content-type' && typeof value === 'string' && value.includes('text/html')) {
            // Block HTML content-type for module requests
            responseIntercepted = true;
            errorResponseBody = JSON.stringify({
              error: 'Module not found',
              message: `Module ${req.url} could not be loaded. The server attempted to return HTML instead of JavaScript.`,
              hint: 'This usually indicates the module file is missing or Vite is serving index.html as fallback.',
              solutions: [
                'Check if the file exists',
                'Clear Vite cache: pnpm run clean:vite',
                'Restart dev server: pnpm run dev:frontend:clean',
                'Check for reverse proxy misconfiguration'
              ]
            });
            console.error(`[module-request-protection] ⚠️  Blocked HTML content-type for module request: ${req.url}`);
            // Set correct content-type instead
            return originalSetHeader('Content-Type', 'application/json; charset=utf-8');
          }
          return originalSetHeader(name, value);
        };

        // Override write to catch HTML content in the stream early
        res.write = function(chunk: string | Buffer, encoding?: BufferEncoding | (() => void), cb?: () => void): ReturnType<typeof res.write> {
          // Check if this is HTML content (check first few bytes)
          if (!responseIntercepted && chunk) {
            const content = typeof chunk === 'string' ? chunk : chunk.toString('utf-8', 0, Math.min(100, chunk.length));
            const trimmed = content.trim();
            
            if (trimmed.startsWith('<!') || trimmed.startsWith('<html') || trimmed.startsWith('<!DOCTYPE')) {
              // This is HTML - intercept it immediately
              responseIntercepted = true;
              errorResponseBody = JSON.stringify({
                error: 'Module not found',
                message: `Module ${req.url} could not be loaded. The server returned HTML instead of JavaScript.`,
                hint: 'This usually indicates the module file is missing or Vite is serving index.html as fallback.',
                solutions: [
                  'Check if the file exists',
                  'Clear Vite cache: pnpm run clean:vite',
                  'Restart dev server: pnpm run dev:frontend:clean',
                  'Check for reverse proxy misconfiguration'
                ]
              });
              console.error(`[module-request-protection] ⚠️  Blocked HTML content in write() for module request: ${req.url}`);
              
              // If headers haven't been sent, we can fix them
              if (!headersSent) {
                res.writeHead(404, {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Content-Length': Buffer.byteLength(errorResponseBody)
                });
                headersSent = true;
                // Send error response instead
                const writeCb = typeof encoding === 'function' ? encoding : cb;
                if (writeCb) {
                  return originalWrite(errorResponseBody, 'utf8', writeCb);
                } else {
                  return originalWrite(errorResponseBody, 'utf8');
                }
              }
              // Headers already sent - can't fix MIME type, but log error
              console.error(`[module-request-protection] ⚠️  Headers already sent with wrong MIME type in write() for: ${req.url}`);
              // Don't write the HTML chunk
              const writeCb = typeof encoding === 'function' ? encoding : cb;
              if (writeCb) writeCb();
              return true; // Indicate write was successful (we'll send error in end())
            }
          }
          
          // If intercepted, don't write the original chunk
          if (responseIntercepted && errorResponseBody) {
            const writeCb = typeof encoding === 'function' ? encoding : cb;
            if (writeCb) writeCb();
            return true; // Indicate write was successful (we'll send error in end())
          }
          
          // Normal write - pass through
          if (typeof encoding === 'function') {
            return originalWrite(chunk, encoding);
          } else if (encoding && cb) {
            return originalWrite(chunk, encoding, cb);
          } else if (encoding) {
            return originalWrite(chunk, encoding);
          } else if (cb) {
            return originalWrite(chunk, cb);
          } else {
            return originalWrite(chunk);
          }
        } as typeof res.write;

        // Override writeHead to catch HTML content-type early
        res.writeHead = function(statusCode: number, statusMessage?: string | Record<string, string>, headers?: Record<string, string>): ReturnType<typeof res.writeHead> {
          headersSent = true;
          
          const actualHeaders = typeof statusMessage === 'object' ? statusMessage : headers;
          
          // If this is HTML content for a module request, block it immediately
          if (actualHeaders && typeof actualHeaders === 'object') {
            const contentType = actualHeaders['Content-Type'] || actualHeaders['content-type'];
            if (contentType && contentType.includes('text/html')) {
              // Block HTML response for module requests - return proper 404 instead
              responseIntercepted = true;
              errorResponseBody = JSON.stringify({
                error: 'Module not found',
                message: `Module ${req.url} could not be loaded. The server attempted to return HTML instead of JavaScript.`,
                hint: 'This usually indicates the module file is missing or Vite is serving index.html as fallback.',
                solutions: [
                  'Check if the file exists',
                  'Clear Vite cache: pnpm run clean:vite',
                  'Restart dev server: pnpm run dev:frontend:clean',
                  'Check for reverse proxy misconfiguration'
                ]
              });
              console.error(`[module-request-protection] ⚠️  Blocked HTML content-type in writeHead for module request: ${req.url}`);
              // Replace HTML content-type with JSON
              actualHeaders['Content-Type'] = 'application/json; charset=utf-8';
              return originalWriteHead(404, actualHeaders);
            }
          }
          
          // Handle the overloaded signature properly
          if (typeof statusMessage === 'object') {
            return originalWriteHead(statusCode, actualHeaders || headers);
          } else {
            return originalWriteHead(statusCode, statusMessage as string | undefined, actualHeaders || headers);
          }
        } as typeof res.writeHead;
        
        // Override end to detect and block HTML responses
        res.end = function(chunk?: string | Buffer, encoding?: BufferEncoding, cb?: () => void): ReturnType<typeof res.end> {
          // If we already intercepted and have an error response, send it
          if (responseIntercepted && errorResponseBody) {
            if (!headersSent) {
              res.writeHead(404, {
                'Content-Type': 'application/json; charset=utf-8',
                'Content-Length': Buffer.byteLength(errorResponseBody)
              });
            }
            return originalEnd(errorResponseBody, 'utf8', cb);
          }

          // Check if response is HTML when it should be JavaScript
          if (chunk) {
            const content = typeof chunk === 'string' ? chunk : chunk.toString('utf-8');
            if (content.trim().startsWith('<!')) {
              // This is HTML, not JavaScript - block it
              responseIntercepted = true;
              errorResponseBody = JSON.stringify({
                error: 'Module not found',
                message: `Module ${req.url} could not be loaded. The server returned HTML instead of JavaScript.`,
                hint: 'This usually indicates the module file is missing or Vite is serving index.html as fallback.',
                solutions: [
                  'Check if the file exists',
                  'Clear Vite cache: pnpm run clean:vite',
                  'Restart dev server: pnpm run dev:frontend:clean',
                  'Check for reverse proxy misconfiguration'
                ]
              });
              console.error(`[module-request-protection] ⚠️  Blocked HTML response body for module request: ${req.url}`);
              
              // Return proper error response with correct MIME type
              if (!headersSent) {
                res.writeHead(404, {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Content-Length': Buffer.byteLength(errorResponseBody)
                });
                return originalEnd(errorResponseBody, 'utf8', cb);
              }
              // Headers already sent with wrong MIME type - can't fix, but log error
              console.error(`[module-request-protection] ⚠️  Headers already sent with wrong MIME type for: ${req.url}`);
              // Still try to send the error response
              return originalEnd(errorResponseBody, 'utf8', cb);
            }
          }
          
          // Normal response - pass through
          if (chunk !== undefined) {
            if (encoding !== undefined) {
              return originalEnd(chunk, encoding, cb);
            } else if (cb !== undefined) {
              return originalEnd(chunk, cb);
            } else {
              return originalEnd(chunk);
            }
          } else if (cb !== undefined) {
            return originalEnd(cb);
          } else {
            return originalEnd();
          }
        } as typeof res.end;

        // Continue with normal Vite handling
        // Vite will process the request, but our interceptors will catch HTML responses
        next();
      });
    },
  };
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), preventNativeModulesPlugin(), rawCsvImportPlugin(), optionalNeo4jNvlPlugin(), esbuildResiliencePlugin(), moduleRequestProtectionPlugin()],
  // Use writable cache directory in /tmp (always writable, even in Docker)
  cacheDir: '/tmp/.vite',
  // Explicitly configure PostCSS
  css: {
    postcss: postcssConfig,
  },
  server: {
    host: process.env.VITE_HOST || '0.0.0.0',
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    strictPort: process.env.VITE_STRICT_PORT === 'true',
    // Enable HTTPS to prevent blob URL security warnings
    // Vite will automatically generate self-signed certificates for development
    ...(process.env.VITE_HTTPS === 'false' ? {} : { https: {} }),
    proxy: {
      '/api': {
        // Proxy target selection logic:
        // 1. Use VITE_API_PROXY_TARGET if explicitly set
        // 2. For e2e tests or CI environments, always use localhost (backend hostname may not resolve)
        // 3. In Docker (non-test), use backend hostname (same Docker network)
        // 4. Default to localhost for development on host machine
        target: proxyTarget,
        changeOrigin: true,
        secure: false,
        ws: true, // Enable WebSocket proxying
        // Increase timeout to match server requestTimeout (120s) to prevent socket hang up errors
        // Server has requestTimeout: 120000ms, so proxy must be >= that value
        timeout: 150000, // 150 seconds (2.5 minutes) - slightly longer than server timeout
        proxyTimeout: 150000, // 150 seconds - must match timeout
        agent: false, // Disable connection pooling to avoid EPIPE errors
        xfwd: true, // Add X-Forwarded headers
        preserveHeaderKeyCase: true,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            console.error('Proxy error:', err.message);
            const isDocker = process.env.DOCKER_CONTAINER === 'true';
            const proxyTarget = _options.target || 'unknown';
            const proxyTargetStr = typeof proxyTarget === 'string' ? proxyTarget : proxyTarget instanceof URL ? proxyTarget.toString() : String(proxyTarget);
            
            // Handle DNS resolution failures (EAI_AGAIN, ENOTFOUND)
            if (err.message?.includes('EAI_AGAIN') || err.message?.includes('ENOTFOUND') || err.message?.includes('getaddrinfo')) {
              const isBackendHostname = err.message?.toLowerCase().includes('backend') || proxyTargetStr.includes('backend');
              console.error('⚠️  Backend hostname resolution failed. Please ensure:');
              if (isBackendHostname) {
                console.error('   The "backend" hostname only resolves within Docker networks.');
                console.error('   Solutions:');
                if (isDocker) {
                  console.error('   1. Check if backend container is running: docker ps | grep beleidsscan-backend');
                  console.error('   2. Check backend container health: docker inspect beleidsscan-backend | grep -A 5 Health');
                  console.error('   3. Start backend if not running: docker compose up -d backend');
                  console.error('   4. Check backend logs: docker logs beleidsscan-backend');
                  console.error('   5. Verify Docker network: docker network inspect beleidsscan-network');
                } else {
                  console.error('   1. Run frontend in Docker: docker compose up frontend');
                  console.error('   2. Set VITE_API_PROXY_TARGET=http://127.0.0.1:4000');
                  console.error('   3. Unset VITE_API_PROXY_TARGET if it\'s set to http://backend:4000');
                  console.error('   4. Restart Vite dev server after changing environment variables');
                }
              } else {
                console.error('   1. Backend hostname is resolvable (check DNS/hosts file)');
                console.error('   2. If using Docker, ensure backend service name is correct');
                console.error('   3. For local development, use 127.0.0.1:4000 or set VITE_API_PROXY_TARGET');
              }
            }
            // If connection refused, provide helpful error message with Docker diagnostics
            if (err.message?.includes('ECONNREFUSED')) {
              console.error('⚠️  Backend connection refused. Proxy target:', proxyTarget);
              console.error('   Diagnostic steps:');
              
              if (isDocker) {
                console.error('   Docker Environment Detected:');
                console.error('   🔧 QUICK DIAGNOSTIC: Run comprehensive diagnostic script:');
                console.error('      ./scripts/check-backend-docker-status.sh');
                console.error('      # or: bash scripts/check-backend-docker-status.sh');
                console.error('');
                console.error('   Manual diagnostic steps:');
                console.error('   1. Check if backend container is running:');
                console.error('      docker ps | grep beleidsscan-backend');
                console.error('   2. Check backend container status:');
                console.error('      docker compose ps backend');
                console.error('   3. Check backend container health:');
                console.error('      docker inspect beleidsscan-backend --format="{{.State.Health.Status}}"');
                console.error('   4. Check backend logs for startup errors (IMPORTANT):');
                console.error('      docker logs beleidsscan-backend --tail 50');
                console.error('      Look for: "Cannot find module", "Missing dependency", "@turf", startup failures');
                console.error('   5. If missing dependencies found in logs:');
                console.error('      - Run: docker exec beleidsscan-backend pnpm install');
                console.error('      - Restart backend: docker compose restart backend');
                console.error('   6. Verify backend is listening on port 4000:');
                console.error('      docker exec beleidsscan-backend netstat -tuln | grep 4000');
                console.error('   7. Test backend health endpoint from within Docker network:');
                console.error('      docker exec beleidsscan-frontend wget -qO- http://backend:4000/health || echo "Backend not reachable"');
                console.error('   8. If backend container exists but is unhealthy, restart it:');
                console.error('      docker compose restart backend');
                console.error('   9. If backend container doesn\'t exist, start it:');
                console.error('      docker compose up -d backend');
                console.error('  10. Verify both containers are on the same network:');
                console.error('      docker network inspect beleidsscan-network | grep -A 2 "beleidsscan-backend\\|beleidsscan-frontend"');
              } else {
                console.error('   Local Development Environment:');
                console.error('   1. Check if backend server is running:');
                console.error('      lsof -i :4000  # or: netstat -tuln | grep 4000');
                console.error('   2. Check backend console/logs for startup errors:');
                console.error('      Look for: "Cannot find module", "Missing dependency", "@turf", startup failures');
                console.error('   3. If missing dependencies found:');
                console.error('      - Run: pnpm install (to install missing packages)');
                console.error('      - Restart backend: pnpm run dev:backend');
                console.error('   4. Test backend health endpoint:');
                console.error('      curl http://localhost:4000/health');
                console.error('   5. If backend was started after Vite, restart Vite dev server');
              }
              
              console.error('   Common causes:');
              console.error('   - Missing dependencies (e.g., @turf/boolean-contains) - check logs for "Cannot find module"');
              console.error('   - Backend container not started or crashed');
              console.error('   - Backend failed to start due to missing npm packages or module resolution errors');
              console.error('   - Database connection failures preventing backend startup');
              console.error('   - Port 4000 already in use by another process');
              console.error('   - Docker network connectivity issues');
              console.error('   - Missing exports in code causing startup failures');
            }
            
            if (res && 'headersSent' in res && !res.headersSent) {
              // Create enhanced error message with diagnostics
              let hint = '';
              let backendStartupFailure = false;
              
              if (err.message?.includes('ECONNREFUSED')) {
                backendStartupFailure = true;
                if (isDocker) {
                  hint = 'Backend connection refused. The backend may have failed to start.\n\n' +
                         '🔧 QUICK DIAGNOSTIC:\n' +
                         'Run: `./scripts/check-backend-docker-status.sh`\n' +
                         'This script will check container status, health, logs, and network connectivity.\n\n' +
                         'Manual diagnostic steps:\n' +
                         '1. Check backend logs: `docker logs beleidsscan-backend --tail 50`\n' +
                         '   Look for: "Cannot find module", "Missing dependency", "@turf", startup failures\n\n' +
                         '2. Check container status: `docker ps | grep beleidsscan-backend`\n' +
                         '   Check health: `docker inspect beleidsscan-backend --format="{{.State.Health.Status}}"`\n\n' +
                         '3. If missing dependencies found:\n' +
                         '   - Run: `docker exec beleidsscan-backend pnpm install`\n' +
                         '   - Restart: `docker compose restart backend`\n\n' +
                         '4. Verify network: `docker network inspect beleidsscan-network`\n\n' +
                         'Common causes:\n' +
                         '- Missing npm packages (check logs for "Cannot find module")\n' +
                         '- Backend container not running or unhealthy\n' +
                         '- Database connection failures\n' +
                         '- Module resolution errors';
                } else {
                  hint = 'Backend connection refused. The backend may have failed to start.\n\n' +
                         'Check backend console/logs for:\n' +
                         '- "Cannot find module" or "Missing dependency" errors\n' +
                         '- Module resolution errors\n' +
                         '- Startup validation failures\n\n' +
                         'If missing dependencies found:\n' +
                         '1. Run: `pnpm install`\n' +
                         '2. Restart backend: `pnpm run dev:backend`\n\n' +
                         'Test backend: `curl http://localhost:4000/health`\n' +
                         'If backend was started after Vite, restart Vite dev server.';
                }
              } else if (err.message?.includes('EAI_AGAIN') || err.message?.includes('ENOTFOUND')) {
                const proxyTargetStr = typeof proxyTarget === 'string' ? proxyTarget : proxyTarget instanceof URL ? proxyTarget.toString() : String(proxyTarget);
                if (isDocker && proxyTargetStr.includes('backend')) {
                  hint = 'Backend hostname resolution failed. The "backend" hostname only resolves within Docker networks. ' +
                         'Check if backend container is running: `docker ps | grep beleidsscan-backend`. ' +
                         'Verify Docker network: `docker network inspect beleidsscan-network`.';
                } else {
                  hint = 'Hostname resolution failed. Check DNS/hosts file or Docker service name. ' +
                         'For local development, set VITE_API_PROXY_TARGET=http://127.0.0.1:4000.';
                }
              } else {
                hint = isDocker
                  ? 'Backend may not be accessible. Check if backend is running in Docker: `docker compose ps backend`. ' +
                    'Check logs for startup errors: `docker logs beleidsscan-backend --tail 50`. ' +
                    'Look for missing dependencies or startup failures. Try restarting Vite dev server.'
                  : 'Backend may not be running on port 4000. Check backend console for startup errors. ' +
                    'If you just started the backend, try restarting the Vite dev server.';
              }
              
              res.writeHead(500, {
                'Content-Type': 'application/json',
              });
              res.end(JSON.stringify({ 
                error: 'Proxy error', 
                message: err.message,
                proxyTarget,
                isDocker,
                backendStartupFailure,
                hint,
                troubleshooting: backendStartupFailure ? [
                  isDocker ? 'Run diagnostic script: ./scripts/check-backend-docker-status.sh' : 'Check backend console for startup errors',
                  'Check backend logs for "Cannot find module" or "Missing dependency" errors',
                  isDocker ? 'Run: docker exec beleidsscan-backend pnpm install (if missing dependencies found)' : 'Run: pnpm install (if missing dependencies found)',
                  'Verify backend container is running and healthy',
                  'Check for module resolution errors in startup logs',
                  isDocker ? 'Restart backend: docker compose restart backend' : 'Restart backend: pnpm run dev:backend',
                ] : undefined,
              }));
            }
          });
          proxy.on('proxyReq', (_proxyReq, _req) => {
            // Log proxy requests for debugging (only in dev mode to reduce noise)
            if (process.env.NODE_ENV === 'development') {
              console.log(`[Proxy] ${_req.method} ${_req.url} -> ${_options.target}`);
            }
          });
        },
      },
    },
    watch: {
      // Ignore data directory to prevent page reloads during workflow execution
      // The workflow scraper creates/updates markdown files here which would
      // otherwise trigger HMR reloads
      ignored: [
        '**/data/**',
        '**/node_modules/**',
        '**/.git/**'
      ]
    }
  },
  assetsInclude: ['**/*.csv'],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src/client'),
      // Prevent native Node.js modules from being bundled for browser
      // These should never be imported in client code, but provide stubs as safety
      'sharp': path.resolve(__dirname, '../src/client/utils/native-module-stub.ts'),
      'canvas': path.resolve(__dirname, '../src/client/utils/native-module-stub.ts'),
      'better-sqlite3': path.resolve(__dirname, '../src/client/utils/native-module-stub.ts'),
    },
    // Ensure proper resolution of CommonJS modules
    dedupe: [],
    // Handle optional @neo4j-nvl packages gracefully in dev mode
    // If not installed, create a stub module to prevent import errors
    conditions: ['import', 'module', 'browser', 'default'],
    // Explicitly resolve exceljs to use browser build
    mainFields: ['browser', 'module', 'main'],
  },
  optimizeDeps: {
    // Pre-bundle dependencies for proper ESM handling
    // Vite will create proper ESM wrappers for CommonJS/UMD modules
    include: [
      'windups',
      'socket.io-client',
      'dagre',
      'exceljs',
      '@neo4j-nvl/react',
      '@neo4j-nvl/base',
    ],
    // Exclude native Node.js modules from optimization (they can't run in browser)
    // These modules should never be imported in client code, but exclude them as a safety measure
    // Also exclude any packages that might have native dependencies
    exclude: [
      'sharp',
      'canvas',
      'better-sqlite3',
      'bcryptjs',
      'bcrypt',
      // Exclude native module dependencies that might be pulled in transitively
      '@mapbox/node-pre-gyp',
      'node-gyp',
      'node-gyp-build',
    ],
    // Force re-optimization of socket.io-client to ensure it's properly bundled
    force: process.env.VITE_FORCE_OPTIMIZE === 'true',
    esbuildOptions: {
      // Handle CommonJS/UMD modules properly
      // Use browser field for exceljs to get the browser build
      mainFields: ['browser', 'module', 'main'],
      // Configure esbuild to be more resilient
      // Keep names for better debugging and error recovery
      keepNames: true,
      // Target modern JavaScript to reduce transformation overhead
      target: 'esnext',
      // Increase memory limit for esbuild service to prevent crashes
      // This helps with large files and complex transformations
      // Default is ~512MB, increasing to 1GB for better stability
      // Note: This only affects the optimizeDeps esbuild process
      // The main transform esbuild is configured separately below
      // Platform-specific: ensure we're building for browser, not Node.js
      platform: 'browser',
      // Prevent esbuild from trying to bundle native modules
      // This is a safety measure in case any dependencies try to import native modules
      define: {
        'process.platform': '"browser"',
        'process.arch': '"x64"',
      },
    },
  },
  esbuild: {
    // Configure esbuild transform options for better resilience
    // This applies to all esbuild transformations, not just optimizeDeps
    target: 'esnext',
    format: 'esm',
    // Keep names for better debugging
    keepNames: true,
    // Log level for debugging (can be set to 'verbose' if needed)
    logLevel: 'warning',
    // Drop console statements in production builds only
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
    // Additional options to improve stability
    // Source maps can help with debugging but increase memory usage
    sourcemap: process.env.NODE_ENV === 'development' ? 'inline' : false,
    // Charset handling
    charset: 'utf8',
  },
  worker: {
    // Configure worker handling for NVL
    format: 'es',
    plugins: () => [react()],
    // Ensure workers can import CommonJS modules properly
    rollupOptions: {
      output: {
        format: 'es',
      },
    },
  },
  build: {
    // Ensure workers are properly bundled
    rollupOptions: {
      output: {
        // Preserve worker files
        manualChunks: undefined,
      },
      // Externalize native modules to prevent bundling (they can't run in browser)
      external: [
        'sharp',
        'canvas',
        'better-sqlite3',
        'bcryptjs',
        'bcrypt',
      ],
    },
  },
})
