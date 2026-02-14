import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '../ui/chart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface NDCGChartProps {
  ndcgData: {
    k1: number;
    k5: number;
    k10: number;
    mean_ndcg?: number;
  };
  workflowName?: string;
  className?: string;
}

/**
 * NDCG@K Bar Chart Component
 * 
 * Displays NDCG scores at different K values (1, 5, 10) as a bar chart.
 * 
 * @component
 */
export function NDCGChart({ ndcgData, workflowName, className }: NDCGChartProps) {
  const chartData = [
    {
      k: 'K=1',
      value: ndcgData.k1,
      label: 'NDCG@1',
    },
    {
      k: 'K=5',
      value: ndcgData.k5,
      label: 'NDCG@5',
    },
    {
      k: 'K=10',
      value: ndcgData.k10,
      label: 'NDCG@10',
    },
  ];

  const chartConfig: ChartConfig = {
    ndcg: {
      label: 'NDCG Score',
      color: 'hsl(var(--chart-1))',
    },
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>NDCG@K Scores</CardTitle>
        <CardDescription>
          Normalized Discounted Cumulative Gain at different K values
          {workflowName && ` - ${workflowName}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[300px]">
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="k"
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
                const data = payload[0];
                return (
                  <ChartTooltipContent
                    active={active}
                      payload={payload as any}
                    label={data.payload?.label || data.name}
                    formatter={(value) => [
                      typeof value === 'number' ? value.toFixed(4) : String(value),
                      'NDCG',
                    ]}
                  />
                );
              }}
            />
            <Legend />
            <Bar
              dataKey="value"
              name="NDCG Score"
              fill="var(--color-ndcg)"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
        {ndcgData.mean_ndcg !== undefined && (
          <div className="mt-4 text-sm text-muted-foreground">
            <p>Mean NDCG: <span className="font-semibold">{ndcgData.mean_ndcg.toFixed(4)}</span></p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

