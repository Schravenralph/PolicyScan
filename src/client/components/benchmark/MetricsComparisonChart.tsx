import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';

interface WorkflowMetrics {
  workflowId: string;
  workflowName: string;
  precisionAtK: {
    k1: number;
    k5: number;
    k10: number;
  };
  recallAtK: {
    k1: number;
    k5: number;
    k10: number;
  };
  f1Score: number;
  map: number;
  ndcg: {
    k1: number;
    k5: number;
    k10: number;
    mean_ndcg?: number;
  };
}

interface MetricsComparisonChartProps {
  workflows: WorkflowMetrics[];
  metricType: 'precision' | 'recall' | 'ndcg' | 'f1' | 'map';
  className?: string;
}

/**
 * Metrics Comparison Chart Component
 * 
 * Displays a side-by-side comparison of metrics across multiple workflows.
 * Supports different metric types: precision, recall, NDCG, F1, and MAP.
 * 
 * @component
 */
export function MetricsComparisonChart({
  workflows,
  metricType,
  className,
}: MetricsComparisonChartProps) {
  const chartData = useMemo(() => {
    if (metricType === 'precision' || metricType === 'recall' || metricType === 'ndcg') {
      // For K-based metrics, show K=1, K=5, K=10
      return workflows.map((workflow) => {
        const data: Record<string, string | number> = {
          workflow: workflow.workflowName,
        };

        if (metricType === 'precision') {
          data['K=1'] = workflow.precisionAtK.k1;
          data['K=5'] = workflow.precisionAtK.k5;
          data['K=10'] = workflow.precisionAtK.k10;
        } else if (metricType === 'recall') {
          data['K=1'] = workflow.recallAtK.k1;
          data['K=5'] = workflow.recallAtK.k5;
          data['K=10'] = workflow.recallAtK.k10;
        } else if (metricType === 'ndcg') {
          data['K=1'] = workflow.ndcg.k1;
          data['K=5'] = workflow.ndcg.k5;
          data['K=10'] = workflow.ndcg.k10;
        }

        return data;
      });
    } else {
      // For single-value metrics (F1, MAP)
      return workflows.map((workflow) => ({
        workflow: workflow.workflowName,
        value: metricType === 'f1' ? workflow.f1Score : workflow.map,
      }));
    }
  }, [workflows, metricType]);

  const chartConfig: ChartConfig = useMemo(() => {
    if (metricType === 'precision' || metricType === 'recall' || metricType === 'ndcg') {
      return {
        'K=1': {
          label: 'K=1',
          color: 'hsl(var(--chart-1))',
        },
        'K=5': {
          label: 'K=5',
          color: 'hsl(var(--chart-2))',
        },
        'K=10': {
          label: 'K=10',
          color: 'hsl(var(--chart-3))',
        },
      } as ChartConfig;
    } else {
      return {
        value: {
          label: metricType === 'f1' ? 'F1 Score' : 'MAP',
          color: 'hsl(var(--chart-1))',
        },
      };
    }
  }, [metricType]);

  const getBestWorkflow = () => {
    if (metricType === 'f1') {
      const best = workflows.reduce((prev, curr) =>
        curr.f1Score > prev.f1Score ? curr : prev
      );
      return best;
    } else if (metricType === 'map') {
      const best = workflows.reduce((prev, curr) =>
        curr.map > prev.map ? curr : prev
      );
      return best;
    } else {
      // For K-based metrics, use mean across K values
      const best = workflows.reduce((prev, curr) => {
        let prevMean = 0;
        let currMean = 0;

        if (metricType === 'precision') {
          prevMean = (prev.precisionAtK.k1 + prev.precisionAtK.k5 + prev.precisionAtK.k10) / 3;
          currMean = (curr.precisionAtK.k1 + curr.precisionAtK.k5 + curr.precisionAtK.k10) / 3;
        } else if (metricType === 'recall') {
          prevMean = (prev.recallAtK.k1 + prev.recallAtK.k5 + prev.recallAtK.k10) / 3;
          currMean = (curr.recallAtK.k1 + curr.recallAtK.k5 + curr.recallAtK.k10) / 3;
        } else if (metricType === 'ndcg') {
          prevMean = prev.ndcg.mean_ndcg || (prev.ndcg.k1 + prev.ndcg.k5 + prev.ndcg.k10) / 3;
          currMean = curr.ndcg.mean_ndcg || (curr.ndcg.k1 + curr.ndcg.k5 + curr.ndcg.k10) / 3;
        }

        return currMean > prevMean ? curr : prev;
      });
      return best;
    }
  };

  const bestWorkflow = getBestWorkflow();
  const metricLabel =
    metricType === 'precision'
      ? 'Precision@K'
      : metricType === 'recall'
        ? 'Recall@K'
        : metricType === 'ndcg'
          ? 'NDCG@K'
          : metricType === 'f1'
            ? 'F1 Score'
            : 'MAP';

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>{metricLabel} Comparison</span>
          {bestWorkflow && (
            <Badge variant="outline" className="ml-2">
              Best: {bestWorkflow.workflowName}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Side-by-side comparison of {metricLabel.toLowerCase()} across {workflows.length} workflow
          {workflows.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          {metricType === 'precision' || metricType === 'recall' || metricType === 'ndcg' ? (
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="workflow"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => value.toFixed(2)}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <ChartTooltipContent
                      active={active}
                      payload={payload as any}
                      formatter={(value) => [
                        typeof value === 'number' ? value.toFixed(4) : String(value),
                        '',
                      ]}
                    />
                  );
                }}
              />
              <Legend />
              <Bar dataKey="K=1" name="K=1" fill="var(--color-K=1)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="K=5" name="K=5" fill="var(--color-K=5)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="K=10" name="K=10" fill="var(--color-K=10)" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <BarChart
              data={chartData}
              margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
            >
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="workflow"
                angle={-45}
                textAnchor="end"
                height={80}
                tick={{ fontSize: 11 }}
              />
              <YAxis
                domain={[0, 1]}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => value.toFixed(2)}
              />
              <ChartTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  return (
                    <ChartTooltipContent
                      active={active}
                      payload={payload as any}
                      formatter={(value) => [
                        typeof value === 'number' ? value.toFixed(4) : String(value),
                        metricLabel,
                      ]}
                    />
                  );
                }}
              />
              <Legend />
              <Bar
                dataKey="value"
                name={metricLabel}
                fill="var(--color-value)"
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

