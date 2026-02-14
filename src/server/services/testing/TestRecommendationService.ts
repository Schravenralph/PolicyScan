/**
 * Test Recommendation Service
 * 
 * Analyzes test patterns, failures, and trends to provide actionable recommendations
 * for improving test quality, stability, and coverage.
 */

import { logger } from '../../utils/logger.js';
import { ensureDBConnection } from '../../config/database.js';
import { getTestSummaryService, type TestSummaryDocument } from './TestSummaryService.js';
import { getTestCoverageService } from './TestCoverageService.js';

export interface TestRecommendation {
  id: string;
  type: 'coverage' | 'stability' | 'performance' | 'maintenance' | 'flakiness' | 'best-practice';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  impact: string;
  actionItems: string[];
  relatedTests?: string[];
  metrics?: Record<string, unknown>;
}

export interface RecommendationAnalysis {
  recommendations: TestRecommendation[];
  summary: {
    total: number;
    byPriority: Record<string, number>;
    byType: Record<string, number>;
  };
  timestamp: string;
}

/**
 * Service for generating test recommendations based on analysis
 */
export class TestRecommendationService {
  private static instance: TestRecommendationService | null = null;

  private constructor() {}

  static getInstance(): TestRecommendationService {
    if (!TestRecommendationService.instance) {
      TestRecommendationService.instance = new TestRecommendationService();
    }
    return TestRecommendationService.instance;
  }

