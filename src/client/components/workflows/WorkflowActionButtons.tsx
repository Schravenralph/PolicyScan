/**
 * Workflow Action Buttons Component
 * 
 * Cancel and submit buttons for workflow form.
 */

import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

interface WorkflowActionButtonsProps {
  onCancel: () => void;
  isEditing?: boolean;
}

export function WorkflowActionButtons({
  onCancel,
  isEditing = false,
}: WorkflowActionButtonsProps) {
  return (
    <div className="flex justify-end gap-3 pt-4 border-t">
      <Button type="button" variant="outline" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button type="submit">
        {isEditing ? t('workflowManagement.editWorkflow') : t('workflowManagement.createWorkflow')}
      </Button>
    </div>
  );
}
