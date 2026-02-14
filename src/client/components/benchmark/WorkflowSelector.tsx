import { useState, useMemo } from 'react';
import { Checkbox } from '../ui/checkbox';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Search, X } from 'lucide-react';
import { Button } from '../ui/button';
import { toast } from '../../utils/toast';
import { useWorkflows } from '../../context/WorkflowContext';
import { t } from '../../utils/i18n';

export interface WorkflowSelectorProps {
  selectedWorkflows: string[];
  onSelectionChange: (workflowIds: string[]) => void;
  maxSelection?: number; // Default: 2
  minSelection?: number; // Default: 2
  label?: string;
  description?: string;
}

export function WorkflowSelector({
  selectedWorkflows,
  onSelectionChange,
  maxSelection = 2,
  minSelection = 2,
  label = 'Select Workflows',
  description,
}: WorkflowSelectorProps) {
  const { workflows, isLoading } = useWorkflows();
  const [searchQuery, setSearchQuery] = useState('');

  const filteredWorkflows = useMemo(() => {
    if (!searchQuery.trim()) {
      return workflows;
    }
    const query = searchQuery.toLowerCase();
    return workflows.filter(
      (workflow) =>
        workflow.name.toLowerCase().includes(query) ||
        workflow.id.toLowerCase().includes(query) ||
        workflow.description?.toLowerCase().includes(query)
    );
  }, [workflows, searchQuery]);

  const handleToggleWorkflow = (workflowId: string) => {
    const isSelected = selectedWorkflows.includes(workflowId);
    let newSelection: string[];

    if (isSelected) {
      // Remove workflow
      newSelection = selectedWorkflows.filter((id) => id !== workflowId);
    } else {
      // Add workflow (respect maxSelection)
      if (selectedWorkflows.length >= maxSelection) {
        toast.error(t('workflowSelector.maxReached'), t('workflowSelector.maxReachedMessage').replace('{{max}}', String(maxSelection)));
        return;
      }
      newSelection = [...selectedWorkflows, workflowId];
    }

    onSelectionChange(newSelection);
  };

  const handleRemoveWorkflow = (workflowId: string) => {
    const newSelection = selectedWorkflows.filter((id) => id !== workflowId);
    onSelectionChange(newSelection);
  };

  const selectedWorkflowObjects = useMemo(() => {
    return workflows.filter((w) => selectedWorkflows.includes(w.id));
  }, [workflows, selectedWorkflows]);

  const isValid = selectedWorkflows.length >= minSelection && selectedWorkflows.length <= maxSelection;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {!isValid && selectedWorkflows.length > 0 && (
          <p className="text-sm text-amber-600 dark:text-amber-400">
            {t('workflowSelector.selectMinMax').replace('{{min}}', String(minSelection)).replace('{{max}}', String(maxSelection))}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
          <Input
            type="text"
            placeholder={t('workflowSelector.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Selected workflows */}
        {selectedWorkflowObjects.length > 0 && (
          <div className="space-y-2">
            <Label>{t('workflowSelector.selectedWorkflows')} ({selectedWorkflowObjects.length}/{maxSelection})</Label>
            <div className="flex flex-wrap gap-2">
              {selectedWorkflowObjects.map((workflow) => (
                <Badge key={workflow.id} variant="secondary" className="flex items-center gap-2 px-3 py-1">
                  <span>{workflow.name}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                    onClick={() => handleRemoveWorkflow(workflow.id)}
                    aria-label={t('workflowSelector.removeWorkflow').replace('{{name}}', workflow.name)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Workflow list */}
        <div className="space-y-2">
          <Label>{t('workflowSelector.availableWorkflows')}</Label>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">{t('workflowSelector.loadingWorkflows')}</p>
          ) : filteredWorkflows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {searchQuery ? t('workflowSelector.noWorkflowsFound') : t('workflowSelector.noWorkflowsAvailable')}
            </p>
          ) : (
            <div className="border rounded-md max-h-60 overflow-y-auto">
              {filteredWorkflows.map((workflow) => {
                const isSelected = selectedWorkflows.includes(workflow.id);
                const isDisabled = !isSelected && selectedWorkflows.length >= maxSelection;

                return (
                  <div
                    key={workflow.id}
                    className={`flex items-center gap-3 px-4 py-2 hover:bg-accent cursor-pointer ${
                      isDisabled ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                    onClick={() => !isDisabled && handleToggleWorkflow(workflow.id)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isDisabled}
                      onCheckedChange={() => !isDisabled && handleToggleWorkflow(workflow.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{workflow.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{workflow.id}</p>
                      {workflow.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{workflow.description}</p>
                      )}
                    </div>
                    <Badge variant="outline" className="shrink-0">
                      {workflow.status}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

