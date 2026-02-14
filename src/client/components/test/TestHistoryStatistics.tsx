/**
 * Test History Statistics Component
 * 
 * Displays test history statistics including total runs, tests, pass rate, and duration.
 */

import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { t } from '../../utils/i18n';

interface TestHistoryStatisticsProps {
  statistics: {
    totalRuns: number;
    totalTests: number;
    avgPassRate: number;
    avgDuration: number;
    trend: 'improving' | 'declining' | 'stable';
  };
}

export function TestHistoryStatistics({ statistics }: TestHistoryStatisticsProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('testHistoryStatistics.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-sm text-muted-foreground">{t('testHistoryStatistics.totalRuns')}</div>
            <div className="text-2xl font-bold">{statistics.totalRuns}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('testHistoryStatistics.totalTests')}</div>
            <div className="text-2xl font-bold">{statistics.totalTests}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('testHistoryStatistics.avgPassRate')}</div>
            <div className="text-2xl font-bold flex items-center gap-2">
              {statistics.avgPassRate.toFixed(1)}%
              {statistics.trend === 'improving' && <TrendingUp className="w-4 h-4 text-green-600" />}
              {statistics.trend === 'declining' && <TrendingDown className="w-4 h-4 text-red-600" />}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('testHistoryStatistics.avgDuration')}</div>
            <div className="text-2xl font-bold">{(statistics.avgDuration / 1000).toFixed(1)}s</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
