/**
 * Comparison Results Component
 * 
 * Displays the results of workflow comparisons including:
 * - Summary section with winner
 * - Metrics comparison table
 * - Trend analysis chart
 * - Document discovery comparison
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Badge } from '../ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import { ChartTooltip, ChartTooltipContent } from '../ui/chart';
import { TrendingUp, Minus } from 'lucide-react';
import { t } from '../../utils/i18n';

interface WorkflowComparison {
  workflowId: string;
  workflowName: string;
  runs: number;
  metrics: {
    avgExecutionTime: number;
    avgDocumentsFound: number;
    avgScore: number;
  };
}

export interface MetricData {
  metric: string;
  workflowA: number;
  workflowB: number;
  unit: string;
  better: 'A' | 'B' | 'tie';
}

interface TrendDataPoint {
  index: number;
  workflowA: number;
  workflowB: number;
}

export interface Winner {
  workflow: 'A' | 'B' | 'tie';
  name: string;
  score: number;
}

interface ComparisonResultsProps {
  comparisonA: WorkflowComparison;
  comparisonB: WorkflowComparison;
  metricsData: MetricData[];
  trendData: TrendDataPoint[];
  winner: Winner | null;
}

export function ComparisonResults({
  comparisonA,
  comparisonB,
  metricsData,
  trendData,
  winner,
}: ComparisonResultsProps) {
  return (
    <>
      {/* Summary Section */}
      <Card>
        <CardHeader>
          <CardTitle>{t('workflowComparison.comparisonSummary')}</CardTitle>
          <CardDescription>{t('workflowComparison.overallPerformanceComparison')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">{t('workflowComparison.workflowA')}</p>
              <p className="text-2xl font-bold mt-2">{comparisonA.workflowName}</p>
              <p className="text-sm text-muted-foreground mt-1">{comparisonA.runs} {t('workflowComparison.runs')}</p>
            </div>
            <div className="text-center p-4 border rounded-lg bg-primary/5">
              <p className="text-sm text-muted-foreground">{t('workflowComparison.winner')}</p>
              <p className="text-2xl font-bold mt-2">
                {winner?.workflow === 'tie' ? t('workflowComparison.tie') : `${t('workflowComparison.workflowA')} ${winner?.workflow}`}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {winner?.score} {t('workflowComparison.metricsBetter')}
              </p>
            </div>
            <div className="text-center p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">{t('workflowComparison.workflowB')}</p>
              <p className="text-2xl font-bold mt-2">{comparisonB.workflowName}</p>
              <p className="text-sm text-muted-foreground mt-1">{comparisonB.runs} {t('workflowComparison.runs')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Metrics Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('workflowComparison.metricsComparison')}</CardTitle>
          <CardDescription>{t('workflowComparison.sideBySideMetrics')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('workflowComparison.metric')}</TableHead>
                <TableHead className="text-center">{t('workflowComparison.workflowA')}</TableHead>
                <TableHead className="text-center">{t('workflowComparison.workflowB')}</TableHead>
                <TableHead className="text-center">{t('workflowComparison.better')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metricsData.map((m) => (
                <TableRow key={m.metric}>
                  <TableCell className="font-medium">{m.metric}</TableCell>
                  <TableCell className="text-center">
                    {m.workflowA.toFixed(2)} {m.unit}
                  </TableCell>
                  <TableCell className="text-center">
                    {m.workflowB.toFixed(2)} {m.unit}
                  </TableCell>
                  <TableCell className="text-center">
                    {m.better === 'A' ? (
                      <Badge variant="default" className="gap-1">
                        <TrendingUp className="h-3 w-3" /> A
                      </Badge>
                    ) : m.better === 'B' ? (
                      <Badge variant="default" className="gap-1">
                        <TrendingUp className="h-3 w-3" /> B
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1">
                        <Minus className="h-3 w-3" /> {t('workflowComparison.tie')}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Trend Chart */}
      {trendData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('workflowComparison.trendAnalysis')}</CardTitle>
            <CardDescription>{t('workflowComparison.averageScoreOverTime')}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="index" label={{ value: t('workflowComparison.runIndex'), position: 'insideBottom' }} />
                  <YAxis label={{ value: t('workflowComparison.averageScore'), angle: -90, position: 'insideLeft' }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="workflowA"
                    stroke="#3b82f6"
                    strokeWidth={2}
                    name={comparisonA.workflowName}
                    dot={{ r: 3 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="workflowB"
                    stroke="#10b981"
                    strokeWidth={2}
                    name={comparisonB.workflowName}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Document Discovery Comparison */}
      <Card>
        <CardHeader>
          <CardTitle>{t('workflowComparison.documentDiscovery')}</CardTitle>
          <CardDescription>{t('workflowComparison.documentDiscoveryComparison')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">{t('workflowComparison.workflowA')}</p>
              <p className="text-2xl font-bold mt-2">
                {comparisonA.metrics.avgDocumentsFound.toFixed(0)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{t('workflowComparison.avgDocumentsFound')}</p>
            </div>
            <div className="p-4 border rounded-lg">
              <p className="text-sm text-muted-foreground">{t('workflowComparison.workflowB')}</p>
              <p className="text-2xl font-bold mt-2">
                {comparisonB.metrics.avgDocumentsFound.toFixed(0)}
              </p>
              <p className="text-sm text-muted-foreground mt-1">{t('workflowComparison.avgDocumentsFound')}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
