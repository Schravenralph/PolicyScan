import { useState, useEffect } from 'react';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TestApiService } from '../services/api/TestApiService';

interface CollapsibleSectionProps {
  title: string;
  testCount?: number;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({ title, testCount, children, defaultExpanded = true }: CollapsibleSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  return (
    <div className="mb-4">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 bg-muted hover:bg-muted/80 rounded-lg transition-colors cursor-pointer"
      >
        <span className="font-semibold">
          {title}
          {testCount !== undefined && (
            <span className="ml-2 px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
              {testCount} tests
            </span>
          )}
        </span>
        {isExpanded ? (
          <ChevronDown className="w-5 h-5" />
        ) : (
          <ChevronRight className="w-5 h-5" />
        )}
      </button>
      {isExpanded && (
        <div className="mt-2 pl-4">
          {children}
        </div>
      )}
    </div>
  );
}

export function TestDocumentationPage() {
  const [testStatistics, setTestStatistics] = useState<{
    totalFiles: number;
    totalTests: number;
    byType: {
      unit: { files: number; tests: number };
      integration: { files: number; tests: number };
      e2e: { files: number; tests: number };
      spec: { files: number; tests: number };
      other: { files: number; tests: number };
    };
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatistics = async () => {
      try {
        setLoading(true);
        setError(null);
        const testApiService = new TestApiService();
        const stats = await testApiService.getTestStatistics();
        setTestStatistics({
          totalFiles: (stats.totalFiles as number) || 0,
          totalTests: (stats.totalTests as number) || 0,
          byType: (stats.byType as {
            unit: { files: number; tests: number };
            integration: { files: number; tests: number };
            e2e: { files: number; tests: number };
            spec: { files: number; tests: number };
            other: { files: number; tests: number };
          }) || {
            unit: { files: 0, tests: 0 },
            integration: { files: 0, tests: 0 },
            e2e: { files: 0, tests: 0 },
            spec: { files: 0, tests: 0 },
            other: { files: 0, tests: 0 },
          },
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load test statistics');
        console.error('Error fetching test statistics:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStatistics();
  }, []);

  const coverageSummaryData = [
    { feature: 'API Validation', unitTests: 4, e2eTests: 0, total: 4 },
    { feature: 'Data Aggregation', unitTests: 4, e2eTests: 0, total: 4 },
    { feature: 'Coverage by Type', unitTests: 2, e2eTests: 1, total: 3 },
    { feature: 'Module Coverage', unitTests: 1, e2eTests: 2, total: 3 },
    { feature: 'Trends Calculation', unitTests: 2, e2eTests: 1, total: 3 },
    { feature: 'Frontend Display', unitTests: 0, e2eTests: 6, total: 6 },
    { feature: 'Navigation', unitTests: 0, e2eTests: 3, total: 3 },
    { feature: 'Time Range Filtering', unitTests: 1, e2eTests: 2, total: 3 },
    { feature: 'Theme Toggle', unitTests: 0, e2eTests: 2, total: 2 },
    { feature: 'Error Handling', unitTests: 1, e2eTests: 2, total: 3 },
  ];

  // Use real statistics if available, otherwise fall back to hardcoded values
  const totalUnitTests = testStatistics?.byType.unit.tests ?? coverageSummaryData.reduce((sum, row) => sum + row.unitTests, 0);
  const totalE2eTests = testStatistics?.byType.e2e.tests ?? coverageSummaryData.reduce((sum, row) => sum + row.e2eTests, 0);
  const totalIntegrationTests = testStatistics?.byType.integration.tests ?? 0;
  const totalTests = testStatistics?.totalTests ?? (totalUnitTests + totalE2eTests);
  const totalFiles = testStatistics?.totalFiles ?? 2;

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">📚 Test Documentation</h1>
        <p className="text-muted-foreground mt-1">Comprehensive documentation for the Test Coverage & Metrics dashboard test suite</p>
      </div>

      {/* Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-muted border-l-4 border-primary p-5 rounded">
            <p className="text-foreground">
              This document describes the comprehensive test suite for the Test Coverage & Metrics dashboard feature.
              The tests cover both the API endpoint (<code className="bg-muted px-2 py-1 rounded">/api/tests/coverage-metrics</code>) and the frontend page.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Test Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Test Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <div className="text-center py-8">
              <div className="text-muted-foreground">Loading test statistics...</div>
            </div>
          )}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-4">
              <div className="text-red-700 font-semibold">Error loading statistics</div>
              <div className="text-red-600 text-sm mt-1">{error}</div>
            </div>
          )}
          {!loading && !error && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-muted p-5 rounded-lg border-l-4 border-primary text-center">
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-2">Unit Tests</div>
                <div className="text-4xl font-bold text-primary">{totalUnitTests.toLocaleString()}</div>
                {testStatistics && (
                  <div className="text-xs text-muted-foreground mt-1">{testStatistics.byType.unit.files} bestanden</div>
                )}
              </div>
              <div className="bg-muted p-5 rounded-lg border-l-4 border-green-500 dark:border-green-600 text-center">
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-2">Integration Tests</div>
                <div className="text-4xl font-bold text-green-600 dark:text-green-400">{totalIntegrationTests.toLocaleString()}</div>
                {testStatistics && (
                  <div className="text-xs text-muted-foreground mt-1">{testStatistics.byType.integration.files} bestanden</div>
                )}
              </div>
              <div className="bg-muted p-5 rounded-lg border-l-4 border-purple-500 dark:border-purple-600 text-center">
                <div className="text-sm text-muted-foreground uppercase tracking-wide mb-2">End-to-end Tests</div>
                <div className="text-4xl font-bold text-purple-600 dark:text-purple-400">{totalE2eTests.toLocaleString()}</div>
                {testStatistics && (
                  <div className="text-xs text-muted-foreground mt-1">{testStatistics.byType.e2e.files} bestanden</div>
                )}
              </div>
              <div className="bg-gray-50 p-5 rounded-lg border-l-4 border-orange-500 text-center">
                <div className="text-sm text-gray-600 uppercase tracking-wide mb-2">Totaal Tests</div>
                <div className="text-4xl font-bold text-orange-600">{totalTests.toLocaleString()}</div>
                <div className="text-xs text-gray-500 mt-1">{totalFiles.toLocaleString()} bestanden</div>
              </div>
            </div>
          )}
          {testStatistics && !loading && !error && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-semibold mb-3">Verdeling per Type</h3>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-sm text-gray-600">Unit</div>
                  <div className="text-2xl font-bold">{testStatistics.byType.unit.tests.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{testStatistics.byType.unit.files} bestanden</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Integration</div>
                  <div className="text-2xl font-bold">{testStatistics.byType.integration.tests.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{testStatistics.byType.integration.files} bestanden</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">End-to-end</div>
                  <div className="text-2xl font-bold">{testStatistics.byType.e2e.tests.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{testStatistics.byType.e2e.files} bestanden</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Spec</div>
                  <div className="text-2xl font-bold">{testStatistics.byType.spec.tests.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{testStatistics.byType.spec.files} bestanden</div>
                </div>
                <div className="text-center">
                  <div className="text-sm text-gray-600">Other</div>
                  <div className="text-2xl font-bold">{testStatistics.byType.other.tests.toLocaleString()}</div>
                  <div className="text-xs text-gray-500">{testStatistics.byType.other.files} bestanden</div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unit Tests Section */}
      <Card>
        <CardHeader>
          <CardTitle>Unit Tests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            <strong>File:</strong> <code className="bg-gray-100 px-2 py-1 rounded">tests/server/unit/testRoutes.coverage.test.ts</code><br />
            <strong>Purpose:</strong> Test the API endpoint <code className="bg-gray-100 px-2 py-1 rounded">/api/tests/coverage-metrics</code> in isolation.
          </p>

          <CollapsibleSection title="Validation Tests" testCount={4}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Returns 400 for invalid time range (less than 1)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Returns 400 for invalid time range (greater than 365)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Accepts valid time range (1-365)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Defaults to 30 days when timeRangeDays is not provided</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Data Aggregation from Test History" testCount={4}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Extracts coverage data from test history entries with metadata</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Handles entries without coverage data in metadata</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Calculates change when there are at least 2 data points</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Does not calculate change when there is only 1 data point</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Coverage by Type Aggregation" testCount={2}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Aggregates coverage by test type (e2e, unit, integration, etc.)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Calculates averages for each test type</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Handles entries with missing testType (defaults to 'other')</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Current Coverage from Files" testCount={3}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Prioritizes current coverage from files over history</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Extracts module coverage from current coverage files</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Handles error when extracting coverage from files gracefully</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Response Structure" testCount={1}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Returns complete response structure with all required fields</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies summary structure (statements, branches, functions, lines)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies trends is an array</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies byType is an object</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies modules is an array</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies metrics structure</span>
              </li>
            </ul>
          </CollapsibleSection>
        </CardContent>
      </Card>

      {/* E2E Tests Section */}
      <Card>
        <CardHeader>
          <CardTitle>End-to-end Tests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-gray-600">
            <strong>Bestand:</strong> <code className="bg-gray-100 px-2 py-1 rounded">tests/e2e/test-coverage.spec.ts</code><br />
            <strong>Doel:</strong> Test de frontend pagina end-to-end.
          </p>

          <CollapsibleSection title="Page Loading and Navigation" testCount={3}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Loads the test coverage page</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays navigation bar with all links</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Navigates to other dashboard pages from navigation</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Highlights active link correctly</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Coverage Overview Cards" testCount={3}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays coverage overview cards (Lines, Statements, Branches, Functions, Test Runs, Files Covered)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Shows correct coverage percentages</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays change indicators when change data is available</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Handles empty coverage data gracefully</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Coverage Trends Chart" testCount={2}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Renders coverage trends chart with data</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays all four coverage metrics (lines, statements, branches, functions)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Shows no data message when trends are empty</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Coverage by Type Visualization" testCount={1}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Renders coverage by type chart</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays different test types (e2e, unit, integration, etc.)</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Module Coverage List" testCount={2}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays module coverage list</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Shows module names and coverage percentages</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays coverage bars with correct percentages</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Shows no data message when modules are empty</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Key Metrics Table" testCount={1}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays key metrics table</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Shows all required columns (Metric, Value, Target, Status)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays correct metrics (Overall Coverage, Branch Coverage, Function Coverage, Test Runs)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Shows status indicators (✅ or ⚠️)</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Time Range Filtering" testCount={2}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Allows changing time range</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays time range selector with options (7, 30, 90, 365 days)</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Refreshes data when time range changes</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Calls API with correct time range parameter</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Theme Toggle" testCount={2}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Toggles between light and dark theme</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Persists theme preference in localStorage</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Applies theme on page load</span>
              </li>
            </ul>
          </CollapsibleSection>

          <CollapsibleSection title="Error Handling" testCount={2}>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Displays error message when API fails</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Handles 404 response gracefully</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Shows appropriate no data messages</span>
              </li>
            </ul>
          </CollapsibleSection>
        </CardContent>
      </Card>

      {/* Test Coverage Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle>Test Coverage Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Feature</th>
                  <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Unit Tests</th>
                  <th className="border border-gray-300 px-4 py-2 text-left font-semibold">E2E Tests</th>
                  <th className="border border-gray-300 px-4 py-2 text-left font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>
                {coverageSummaryData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="border border-gray-300 px-4 py-2">{row.feature}</td>
                    <td className="border border-gray-300 px-4 py-2">{row.unitTests || '-'}</td>
                    <td className="border border-gray-300 px-4 py-2">{row.e2eTests || '-'}</td>
                    <td className="border border-gray-300 px-4 py-2">{row.total}</td>
                  </tr>
                ))}
                <tr className="bg-gray-100 font-semibold">
                  <td className="border border-gray-300 px-4 py-2"><strong>Total</strong></td>
                  <td className="border border-gray-300 px-4 py-2"><strong>{totalUnitTests}</strong></td>
                  <td className="border border-gray-300 px-4 py-2"><strong>{totalE2eTests}</strong></td>
                  <td className="border border-gray-300 px-4 py-2"><strong>{totalTests}</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Running the Tests */}
      <Card>
        <CardHeader>
          <CardTitle>Running the Tests</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold mb-2 pb-2 border-b border-gray-300">Run Unit Tests</h3>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              pnpm test tests/server/unit/testRoutes.coverage.test.ts
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-2 pb-2 border-b border-gray-300">End-to-end Tests Uitvoeren</h3>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre">
              pnpm run test:e2e:setup{'\n'}playwright test tests/e2e/test-coverage.spec.ts
            </div>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-2 pb-2 border-b border-gray-300">Run All Coverage Tests</h3>
            <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm overflow-x-auto whitespace-pre">
              # Unit tests{'\n'}pnpm test tests/server/unit/testRoutes.coverage.test.ts{'\n\n'}# E2E tests{'\n'}pnpm run test:e2e:setup{'\n'}playwright test tests/e2e/test-coverage.spec.ts
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Test Scenarios */}
      <Card>
        <CardHeader>
          <CardTitle>Key Test Scenarios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">1. API Endpoint Validation</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests that the API correctly validates time range parameters</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Ensures proper error messages for invalid inputs</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies default behavior when parameters are missing</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">2. Data Aggregation</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests extraction of coverage data from test history</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies calculation of trends and changes</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Ensures proper handling of missing or incomplete data</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">3. Coverage by Type</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests aggregation of coverage metrics by test type</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies calculation of averages for each type</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Handles edge cases (missing types, empty data)</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">4. Module Coverage</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests extraction of module-level coverage from files</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies sorting by coverage percentage</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Handles missing or empty module data</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">5. Frontend Display</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests rendering of all UI components</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Verifies correct display of data</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests error states and empty states</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">6. User Interactions</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests time range filtering</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests theme toggle</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests navigation between pages</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">7. Error Handling</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests API error responses</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests 404 handling</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span>Tests graceful degradation</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Mocking Strategy */}
      <Card>
        <CardHeader>
          <CardTitle>Mocking Strategy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">Unit Tests</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span><strong>TestHistory:</strong> Mocked using <code className="bg-gray-200 px-2 py-1 rounded">vi.mock()</code> and <code className="bg-gray-200 px-2 py-1 rounded">vi.spyOn()</code> to control return values</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span><strong>coverage-extractor:</strong> Mocked to return test data or null for error scenarios</span>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xl font-semibold mb-3 pb-2 border-b border-gray-300">End-to-end Tests</h3>
            <ul className="list-none space-y-2">
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span><strong>API Responses:</strong> Mocked using Playwright's <code className="bg-gray-200 px-2 py-1 rounded">page.route()</code> to simulate different API responses</span>
              </li>
              <li className="flex items-center gap-2 p-2 bg-gray-50 rounded">
                <span className="text-green-600">✅</span>
                <span><strong>Backend Availability:</strong> Checked before running tests to skip if backend is unavailable</span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
