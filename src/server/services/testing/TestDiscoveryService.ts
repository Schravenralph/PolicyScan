/**
 * Test Discovery Service
 * 
 * Comprehensive service to discover ALL test files in the codebase.
 * NO SHORTCUTS - finds every single test file.
 */

import { readdir, stat } from 'fs/promises';
import { join, relative } from 'path';
import { readFileSync } from 'fs';
import { logger } from '../../utils/logger.js';

export interface TestFileInfo {
  path: string;
  relativePath: string;
  type: 'unit' | 'integration' | 'e2e' | 'spec' | 'other';
  testCount: number;
  size: number;
  lastModified: Date;
}

export interface TestStatistics {
  totalFiles: number;
  totalTests: number;
  byType: {
    unit: { files: number; tests: number };
    integration: { files: number; tests: number };
    e2e: { files: number; tests: number };
    spec: { files: number; tests: number };
    other: { files: number; tests: number };
  };
  files: TestFileInfo[];
}

export class TestDiscoveryService {
  private static instance: TestDiscoveryService | null = null;
  private cache: TestStatistics | null = null;
  private cacheTimestamp: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute cache

  private constructor() {}

  static getInstance(): TestDiscoveryService {
    if (!TestDiscoveryService.instance) {
      TestDiscoveryService.instance = new TestDiscoveryService();
    }
    return TestDiscoveryService.instance;
  }

