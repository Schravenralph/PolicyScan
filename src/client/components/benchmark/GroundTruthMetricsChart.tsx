import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Download, BarChart3 } from 'lucide-react';
import { PrecisionRecallChart } from './PrecisionRecallChart';
import { NDCGChart } from './NDCGChart';
import { MetricsComparisonChart } from './MetricsComparisonChart';

interface GroundTruthEvaluationMetrics {
  precision_at_k: {
    k1: number;
    k5: number;
    k10: number;
  };
  recall_at_k: {
    k1: number;
    k5: number;
    k10: number;
  };
  f1_score: number;
  ndcg: {
    ndcg_at_k: {
      k1: number;
      k5: number;
      k10: number;
    };
    mean_ndcg: number;
  };
  map: number;
}

interface GroundTruthMetricsChartProps {
  metrics: GroundTruthEvaluationMetrics;
  workflowName?: string;
  className?: string;
  onExport?: (format: 'png' | 'svg') => void;
}

/**
 * Ground Truth Metrics Chart Component
 * 
 * Main component that combines all visualization charts for ground truth evaluation metrics.
 * Includes precision/recall curve, NDCG chart, and export functionality.
 * 
 * @component
 */
export function GroundTruthMetricsChart({
  metrics,
  workflowName,
  className,
  onExport,
}: GroundTruthMetricsChartProps) {
  const [activeTab, setActiveTab] = useState<'precision-recall' | 'ndcg'>('precision-recall');

  const handleExport = (format: 'png' | 'svg') => {
    if (onExport) {
      onExport(format);
    } else {
      // Default export behavior - could trigger download
      console.log(`Exporting chart as ${format}`);
    }
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Metrics Visualisatie
            </CardTitle>
            <CardDescription>
              Interactieve visualisaties van evaluatie metrics
              {workflowName && ` - ${workflowName}`}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('png')}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              PNG
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleExport('svg')}
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              SVG
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="precision-recall">Precision/Recall</TabsTrigger>
            <TabsTrigger value="ndcg">NDCG</TabsTrigger>
          </TabsList>
          <TabsContent value="precision-recall" className="mt-4">
            <PrecisionRecallChart
              precisionAtK={metrics.precision_at_k}
              recallAtK={metrics.recall_at_k}
              workflowName={workflowName}
            />
          </TabsContent>
          <TabsContent value="ndcg" className="mt-4">
            <NDCGChart
              ndcgData={{
                k1: metrics.ndcg.ndcg_at_k.k1,
                k5: metrics.ndcg.ndcg_at_k.k5,
                k10: metrics.ndcg.ndcg_at_k.k10,
                mean_ndcg: metrics.ndcg.mean_ndcg,
              }}
              workflowName={workflowName}
            />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/**
 * Export function for comparing multiple workflows
 */
export function GroundTruthMetricsComparison({
  workflows,
  className,
}: {
  workflows: Array<{
    workflowId: string;
    workflowName: string;
    metrics: GroundTruthEvaluationMetrics;
  }>;
  className?: string;
}) {
  const [activeMetric, setActiveMetric] = useState<'precision' | 'recall' | 'ndcg' | 'f1' | 'map'>(
    'precision'
  );

  const workflowMetrics = workflows.map((w) => ({
    workflowId: w.workflowId,
    workflowName: w.workflowName,
    precisionAtK: w.metrics.precision_at_k,
    recallAtK: w.metrics.recall_at_k,
    f1Score: w.metrics.f1_score,
    map: w.metrics.map,
    ndcg: {
      k1: w.metrics.ndcg.ndcg_at_k.k1,
      k5: w.metrics.ndcg.ndcg_at_k.k5,
      k10: w.metrics.ndcg.ndcg_at_k.k10,
      mean_ndcg: w.metrics.ndcg.mean_ndcg,
    },
  }));

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Workflow Vergelijking</CardTitle>
        <CardDescription>
          Vergelijk metrics across {workflows.length} workflow{workflows.length !== 1 ? 's' : ''}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeMetric} onValueChange={(v) => setActiveMetric(v as typeof activeMetric)}>
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="precision">Precision</TabsTrigger>
            <TabsTrigger value="recall">Recall</TabsTrigger>
            <TabsTrigger value="ndcg">NDCG</TabsTrigger>
            <TabsTrigger value="f1">F1</TabsTrigger>
            <TabsTrigger value="map">MAP</TabsTrigger>
          </TabsList>
          <TabsContent value={activeMetric} className="mt-4">
            <MetricsComparisonChart workflows={workflowMetrics} metricType={activeMetric} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

