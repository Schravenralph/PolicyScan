/**
 * Flaky Tests Widget Section Component
 * 
 * Displays flaky tests information and top flaky tests list.
 */

import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Link } from 'react-router-dom';
import { Button } from '../ui/button';
import { ArrowRight } from 'lucide-react';

interface FlakyTest {
  test_id?: string;
  suite?: string;
  pass_rate: number;
  flake_rate: number;
}

interface FlakyTestsWidgetSectionProps {
  flakyTestMetrics: {
    totalFlakyTests: number;
    flakyTests?: FlakyTest[];
  } | null;
  flakyTestMetricsLoading: boolean;
}

export function FlakyTestsWidgetSection({
  flakyTestMetrics,
  flakyTestMetricsLoading,
}: FlakyTestsWidgetSectionProps) {
  if (flakyTestMetricsLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🎲 Flaky Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">Loading flaky tests data...</div>
        </CardContent>
      </Card>
    );
  }

  if (!flakyTestMetrics) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>🎲 Flaky Tests</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-gray-500">No flaky tests data available</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>🎲 Flaky Tests</CardTitle>
      </CardHeader>
      <CardContent>
        {flakyTestMetrics.totalFlakyTests > 0 ? (
          <div className="space-y-4">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="text-sm font-semibold text-orange-800">
                {flakyTestMetrics.totalFlakyTests === 0
                  ? 'No flaky tests detected' 
                  : `${flakyTestMetrics.totalFlakyTests} flaky tests detected`}
              </div>
            </div>
            {flakyTestMetrics.flakyTests && flakyTestMetrics.flakyTests.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-gray-700 mb-2">Top Flaky Tests:</div>
                <div className="space-y-2">
                  {flakyTestMetrics.flakyTests.slice(0, 5).map((test, index) => (
                    <div key={index} className="p-2 bg-gray-50 rounded text-xs">
                      <div className="font-medium">{test.suite || test.test_id}</div>
                      <div className="text-gray-500 mt-1">
                        Pass Rate: {(test.pass_rate * 100).toFixed(1)}% | 
                        Flake Rate: {(test.flake_rate * 100).toFixed(1)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Link to="/tests/trends#flake-detection">
              <Button variant="outline" size="sm" className="w-full">
                View All Flaky Tests
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="text-sm text-gray-500">No flaky tests data available</div>
        )}
      </CardContent>
    </Card>
  );
}
