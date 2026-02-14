/**
 * Workflow Steps Section Component
 * 
 * Displays the list of steps in a workflow.
 */

import { FileText } from 'lucide-react';
import { Badge } from '../ui/badge';
import { t } from '../../utils/i18n';

interface WorkflowStep {
  id: string;
  name: string;
  action?: string;
  next?: string;
}

interface WorkflowStepsSectionProps {
  steps: WorkflowStep[];
}

export function WorkflowStepsSection({ steps }: WorkflowStepsSectionProps) {
  return (
    <div className="p-4 border rounded-lg dark:bg-gray-900 dark:border-gray-700">
      <h4 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <FileText className="w-5 h-5" />
        {t('workflowSteps.title')} ({steps.length})
      </h4>
      <div className="space-y-2">
        {steps.map((step, index) => (
          <div key={step.id} className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded">
            <span className="text-sm font-medium text-gray-500 dark:text-gray-400 w-8">
              {index + 1}.
            </span>
            <div className="flex-1">
              <div className="font-medium text-gray-900 dark:text-white">{step.name}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('workflowSteps.action')} {step.action}</div>
            </div>
            {step.next && (
              <Badge variant="outline" className="text-xs">
                → {step.next}
              </Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