  /**
   * Generate comprehensive test recommendations
   */
  async generateRecommendations(options: {
    timeRangeDays?: number;
    testType?: TestSummaryDocument['testType'];
    branch?: string;
    includeCoverage?: boolean;
    includeFlakiness?: boolean;
    includePerformance?: boolean;
  } = {}): Promise<RecommendationAnalysis> {
    const {
      timeRangeDays = 30,
      testType,
      branch,
      includeCoverage = true,
      includeFlakiness = true,
      includePerformance = true,
    } = options;

    const recommendations: TestRecommendation[] = [];

    try {
      await ensureDBConnection();
      const summaryService = getTestSummaryService();
      await summaryService.ensureIndexes();

      // Get statistics
      const stats = await summaryService.getStatistics(timeRangeDays);
      const testFiles = await summaryService.getAllUniqueTestFiles({
        testType,
        branch,
        startDate: new Date(Date.now() - timeRangeDays * 24 * 60 * 60 * 1000),
      });

      // 1. Coverage recommendations
      if (includeCoverage) {
        const coverageService = getTestCoverageService();
        const coverageMetrics = await coverageService.getCoverageMetrics(timeRangeDays);
        
        if (coverageMetrics) {
          const linesCoverage = coverageMetrics.summary.lines.pct;
          const branchesCoverage = coverageMetrics.summary.branches.pct;

          if (linesCoverage < 80) {
            recommendations.push({
              id: 'coverage-lines-low',
              type: 'coverage',
              priority: linesCoverage < 50 ? 'critical' : linesCoverage < 70 ? 'high' : 'medium',
              title: 'Low Line Coverage',
              description: `Current line coverage is ${linesCoverage.toFixed(1)}%, below the recommended 80% threshold.`,
              impact: 'Low coverage increases risk of undetected bugs and regressions.',
              actionItems: [
                'Add unit tests for uncovered code paths',
                'Focus on critical business logic first',
                'Consider using coverage tools to identify gaps',
                'Set up coverage gates in CI/CD',
              ],
              metrics: { current: linesCoverage, target: 80 },
            });
          }

          if (branchesCoverage < 70) {
            recommendations.push({
              id: 'coverage-branches-low',
              type: 'coverage',
              priority: branchesCoverage < 50 ? 'high' : 'medium',
              title: 'Low Branch Coverage',
              description: `Current branch coverage is ${branchesCoverage.toFixed(1)}%, below the recommended 70% threshold.`,
              impact: 'Low branch coverage means conditional logic may not be fully tested.',
              actionItems: [
                'Add tests for edge cases and error paths',
                'Test both true and false conditions',
                'Cover null/undefined checks',
              ],
              metrics: { current: branchesCoverage, target: 70 },
            });
          }
        } else {
          recommendations.push({
            id: 'coverage-no-data',
            type: 'coverage',
            priority: 'medium',
            title: 'No Coverage Data Available',
            description: 'Coverage metrics are not being collected. Enable coverage collection to track test effectiveness.',
            impact: 'Cannot assess test coverage quality without metrics.',
            actionItems: [
              'Run tests with coverage: pnpm run test:coverage',
              'Configure coverage collection in test runner',
              'Set up coverage reporting in CI/CD',
            ],
          });
        }
      }

      // 2. Flakiness recommendations
      // Use FlakeDetectionService for proper test-level flakiness detection
      // This analyzes individual test cases (test_id) over many runs, not file-level aggregation
      if (includeFlakiness) {
        try {
          const { FlakeDetectionService } = await import('./FlakeDetectionService.js');
          const flakeService = FlakeDetectionService.getInstance();
          
          const flakeResult = await flakeService.detectFlakes({
            passRateThreshold: 0.95,
            minRuns: 50, // Minimum runs required for statistical significance
            maxRuns: 100,
            timeWindowDays: timeRangeDays,
            branch,
            suite: testType ? testType as any : undefined,
          });
          
          if (flakeResult.flaky_tests.length > 0) {
            const topFlaky = flakeResult.flaky_tests
              .slice(0, 5)
              .map(t => t.test_id);
            
            recommendations.push({
              id: 'flakiness-detected',
              type: 'flakiness',
              priority: flakeResult.flaky_tests.length > 10 ? 'high' : 'medium',
              title: `${flakeResult.flaky_tests.length} Flaky Test${flakeResult.flaky_tests.length > 1 ? 's' : ''} Detected`,
              description: `${flakeResult.flaky_tests.length} test${flakeResult.flaky_tests.length > 1 ? 's have' : ' has'} inconsistent pass rates, indicating potential flakiness.`,
              impact: 'Flaky tests reduce confidence in test results and can mask real issues.',
              actionItems: [
                'Investigate and fix flaky tests',
                'Add retry logic for external dependencies',
                'Use proper waiting strategies instead of timeouts',
                'Isolate tests from shared state',
                'Review test environment stability',
              ],
              relatedTests: topFlaky,
              metrics: {
                flakyCount: flakeResult.flaky_tests.length,
                totalTestsAnalyzed: flakeResult.total_tests_analyzed,
                flakeRate: flakeResult.summary.flake_rate,
              },
            });
          }
        } catch (error) {
          logger.debug({ error }, 'Flake detection unavailable, skipping flakiness recommendations');
          // Don't show error recommendation - flake detection is optional
          // If FlakeDetectionService fails, we simply don't show flakiness recommendations
        }
      }

      // 3. Performance recommendations
      if (includePerformance && stats) {
        if (stats.passRate < 90) {
          recommendations.push({
            id: 'pass-rate-low',
            type: 'stability',
            priority: stats.passRate < 70 ? 'critical' : stats.passRate < 85 ? 'high' : 'medium',
            title: 'Low Overall Pass Rate',
            description: `Overall pass rate is ${stats.passRate.toFixed(1)}%, below the recommended 90% threshold.`,
            impact: 'Low pass rate indicates systemic issues that need attention.',
            actionItems: [
              'Investigate failing tests',
              'Review recent code changes',
              'Check for environment issues',
              'Prioritize fixing critical failures',
            ],
            metrics: {
              current: stats.passRate,
              target: 90,
              totalFailed: stats.totalFailed || 0,
              totalPassed: stats.totalPassed || 0,
            },
          });
        }
      }

      // 4. Maintenance recommendations
      if (testFiles && testFiles.length > 0) {
        const filesWithoutRuns = testFiles.filter((test) => (test.totalRuns || 0) === 0);
        if (filesWithoutRuns.length > 0) {
          recommendations.push({
            id: 'tests-not-run',
            type: 'maintenance',
            priority: filesWithoutRuns.length > 5 ? 'medium' : 'low',
            title: `${filesWithoutRuns.length} Test File${filesWithoutRuns.length > 1 ? 's' : ''} Never Executed`,
            description: `${filesWithoutRuns.length} test file${filesWithoutRuns.length > 1 ? 's have' : ' has'} never been run, which may indicate obsolete or broken tests.`,
            impact: 'Unused tests add maintenance burden and may contain outdated code.',
            actionItems: [
              'Verify tests are still relevant',
              'Run tests to ensure they work',
              'Remove or update obsolete tests',
              'Document test purpose',
            ],
            relatedTests: filesWithoutRuns.slice(0, 10).map(t => t.testFile || 'unknown'),
            metrics: { unusedCount: filesWithoutRuns.length },
          });
        }
      }

      // 5. Best practice recommendations
      if (stats && stats.totalRuns > 0 && testFiles && testFiles.length > 0) {
        const avgRunsPerTest = stats.totalRuns / testFiles.length;
        if (avgRunsPerTest < 5) {
          recommendations.push({
            id: 'insufficient-runs',
            type: 'best-practice',
            priority: 'low',
            title: 'Low Test Execution Frequency',
            description: `Average of ${avgRunsPerTest.toFixed(1)} runs per test file. More frequent execution helps catch issues earlier.`,
            impact: 'Infrequent test execution delays detection of regressions.',
            actionItems: [
              'Set up automated test runs in CI/CD',
              'Run tests on every commit',
              'Schedule regular test runs',
            ],
            metrics: { avgRunsPerTest },
          });
        }
      }

    } catch (error) {
      logger.error({ error }, 'Error generating test recommendations');
      // Add a recommendation about the error if no recommendations were generated
      if (recommendations.length === 0) {
        recommendations.push({
          id: 'recommendations-error',
          type: 'maintenance',
          priority: 'medium',
          title: 'Unable to Generate Recommendations',
          description: 'An error occurred while generating recommendations. Please check server logs for details.',
          impact: 'Recommendations cannot be displayed.',
          actionItems: [
            'Check server logs for error details',
            'Verify database connectivity',
            'Ensure test data is available',
            'Retry after resolving errors',
          ],
          metrics: { error: error instanceof Error ? error.message : 'Unknown error' },
        });
      }
    }

    // Calculate summary
    const byPriority: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    const byType: Record<string, number> = {};

    recommendations.forEach(rec => {
      byPriority[rec.priority] = (byPriority[rec.priority] || 0) + 1;
      byType[rec.type] = (byType[rec.type] || 0) + 1;
    });

    return {
      recommendations,
      summary: {
        total: recommendations.length,
        byPriority,
        byType,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export function getTestRecommendationService(): TestRecommendationService {
  return TestRecommendationService.getInstance();
}

