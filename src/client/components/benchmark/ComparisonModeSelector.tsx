import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { GitCompare, FileText } from 'lucide-react';

export type ComparisonMode = 'workflow-vs-workflow' | 'workflow-vs-ground-truth';

export interface ComparisonModeSelectorProps {
  mode: ComparisonMode;
  onModeChange: (mode: ComparisonMode) => void;
}

/**
 * ComparisonModeSelector Component
 * 
 * Allows users to switch between different comparison modes:
 * - Workflow vs Workflow (existing)
 * - Workflow vs Ground Truth (new)
 * 
 * @component
 */
export function ComparisonModeSelector({
  mode,
  onModeChange,
}: ComparisonModeSelectorProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex gap-2">
          <Button
            variant={mode === 'workflow-vs-workflow' ? 'default' : 'outline'}
            onClick={() => onModeChange('workflow-vs-workflow')}
            className="flex-1 gap-2"
          >
            <GitCompare className="w-4 h-4" />
            Workflow vs Workflow
          </Button>
          <Button
            variant={mode === 'workflow-vs-ground-truth' ? 'default' : 'outline'}
            onClick={() => onModeChange('workflow-vs-ground-truth')}
            className="flex-1 gap-2"
          >
            <FileText className="w-4 h-4" />
            Workflow vs Ground Truth
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

