import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { toast } from '../../utils/toast';
import type { FilterPreset } from '../../hooks/useFilterPresets';
import { t } from '../../utils/i18n';

export interface FilterPresetDialogProps {
  isOpen: boolean;
  onClose: () => void;
  presetName: string;
  onPresetNameChange: (name: string) => void;
  currentFilters: {
    documentFilter: 'all' | 'pending' | 'approved' | 'rejected';
    documentTypeFilter: string | null;
    documentDateFilter: 'all' | 'week' | 'month' | 'year';
    documentWebsiteFilter: string | null;
    documentSearchQuery: string;
  };
  onSave: (preset: Omit<FilterPreset, 'id'>) => FilterPreset;
}

/**
 * Dialog component for saving document filter presets.
 * 
 * Allows users to save their current filter configuration as a named preset
 * for quick access later.
 * 
 * @example
 * ```tsx
 * <FilterPresetDialog
 *   isOpen={showPresetDialog}
 *   onClose={() => setShowPresetDialog(false)}
 *   presetName={presetName}
 *   onPresetNameChange={setPresetName}
 *   currentFilters={{
 *     documentFilter,
 *     documentTypeFilter,
 *     documentDateFilter,
 *     documentWebsiteFilter,
 *     documentSearchQuery
 *   }}
 *   onSave={saveFilterPreset}
 * />
 * ```
 */
export const FilterPresetDialog: React.FC<FilterPresetDialogProps> = ({
  isOpen,
  onClose,
  presetName,
  onPresetNameChange,
  currentFilters,
  onSave
}) => {
  const handleSave = () => {
    if (!presetName.trim()) {
      toast.error(t('filterPresetDialog.nameRequired'), t('filterPresetDialog.nameRequiredDescription'));
      return;
    }

    const newPreset = onSave({
      name: presetName.trim(),
      filters: currentFilters
    });

    onClose();
    onPresetNameChange('');
    toast.success(t('filterPresetDialog.presetSaved'), t('filterPresetDialog.presetSavedDescription').replace('{{name}}', newPreset.name));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && presetName.trim()) {
      handleSave();
    }
  };

  const handleClose = () => {
    onClose();
    onPresetNameChange('');
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif font-semibold text-foreground">
            {t('filterPresetDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {t('filterPresetDialog.description')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4">
          <div>
            <Label htmlFor="preset-name" className="text-foreground">
              {t('filterPresetDialog.nameLabel')}
            </Label>
            <Input
              id="preset-name"
              value={presetName}
              onChange={(e) => onPresetNameChange(e.target.value)}
              placeholder={t('filterPresetDialog.namePlaceholder')}
              className="mt-2"
              onKeyDown={handleKeyDown}
            />
          </div>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleClose}
              className="border-border text-foreground hover:bg-muted"
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSave}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
              disabled={!presetName.trim()}
            >
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

