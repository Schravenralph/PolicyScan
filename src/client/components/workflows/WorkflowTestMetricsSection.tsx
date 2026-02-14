/**
 * Workflow Test Metrics Section Component
 * 
 * Displays test metrics for workflows that are not in 'Tested' status.
 */

import { FileText } from 'lucide-react';
import { t } from '../../utils/i18n';

interface WorkflowTestMetricsSectionProps {
  testMetrics: {
    runCount: number;
    acceptanceRate: number;
    errorRate: number;
    lastTestRun?: string;
  };
}

export function WorkflowTestMetricsSection({ testMetrics }: WorkflowTestMetricsSectionProps) {
  return (
    <div className="p-4 border rounded-lg dark:bg-gray-900 dark:border-gray-700">
      <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <FileText className="w-5 h-5" />
        {t('workflowTestMetrics.title')}
      </h4>
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div>
          <div className="text-gray-600 dark:text-gray-400 mb-1">{t('workflowTestMetrics.testRuns')}</div>
          <div className="text-lg font-semibold">{testMetrics.runCount}</div>
        </div>
        <div>
          <div className="text-gray-600 dark:text-gray-400 mb-1">{t('workflowTestMetrics.acceptanceRate')}</div>
          <div className="text-lg font-semibold">
            {(testMetrics.acceptanceRate * 100).toFixed(0)}%
          </div>
          <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-green-600 h-2 rounded-full transition-all"
              style={{ width: `${testMetrics.acceptanceRate * 100}%` }}
            />
          </div>
        </div>
        <div>
          <div className="text-gray-600 dark:text-gray-400 mb-1">{t('workflowTestMetrics.errorRate')}</div>
          <div className="text-lg font-semibold">
            {(testMetrics.errorRate * 100).toFixed(0)}%
          </div>
          <div className="mt-1 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-red-600 h-2 rounded-full transition-all"
              style={{ width: `${testMetrics.errorRate * 100}%` }}
            />
          </div>
        </div>
      </div>
      {testMetrics.lastTestRun && (
        <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
          {t('workflowTestMetrics.lastTestRun')} {new Date(testMetrics.lastTestRun).toLocaleString()}
        </div>
      )}
    </div>
  );
}
