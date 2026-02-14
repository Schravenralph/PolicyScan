/**
 * Save Template Dialog Component
 * 
 * Dialog for saving benchmark configuration templates
 * with name, description, and benchmark type selection.
 */

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Save } from 'lucide-react';

interface BenchmarkType {
  id: string;
  name: string;
  description: string;
}

interface SaveTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateName: string;
  onTemplateNameChange: (name: string) => void;
  templateDescription: string;
  onTemplateDescriptionChange: (description: string) => void;
  templateTypes: string[];
  onTemplateTypesChange: (types: string[]) => void;
  availableBenchmarkTypes: BenchmarkType[];
  onSave: () => void;
  onCancel: () => void;
}

export function SaveTemplateDialog({
  open,
  onOpenChange,
  templateName,
  onTemplateNameChange,
  templateDescription,
  onTemplateDescriptionChange,
  templateTypes,
  onTemplateTypesChange,
  availableBenchmarkTypes,
  onSave,
  onCancel,
}: SaveTemplateDialogProps) {
  const handleTypeToggle = (typeId: string) => {
    if (templateTypes.includes(typeId)) {
      onTemplateTypesChange(templateTypes.filter(id => id !== typeId));
    } else {
      onTemplateTypesChange([...templateTypes, typeId]);
    }
  };

  const canSave = templateName.trim().length > 0 && templateTypes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Benchmark Configuration Template</DialogTitle>
          <DialogDescription>
            Create a reusable benchmark configuration template
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="template-name">Template Name *</Label>
            <Input
              id="template-name"
              placeholder="e.g., Settings Comparison - Jan 2025"
              value={templateName}
              onChange={(e) => onTemplateNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="template-description">Description (Optional)</Label>
            <Textarea
              id="template-description"
              placeholder="Describe what this template is used for..."
              value={templateDescription}
              onChange={(e) => onTemplateDescriptionChange(e.target.value)}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Benchmark Types *</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {availableBenchmarkTypes.map((type) => (
                <div
                  key={type.id}
                  className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${
                    templateTypes.includes(type.id)
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-200'
                  }`}
                  onClick={() => handleTypeToggle(type.id)}
                >
                  <input
                    type="checkbox"
                    checked={templateTypes.includes(type.id)}
                    onChange={() => handleTypeToggle(type.id)}
                    className="rounded"
                  />
                  <div>
                    <div className="font-medium text-sm">{type.name}</div>
                    <div className="text-xs text-muted-foreground">{type.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!canSave}>
            <Save className="w-4 h-4 mr-2" />
            Save Template
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
