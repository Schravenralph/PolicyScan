/**
 * Workflow Quality Gates Section Component
 * 
 * Displays quality gates status for tested workflows.
 */

import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Badge } from '../ui/badge';
import { t } from '../../utils/i18n';

interface WorkflowQualityGatesSectionProps {
  qualityGates: { passed: boolean; reasons: string[] } | null;
  loading: boolean;
  testMetrics?: {
    runCount: number;
    acceptanceRate: number;
    errorRate: number;
    lastTestRun?: string;
  };
}

export function WorkflowQualityGatesSection({
  qualityGates,
  loading,
  testMetrics,
}: WorkflowQualityGatesSectionProps) {
  return (
    <div className="p-4 border rounded-lg border-border bg-card">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-semibold text-foreground flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          {t('workflowQualityGates.title')}
        </h4>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            {t('workflowQualityGates.checking')}
          </div>
        ) : qualityGates?.passed ? (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" />
            {t('workflowQualityGates.passed')}
          </Badge>
        ) : (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 flex items-center gap-1">
            <XCircle className="w-3 h-3" />
            {t('workflowQualityGates.notMet')}
          </Badge>
        )}
      </div>
      {qualityGates && (
        <div className="space-y-3">
          {qualityGates.reasons.length === 0 ? (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">{t('workflowQualityGates.allMet')}</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-300 mb-2">
                  <XCircle className="w-5 h-5" />
                  <span className="font-medium">{t('workflowQualityGates.notMetTitle')}</span>
                </div>
                <ul className="space-y-2 text-sm text-red-600 dark:text-red-400">
                  {qualityGates.reasons.map((reason, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="mt-0.5">•</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>
              {testMetrics && (
                <div className="mt-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">{t('workflowQualityGates.testMetricsSummary')}</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="p-2 bg-muted rounded">
                      <div className="text-muted-foreground">{t('workflowQualityGates.runs')}</div>
                      <div className="font-semibold">{testMetrics.runCount}</div>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <div className="text-muted-foreground">{t('workflowQualityGates.acceptance')}</div>
                      <div className="font-semibold">{(testMetrics.acceptanceRate * 100).toFixed(0)}%</div>
                    </div>
                    <div className="p-2 bg-muted rounded">
                      <div className="text-muted-foreground">{t('workflowQualityGates.errorRate')}</div>
                      <div className="font-semibold">{(testMetrics.errorRate * 100).toFixed(0)}%</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
