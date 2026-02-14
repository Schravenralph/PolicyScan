/**
 * Dataset Info Form Component
 * 
 * Name and description inputs for dataset (shared between manual and canonical modes).
 */

import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';

interface DatasetInfoFormProps {
  name: string;
  description: string;
  onNameChange: (name: string) => void;
  onDescriptionChange: (description: string) => void;
  nameId?: string;
  descriptionId?: string;
  disabled?: boolean;
}

export function DatasetInfoForm({
  name,
  description,
  onNameChange,
  onDescriptionChange,
  nameId = 'name',
  descriptionId = 'description',
  disabled = false,
}: DatasetInfoFormProps) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={nameId}>Naam *</Label>
        <Input
          id={nameId}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Bijv. Policy Queries Ground Truth"
          disabled={disabled}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor={descriptionId}>Beschrijving</Label>
        <Textarea
          id={descriptionId}
          value={description}
          onChange={(e) => onDescriptionChange(e.target.value)}
          placeholder="Optionele beschrijving van het dataset"
          rows={3}
          disabled={disabled}
        />
      </div>
    </>
  );
}
