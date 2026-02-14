/**
 * Workflow Info Form Component
 * 
 * Basic form fields for workflow ID, name, and description.
 */

import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { t } from '../../utils/i18n';

interface WorkflowInfoFormProps {
  id: string;
  name: string;
  description: string;
  onIdChange: (id: string) => void;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  isEditing?: boolean;
}

export function WorkflowInfoForm({
  id,
  name,
  description,
  onIdChange,
  onNameChange,
  onDescriptionChange,
  isEditing = false,
}: WorkflowInfoFormProps) {
  return (
    <>
      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('workflow.workflowId')} <span className="text-red-500">*</span>
        </Label>
        <Input
          type="text"
          value={id}
          onChange={(e) => onIdChange(e.target.value)}
          placeholder={t('workflow.workflowIdPlaceholder')}
          required
          disabled={isEditing}
        />
        <p className="text-xs text-gray-500 mt-1">{t('workflow.uniqueIdentifier')}</p>
      </div>

      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('workflow.workflowName')} <span className="text-red-500">*</span>
        </Label>
        <Input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('workflow.workflowNamePlaceholder')}
          required
        />
      </div>

      <div>
        <Label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('workflow.description')}
        </Label>
        <textarea
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          className="w-full px-3 py-2 border rounded-lg bg-background border-input"
          placeholder={t('workflow.describeWorkflow')}
          rows={3}
        />
      </div>
    </>
  );
}