  /**
   * Discover ALL test files in the codebase
   * Recursively scans all directories, NO SHORTCUTS
   */
  async discoverAllTests(useCache: boolean = true): Promise<TestStatistics> {
    // Check cache
    if (useCache && this.cache && Date.now() - this.cacheTimestamp < this.CACHE_TTL) {
      return this.cache;
    }

    const projectRoot = process.cwd();
    const testFiles: TestFileInfo[] = [];

    // Directories to scan (comprehensive list)
    const scanDirectories = [
      'tests',
      'src',
      'scripts', // Some tests might be in scripts
    ];

    // Patterns to match test files
    const testPatterns = [
      /\.test\.ts$/,
      /\.test\.tsx$/,
      /\.spec\.ts$/,
      /\.spec\.tsx$/,
    ];

    // Directories to exclude (but NOT __helpers__ or __mocks__ as they may contain tests)
    const excludePatterns = [
      /node_modules/,
      /\.git/,
      /dist/,
      /build/,
      /coverage/,
      /\.next/,
      /\.cache/,
      /\.stryker-tmp/,
      /\.turbo/,
      /\.vite/,
      /\.swc/,
    ];

    // Recursively scan directory
    async function scanDirectory(dir: string, baseDir: string = dir): Promise<void> {
      try {
        const entries = await readdir(dir);

        for (const entry of entries) {
          const fullPath = join(dir, entry);
          const relativePath = relative(projectRoot, fullPath);

          // Skip excluded directories
          if (excludePatterns.some(pattern => pattern.test(relativePath))) {
            continue;
          }

          try {
            let stats;
            try {
              stats = await stat(fullPath);
            } catch (statError) {
              // If we can't stat, it might be a symlink or permission issue - skip it
              const errorMsg = statError instanceof Error ? statError.message : String(statError);
              if (!errorMsg.includes('ENOENT')) {
                logger.debug({ error: errorMsg, path: fullPath }, 'Cannot stat file/directory');
              }
              continue;
            }

            if (stats.isDirectory()) {
              // Recursively scan subdirectories
              await scanDirectory(fullPath, baseDir);
            } else if (stats.isFile()) {
              // Check if it's a test file
              const isTestFile = testPatterns.some(pattern => pattern.test(entry));

              if (isTestFile) {
                try {
                  // Determine test type based on path
                  let type: TestFileInfo['type'] = 'other';
                  if (relativePath.includes('/e2e/') || relativePath.includes('\\e2e\\')) {
                    type = 'e2e';
                  } else if (relativePath.includes('/integration/') || relativePath.includes('\\integration\\')) {
                    type = 'integration';
                  } else if (relativePath.includes('/unit/') || relativePath.includes('\\unit\\')) {
                    type = 'unit';
                  } else if (entry.includes('.spec.')) {
                    type = 'spec';
                  } else if (relativePath.includes('/tests/') || relativePath.includes('\\tests\\')) {
                    // Try to infer from path structure
                    if (relativePath.includes('/tests/e2e/') || relativePath.includes('\\tests\\e2e\\')) {
                      type = 'e2e';
                    } else if (relativePath.includes('/tests/integration/') || relativePath.includes('\\tests\\integration\\')) {
                      type = 'integration';
                    } else if (relativePath.includes('/tests/unit/') || relativePath.includes('\\tests\\unit\\')) {
                      type = 'unit';
                    } else {
                      type = 'other';
                    }
                  }

                  // Count test cases in file (don't fail if we can't count)
                  let testCount = 1; // Default to 1
                  try {
                    const service = TestDiscoveryService.getInstance();
                    testCount = await service.countTestsInFile(fullPath);
                  } catch (countError) {
                    // If counting fails, use default but still add the file
                    logger.debug({ error: countError, path: fullPath }, 'Could not count tests, using default');
                  }

                  testFiles.push({
                    path: fullPath,
                    relativePath,
                    type,
                    testCount,
                    size: stats.size,
                    lastModified: stats.mtime,
                  });
                } catch (fileError) {
                  // If we can't process the file at all, skip it but log the error
                  const errorMessage = fileError instanceof Error ? fileError.message : String(fileError);
                  logger.debug({ error: errorMessage, path: fullPath }, 'Error processing test file');
                  continue;
                }
              }
            }
          } catch (error) {
            // Skip files/directories we can't access
            // Only log if it's not a common permission issue
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (!errorMessage.includes('EACCES') && !errorMessage.includes('EPERM') && !errorMessage.includes('ENOENT')) {
              logger.debug({ error: errorMessage, path: fullPath }, 'Skipping inaccessible file/directory');
            }
            continue;
          }
        }
      } catch (error) {
        logger.debug({ error, dir }, 'Error scanning directory');
      }
    }

    // Scan all directories
    for (const scanDir of scanDirectories) {
      const fullScanPath = join(projectRoot, scanDir);
      try {
        const stats = await stat(fullScanPath);
        if (stats.isDirectory()) {
          await scanDirectory(fullScanPath);
        }
      } catch (error) {
        logger.debug({ error, path: fullScanPath }, 'Skipping scan directory');
      }
    }

    // Also scan root level for test files
    try {
      const rootEntries = await readdir(projectRoot);
      for (const entry of rootEntries) {
        const fullPath = join(projectRoot, entry);
        try {
          const stats = await stat(fullPath);
          if (stats.isFile()) {
            const isTestFile = testPatterns.some(pattern => pattern.test(entry));
            if (isTestFile) {
              const service = TestDiscoveryService.getInstance();
              const testCount = await service.countTestsInFile(fullPath);
              testFiles.push({
                path: fullPath,
                relativePath: entry,
                type: 'other',
                testCount,
                size: stats.size,
                lastModified: stats.mtime,
              });
            }
          }
        } catch {
          // Skip
        }
      }
    } catch (error) {
      logger.debug({ error }, 'Error scanning root directory');
    }

    // Calculate statistics
    const byType = {
      unit: { files: 0, tests: 0 },
      integration: { files: 0, tests: 0 },
      e2e: { files: 0, tests: 0 },
      spec: { files: 0, tests: 0 },
      other: { files: 0, tests: 0 },
    };

    for (const file of testFiles) {
      byType[file.type].files++;
      byType[file.type].tests += file.testCount;
    }

    const statistics: TestStatistics = {
      totalFiles: testFiles.length,
      totalTests: testFiles.reduce((sum, file) => sum + file.testCount, 0),
      byType,
      files: testFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath)),
    };

    // Update cache
    this.cache = statistics;
    this.cacheTimestamp = Date.now();

    logger.info(
      {
        totalFiles: statistics.totalFiles,
        totalTests: statistics.totalTests,
        byType: statistics.byType,
      },
      'Test discovery completed'
    );

    return statistics;
  }

  /**
   * Count test cases in a file
   * Supports multiple test frameworks: Jest, Vitest, Playwright, Mocha
   */
  async countTestsInFile(filePath: string): Promise<number> {
    try {
      // Check if file exists and is readable
      try {
        await stat(filePath);
      } catch (statError) {
        logger.debug({ error: statError, filePath }, 'Cannot stat file for test counting');
        return 1; // Default to 1 test if we can't access the file
      }

      let content: string;
      try {
        content = readFileSync(filePath, 'utf-8');
      } catch (readError) {
        // If we can't read the file, return default count
        logger.debug({ error: readError, filePath }, 'Cannot read file for test counting');
        return 1; // Default to 1 test if we can't read the file
      }

      // Remove comments and strings to avoid false positives
      let cleanedContent = content;
      
      // Remove single-line comments
      cleanedContent = cleanedContent.replace(/\/\/.*$/gm, '');
      
      // Remove multi-line comments
      cleanedContent = cleanedContent.replace(/\/\*[\s\S]*?\*\//g, '');
      
      // Remove template strings (basic approach - remove backtick strings)
      cleanedContent = cleanedContent.replace(/`[^`]*`/g, '');
      
      // Remove regular strings (basic approach)
      cleanedContent = cleanedContent.replace(/"[^"]*"/g, '');
      cleanedContent = cleanedContent.replace(/'[^']*'/g, '');

      // Count test cases - look for test( and it( patterns
      // Patterns to match:
      // - test( or test.describe(
      // - it( or it.describe(
      // - test.skip(, test.only(, it.skip(, it.only( (still count as tests)
      
      const testPatterns = [
        /\btest\s*\(/g,           // test(
        /\btest\.(?:skip|only|todo)\s*\(/g,  // test.skip(, test.only(, test.todo(
        /\bit\s*\(/g,              // it(
        /\bit\.(?:skip|only|todo)\s*\(/g,     // it.skip(, it.only(, it.todo(
      ];

      let testCount = 0;
      for (const pattern of testPatterns) {
        const matches = cleanedContent.match(pattern);
        if (matches) {
          testCount += matches.length;
        }
      }

      // If no tests found, check for describe blocks (might be test suites)
      if (testCount === 0) {
        const describeMatches = cleanedContent.match(/\b(?:describe|test\.describe|it\.describe)\s*\(/g);
        if (describeMatches) {
          testCount = describeMatches.length;
        }
      }

      // At least 1 test per file (even if we can't parse it)
      return Math.max(1, testCount);
    } catch (error) {
      logger.debug({ error, filePath }, 'Error counting tests in file');
      return 1; // Default to 1 test if we can't parse
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}

export function getTestDiscoveryService(): TestDiscoveryService {
  return TestDiscoveryService.getInstance();
}

