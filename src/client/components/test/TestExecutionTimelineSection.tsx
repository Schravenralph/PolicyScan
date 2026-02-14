/**
 * Test Execution Timeline Section Component
 * 
 * Displays test execution timeline with statistics.
 */

import { Calendar, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import type { TestStatistics } from '../../hooks/useTestStatistics';
import { t } from '../../utils/i18n';

interface TestExecutionTimelineSectionProps {
  statistics: TestStatistics | null;
}

export function TestExecutionTimelineSection({ statistics }: TestExecutionTimelineSectionProps) {
  const navigate = useNavigate();

  if (!statistics) return null;

  return (
    <Card
      className="cursor-pointer hover:bg-gray-50 transition-colors"
      onClick={() => navigate('/tests/timeline')}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('testExecutionTimeline.title')}</CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              navigate('/tests/timeline');
            }}
          >
            {t('testExecutionTimeline.viewTimeline')}
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {statistics.recentRuns && Array.isArray(statistics.recentRuns) && statistics.recentRuns.length > 0 ? (
          <div className="space-y-3">
            {statistics.recentRuns.slice(0, 5).map((run: { timestamp?: string; passed?: number; failed?: number }, index: number) => (
              <div key={index} className="flex items-center gap-3 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <div className="flex-1">
                  <div className="font-medium">
                    {run.timestamp ? new Date(run.timestamp).toLocaleString() : t('testExecutionTimeline.unknownTime')}
                  </div>
                  <div className="text-xs text-gray-500">
                    {t('testExecutionTimeline.testResults').replace('{{passed}}', String(run.passed || 0)).replace('{{failed}}', String(run.failed || 0))}
                  </div>
                </div>
              </div>
            ))}
            {Array.isArray(statistics.recentRuns) && statistics.recentRuns.length > 5 && (
              <div className="text-xs text-gray-500 text-center pt-2">
                {t('testExecutionTimeline.moreRuns').replace('{{count}}', String(statistics.recentRuns.length - 5))}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4 text-gray-500">
            {t('testExecutionTimeline.noData')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
