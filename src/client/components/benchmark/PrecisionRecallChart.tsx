import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface PrecisionRecallChartProps {
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
  workflowName?: string;
  className?: string;
}

/**
 * Precision/Recall Curve Chart Component
 * 
 * Displays precision and recall at different K values (1, 5, 10) as a line chart.
 * Shows both precision and recall curves for comparison.
 * 
 * @component
 */
export function PrecisionRecallChart({
  precisionAtK,
  recallAtK,
  workflowName,
  className,
}: PrecisionRecallChartProps) {
  const chartData = useMemo(() => {
    return [
      {
        k: 1,
        precision: precisionAtK.k1,
        recall: recallAtK.k1,
        label: 'K=1',
      },
      {
        k: 5,
        precision: precisionAtK.k5,
        recall: recallAtK.k5,
        label: 'K=5',
      },
      {
        k: 10,
        precision: precisionAtK.k10,
        recall: recallAtK.k10,
        label: 'K=10',
      },
    ];
  }, [precisionAtK, recallAtK]);

  const chartConfig: ChartConfig = {
    precision: {
      label: 'Precision',
      color: 'hsl(var(--chart-1))',
    },
    recall: {
      label: 'Recall',
      color: 'hsl(var(--chart-2))',
    },
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Precision/Recall Curve</CardTitle>
        <CardDescription>
          Precision and Recall at different K values
          {workflowName && ` - ${workflowName}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          <LineChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12 }}
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
                    formatter={(value, name) => [
                      typeof value === 'number' ? value.toFixed(4) : String(value),
                      name === 'precision' ? 'Precision' : 'Recall',
                    ]}
                  />
                );
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="precision"
              name="Precision"
              stroke="var(--color-precision)"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
            <Line
              type="monotone"
              dataKey="recall"
              name="Recall"
              stroke="var(--color-recall)"
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

