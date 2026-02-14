/**
 * Test Dependency Analysis Service
 * 
 * Analyzes test dependencies, relationships, and impact of changes.
 * Helps understand which tests are affected by code changes.
 */

import { logger } from '../../utils/logger.js';
import { ensureDBConnection } from '../../config/database.js';
import { getTestSummaryService, type TestSummaryDocument } from './TestSummaryService.js';
import { readFileSync, existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { dirname, join, normalize } from 'path';

export interface TestDependency {
  testFile: string;
  dependencies: string[]; // Files this test depends on
  dependents: string[]; // Tests that depend on this file
  impactScore: number; // 0-100, higher = more impact if this test fails
  lastRun?: string;
  passRate?: number;
}

export interface DependencyAnalysis {
  testDependencies: TestDependency[];
  impactMap: Record<string, {
    affectedTests: string[];
    impactScore: number;
  }>;
  summary: {
    totalTests: number;
    testsWithDependencies: number;
    highImpactTests: number;
  };
  timestamp: string;
}

/**
 * Service for analyzing test dependencies and impact
 */
export class TestDependencyAnalysisService {
  private static instance: TestDependencyAnalysisService | null = null;
  private cache: Map<string, DependencyAnalysis> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): TestDependencyAnalysisService {
    if (!TestDependencyAnalysisService.instance) {
      TestDependencyAnalysisService.instance = new TestDependencyAnalysisService();
    }
    return TestDependencyAnalysisService.instance;
  }

  /**
   * Analyze test dependencies by examining test files and their imports
   */
  async analyzeDependencies(options: {
    testType?: TestSummaryDocument['testType'];
    includeImpact?: boolean;
  } = {}): Promise<DependencyAnalysis> {
    const { testType, includeImpact = true } = options;
    const cacheKey = JSON.stringify(options);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - new Date(cached.timestamp).getTime() < this.CACHE_TTL) {
      return cached;
    }

    try {
      await ensureDBConnection();
      const summaryService = getTestSummaryService();
      
      // Get all test files that have been run
      const testFiles = await summaryService.getAllUniqueTestFiles({
        testType,
      });

      const testDependencies: TestDependency[] = [];
      const impactMap: Record<string, { affectedTests: string[]; impactScore: number }> = {};

      // Limit the number of test files to process to avoid timeout
      const MAX_TEST_FILES = 500;
      const testFilesToProcess = testFiles.slice(0, MAX_TEST_FILES);
      
      if (testFiles.length > MAX_TEST_FILES) {
        logger.warn({ total: testFiles.length, processed: MAX_TEST_FILES }, 'Limiting test files processed to avoid timeout');
      }

      // Analyze each test file
      for (const testFile of testFilesToProcess) {
        try {
          const dependencies = await this.extractDependencies(testFile.testFile);
          const dependents = await this.findDependents(testFile.testFile, testFilesToProcess);
        
        // Calculate impact score based on:
        // - Number of dependents (more dependents = higher impact)
        // - Pass rate (failing tests = higher impact)
        // - Recent runs (recently run = higher impact)
        let impactScore = 0;
        if (includeImpact) {
          impactScore = this.calculateImpactScore({
            dependents: dependents.length,
            passRate: testFile.avgPassRate,
            totalRuns: testFile.totalRuns,
            latestRun: testFile.latestRun,
          });
        }

        testDependencies.push({
          testFile: testFile.testFile,
          dependencies,
          dependents,
          impactScore,
          lastRun: testFile.latestRun.toISOString(),
          passRate: testFile.avgPassRate,
        });

          // Build impact map (reverse: which tests are affected by changes to a file)
          dependencies.forEach(dep => {
            if (!impactMap[dep]) {
              impactMap[dep] = { affectedTests: [], impactScore: 0 };
            }
            impactMap[dep].affectedTests.push(testFile.testFile);
            impactMap[dep].impactScore += impactScore;
          });
        } catch (error) {
          logger.debug({ error, testFile: testFile.testFile }, 'Failed to analyze dependencies for test file, skipping');
          // Continue with next test file
        }
      }

      // Normalize impact scores to 0-100
      if (includeImpact) {
        const maxScore = Math.max(...testDependencies.map(t => t.impactScore), 1);
        testDependencies.forEach(t => {
          t.impactScore = Math.round((t.impactScore / maxScore) * 100);
        });

        Object.values(impactMap).forEach(impact => {
          impact.impactScore = Math.round((impact.impactScore / maxScore) * 100);
        });
      }

      const analysis: DependencyAnalysis = {
        testDependencies: testDependencies.sort((a, b) => b.impactScore - a.impactScore),
        impactMap,
        summary: {
          totalTests: testDependencies.length,
          testsWithDependencies: testDependencies.filter(t => t.dependencies.length > 0).length,
          highImpactTests: testDependencies.filter(t => t.impactScore >= 70).length,
        },
        timestamp: new Date().toISOString(),
      };

      // Cache result
      this.cache.set(cacheKey, analysis);

      return analysis;
    } catch (error) {
      logger.error({ error }, 'Failed to analyze test dependencies');
      throw error;
    }
  }

  /**
   * Get tests affected by changes to specific files
   */
  async getAffectedTests(filePaths: string[]): Promise<{
    affectedTests: string[];
    impactScore: number;
    byFile: Record<string, string[]>;
  }> {
    const analysis = await this.analyzeDependencies({ includeImpact: true });
    
    const affectedTests = new Set<string>();
    const byFile: Record<string, string[]> = {};

    filePaths.forEach(filePath => {
      const impact = analysis.impactMap[filePath];
      if (impact) {
        impact.affectedTests.forEach(test => affectedTests.add(test));
        byFile[filePath] = impact.affectedTests;
      }
    });

    // Calculate overall impact score
    const totalImpact = filePaths.reduce((sum, file) => {
      return sum + (analysis.impactMap[file]?.impactScore || 0);
    }, 0);
    const avgImpact = filePaths.length > 0 ? totalImpact / filePaths.length : 0;

    return {
      affectedTests: Array.from(affectedTests),
      impactScore: Math.round(avgImpact),
      byFile,
    };
  }

  /**
   * Extract dependencies from a test file by parsing imports
   */
  private async extractDependencies(testFilePath: string): Promise<string[]> {
    const dependencies: string[] = [];
    
    try {
      // Try to find the actual file
      const possiblePaths = [
        testFilePath,
        join(process.cwd(), testFilePath),
        join(process.cwd(), 'tests', testFilePath),
        join(process.cwd(), 'src', testFilePath),
      ];

      let filePath: string | null = null;
      for (const path of possiblePaths) {
        if (existsSync(path)) {
          filePath = path;
          break;
        }
      }

      if (!filePath) {
        // If file doesn't exist, try to extract from test command
        // Test commands often contain file paths
        const parts = testFilePath.split(/[/\\]/);
        if (parts.length > 0) {
          dependencies.push(parts[parts.length - 1]); // Add the test file itself as a dependency
        }
        return dependencies;
      }

      // Use async file reading with timeout to avoid hanging on large files
      const fileReadPromise = readFile(filePath!, 'utf-8');
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('File read timeout'));
        }, 1000); // 1 second timeout per file
      });

      let content: string;
      try {
        content = await Promise.race([fileReadPromise, timeoutPromise]);
      } catch (error) {
        logger.debug({ error, testFilePath }, 'File read timeout or error, skipping dependency extraction');
        return dependencies;
      }
      
      // Extract imports (simplified - matches common import patterns)
      const importPatterns = [
        /import\s+.*?\s+from\s+['"](.+?)['"]/g,
        /require\s*\(\s*['"](.+?)['"]\s*\)/g,
        /import\s*\(\s*['"](.+?)['"]\s*\)/g,
      ];

      importPatterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const importPath = match[1];
          // Filter out node_modules, relative paths that are clearly external
          if (!importPath.startsWith('.') && !importPath.startsWith('/') && !importPath.includes('node_modules')) {
            // This is likely a source file dependency
            const normalized = importPath.replace(/^@\//, 'src/').replace(/\.(ts|tsx|js|jsx)$/, '');
            if (normalized && !dependencies.includes(normalized)) {
              dependencies.push(normalized);
            }
          } else if (importPath.startsWith('.')) {
            // Relative import - try to resolve
            const resolved = this.resolveRelativePath(filePath, importPath);
            if (resolved && !dependencies.includes(resolved)) {
              dependencies.push(resolved);
            }
          }
        }
      });
    } catch (error) {
      logger.debug({ error, testFilePath }, 'Failed to extract dependencies from test file');
    }

    return dependencies;
  }

  /**
   * Find tests that depend on a given file
   */
  private async findDependents(filePath: string, allTests: Array<{ testFile: string }>): Promise<string[]> {
    const dependents: string[] = [];
    
    // This is a simplified implementation
    // In production, you'd build a proper dependency graph
    const fileName = filePath.split(/[/\\]/).pop() || '';
    const baseName = fileName.replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '');

    // Limit the number of tests to check to avoid performance issues
    const MAX_DEPENDENT_CHECKS = 100;
    const testsToCheck = allTests.slice(0, MAX_DEPENDENT_CHECKS);

    for (const test of testsToCheck) {
      if (test.testFile !== filePath) {
        try {
          const testDeps = await this.extractDependencies(test.testFile);
          if (testDeps.some(dep => dep.includes(baseName) || dep.includes(filePath))) {
            dependents.push(test.testFile);
          }
        } catch (error) {
          // Skip this test if dependency extraction fails
          logger.debug({ error, testFile: test.testFile }, 'Failed to extract dependencies for dependent check');
        }
      }
    }

    return dependents;
  }

  /**
   * Resolve relative import path
   */
  private resolveRelativePath(fromFile: string, importPath: string): string | null {
    try {
      const fromDir = dirname(fromFile);
      const resolved = normalize(join(fromDir, importPath));
      // Remove file extension and make relative to project root
      const projectRoot = process.cwd();
      if (resolved.startsWith(projectRoot)) {
        return resolved.substring(projectRoot.length + 1).replace(/\.(ts|tsx|js|jsx)$/, '');
      }
    } catch (error) {
      logger.debug({ error, fromFile, importPath }, 'Failed to resolve relative path');
    }
    return null;
  }

  /**
   * Calculate impact score for a test
   */
  private calculateImpactScore(factors: {
    dependents: number;
    passRate: number;
    totalRuns: number;
    latestRun: Date;
  }): number {
    let score = 0;

    // Dependents factor (0-40 points)
    score += Math.min(factors.dependents * 5, 40);

    // Pass rate factor (0-30 points)
    // Lower pass rate = higher impact (more critical to fix)
    if (factors.passRate < 50) {
      score += 30;
    } else if (factors.passRate < 80) {
      score += 20;
    } else if (factors.passRate < 95) {
      score += 10;
    }

    // Recency factor (0-20 points)
    const daysSinceRun = (Date.now() - factors.latestRun.getTime()) / (24 * 60 * 60 * 1000);
    if (daysSinceRun < 1) {
      score += 20;
    } else if (daysSinceRun < 7) {
      score += 15;
    } else if (daysSinceRun < 30) {
      score += 10;
    }

    // Run frequency factor (0-10 points)
    if (factors.totalRuns >= 50) {
      score += 10;
    } else if (factors.totalRuns >= 20) {
      score += 7;
    } else if (factors.totalRuns >= 10) {
      score += 5;
    }

    return score;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

export function getTestDependencyAnalysisService(): TestDependencyAnalysisService {
  return TestDependencyAnalysisService.getInstance();
}

