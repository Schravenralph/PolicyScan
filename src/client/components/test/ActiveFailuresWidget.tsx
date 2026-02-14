/**
 * Active Failures Widget Component
 * 
 * Displays active test failures with breakdown by severity and navigation to failure details.
 */

import { useNavigate } from 'react-router-dom';
import { Loader2, ExternalLink } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import type { ActiveFailuresState } from '../../hooks/useActiveFailures';
import { t } from '../../utils/i18n';

interface ActiveFailuresWidgetProps {
  activeFailures: ActiveFailuresState | null;
  loading: boolean;
  onNavigateToFailures?: () => void;
}

export function ActiveFailuresWidget({
  activeFailures,
  loading,
  onNavigateToFailures,
}: ActiveFailuresWidgetProps) {
  const navigate = useNavigate();

  const handleClick = () => {
    if (activeFailures && activeFailures.total > 0) {
      if (onNavigateToFailures) {
        onNavigateToFailures();
      } else {
        navigate('/tests/errors');
      }
    }
  };

  return (
    <Card
      className={activeFailures && activeFailures.total > 0 ? 'cursor-pointer hover:bg-gray-50 transition-colors' : ''}
      onClick={handleClick}
    >
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>🔴 Active Failures</CardTitle>
          {activeFailures && activeFailures.total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleClick();
              }}
              className="text-xs"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              View All
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">Loading...</span>
          </div>
        ) : activeFailures ? (
          <div className="space-y-3">
            <div>
              <div className="text-2xl font-bold text-red-600 mb-2">
                {activeFailures.total}
              </div>
              <div className="text-sm text-gray-600">
                Active failures: {activeFailures.total}
                {activeFailures.newCount > 0 && (
                  <span className="ml-2 text-orange-600 font-semibold">
                    • New since last run: {activeFailures.newCount}
                  </span>
                )}
              </div>
            </div>

            {/* Breakdown by severity */}
            {activeFailures.failures && activeFailures.failures.length > 0 && (
              <div className="pt-3 border-t border-border">
                <div className="text-xs font-semibold text-foreground mb-2">Breakdown by Severity:</div>
                <div className="grid grid-cols-2 gap-2">
                  {(() => {
                    const severityCounts = activeFailures.failures.reduce((acc, f) => {
                      const severity = f.severity || 'unknown';
                      acc[severity] = (acc[severity] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);

                    const severityOrder = ['critical', 'high', 'medium', 'low', 'unknown'];
                    const severityColors: Record<string, string> = {
                      critical: 'bg-red-100 dark:bg-red-950/30 text-red-800 dark:text-red-200',
                      high: 'bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-200',
                      medium: 'bg-yellow-100 dark:bg-yellow-950/30 text-yellow-800 dark:text-yellow-200',
                      low: 'bg-primary/10 text-primary dark:text-primary',
                      unknown: 'bg-muted text-muted-foreground',
                    };

                    return severityOrder
                      .filter(severity => severityCounts[severity] > 0)
                      .map(severity => (
                        <div
                          key={severity}
                          className={`px-2 py-1 rounded text-xs font-medium ${severityColors[severity] || severityColors.unknown}`}
                        >
                          {severity.charAt(0).toUpperCase() + severity.slice(1)}: {severityCounts[severity]}
                        </div>
                      ));
                  })()}
                </div>
              </div>
            )}

            {/* Breakdown by state */}
            {activeFailures.failures && activeFailures.failures.length > 0 && (
              <div className="pt-2">
                <div className="text-xs font-semibold text-gray-700 mb-2">Breakdown by State:</div>
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const stateCounts = activeFailures.failures.reduce((acc, f) => {
                      const state = f.state || 'unknown';
                      acc[state] = (acc[state] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>);

                    const stateColors: Record<string, string> = {
                      new: 'bg-orange-100 text-orange-800',
                      active: 'bg-red-100 text-red-800',
                      flaky: 'bg-yellow-100 text-yellow-800',
                      resolved: 'bg-green-100 text-green-800',
                      unknown: 'bg-gray-100 text-gray-800',
                    };

                    return Object.entries(stateCounts)
                      .filter(([_, count]) => count > 0)
                      .map(([state, count]) => (
                        <div
                          key={state}
                          className={`px-2 py-1 rounded text-xs font-medium ${stateColors[state] || stateColors.unknown}`}
                        >
                          {state.charAt(0).toUpperCase() + state.slice(1)}: {count}
                        </div>
                      ));
                  })()}
                </div>
              </div>
            )}

            {activeFailures.total > 0 && (
              <div className="pt-2 text-xs text-gray-500 italic">
                Click to view detailed failure analysis
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500">{t('test.noActiveFailuresData')}</div>
        )}
      </CardContent>
    </Card>
  );
}

