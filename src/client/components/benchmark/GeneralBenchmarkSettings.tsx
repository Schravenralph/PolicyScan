/**
 * General Benchmark Settings Component
 * 
 * Form for configuring general benchmark execution settings.
 */

import { Settings } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface GeneralBenchmarkSettingsProps {
  settings: {
    runsPerWorkflow?: number;
    executionMode?: 'sequential' | 'parallel';
    maxConcurrent?: number;
    timeout?: number;
    maxWorkflowTemplates?: number;
  };
  onSettingsChange: (settings: GeneralBenchmarkSettingsProps['settings']) => void;
}

export function GeneralBenchmarkSettings({ settings, onSettingsChange }: GeneralBenchmarkSettingsProps) {
  return (
    <Card className="mb-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5" />
          General Benchmark Settings
        </CardTitle>
        <CardDescription>
          Configure general settings for benchmark execution. These settings apply to all benchmark runs.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="runs-per-workflow">Runs Per Workflow</Label>
            <Input
              id="runs-per-workflow"
              type="number"
              min="1"
              max="100"
              value={settings.runsPerWorkflow || 1}
              onChange={(e) => onSettingsChange({
                ...settings,
                runsPerWorkflow: parseInt(e.target.value) || 1
              })}
            />
            <p className="text-xs text-muted-foreground">
              Number of times to run each workflow/query combination (default: 1)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="execution-mode">Execution Mode</Label>
            <Select
              value={settings.executionMode || 'sequential'}
              onValueChange={(value) => onSettingsChange({
                ...settings,
                executionMode: value as 'sequential' | 'parallel'
              })}
            >
              <SelectTrigger id="execution-mode">
                <SelectValue placeholder="Select execution mode" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sequential">Sequential</SelectItem>
                <SelectItem value="parallel">Parallel</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Run workflows sequentially or in parallel (default: sequential)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-concurrent">Max Concurrent (Parallel Mode)</Label>
            <Input
              id="max-concurrent"
              type="number"
              min="1"
              max="20"
              value={settings.maxConcurrent || 5}
              onChange={(e) => onSettingsChange({
                ...settings,
                maxConcurrent: parseInt(e.target.value) || 5
              })}
              disabled={settings.executionMode !== 'parallel'}
            />
            <p className="text-xs text-muted-foreground">
              Maximum concurrent workflows for parallel mode (default: 5, max: 20)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="timeout">Timeout (minutes)</Label>
            <Input
              id="timeout"
              type="number"
              min="1"
              max="120"
              value={settings.timeout ? Math.round(settings.timeout / 60000) : 30}
              onChange={(e) => onSettingsChange({
                ...settings,
                timeout: (parseInt(e.target.value) || 30) * 60 * 1000
              })}
            />
            <p className="text-xs text-muted-foreground">
              Timeout for workflow execution in minutes (default: 30)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="max-workflow-templates">Max Workflow Templates</Label>
            <Input
              id="max-workflow-templates"
              type="number"
              min="1"
              max="100"
              value={settings.maxWorkflowTemplates || ''}
              onChange={(e) => onSettingsChange({
                ...settings,
                maxWorkflowTemplates: e.target.value ? parseInt(e.target.value) : undefined
              })}
              placeholder="All"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of workflow templates to test (leave empty for all)
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
