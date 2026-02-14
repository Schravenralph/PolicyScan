/**
 * FeatureFlagDialogs Component
 * 
 * Consolidates all dialogs used in FeatureFlagsPage.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */

import { RefreshCw, Save, Play } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import type { FeatureFlagTemplate } from '../../types/featureFlags.js';
import { t } from '../../utils/i18n';

export interface FeatureFlagDialogsProps {
  // Save Template Dialog
  showSaveTemplateDialog: boolean;
  onSaveTemplateDialogChange: (open: boolean) => void;
  newTemplateName: string;
  onNewTemplateNameChange: (name: string) => void;
  newTemplateDescription: string;
  onNewTemplateDescriptionChange: (description: string) => void;
  newTemplateIsPublic: boolean;
  onNewTemplateIsPublicChange: (isPublic: boolean) => void;
  savingTemplate: boolean;
  onSaveTemplate: () => void;
  
  // Template Preview Dialog
  showTemplatePreview: string | null;
  onTemplatePreviewChange: (templateId: string | null) => void;
  templates: FeatureFlagTemplate[];
  getTemplateDifferences: (templateFlags: Record<string, boolean>) => Array<{ flag: string; current: boolean; template: boolean }>;
  applyingTemplate: string | null;
  onApplyTemplate: (templateId: string, templateName: string) => void;
  
  // Cancel Draft Dialog
  showCancelDraftDialog: boolean;
  onCancelDraftDialogChange: (open: boolean) => void;
  pendingChangesCount: number;
  onConfirmCancelDraft: () => void;
  
  // Delete Template Dialog
  showDeleteTemplateDialog: boolean;
  onDeleteTemplateDialogChange: (open: boolean) => void;
  templateToDelete: { id: string; name: string } | null;
  onConfirmDeleteTemplate: () => void;
}

/**
 * Consolidated dialogs component for Feature Flags page
 */
export function FeatureFlagDialogs({
  showSaveTemplateDialog,
  onSaveTemplateDialogChange,
  newTemplateName,
  onNewTemplateNameChange,
  newTemplateDescription,
  onNewTemplateDescriptionChange,
  newTemplateIsPublic,
  onNewTemplateIsPublicChange,
  savingTemplate,
  onSaveTemplate,
  showTemplatePreview,
  onTemplatePreviewChange,
  templates,
  getTemplateDifferences,
  applyingTemplate,
  onApplyTemplate,
  showCancelDraftDialog,
  onCancelDraftDialogChange,
  pendingChangesCount,
  onConfirmCancelDraft,
  showDeleteTemplateDialog,
  onDeleteTemplateDialogChange,
  templateToDelete,
  onConfirmDeleteTemplate,
}: FeatureFlagDialogsProps) {
  const template = showTemplatePreview ? templates.find(t => (t._id || t.name) === showTemplatePreview) : null;
  const differences = template ? getTemplateDifferences(template.flags) : [];

  return (
    <>
      {/* Save Template Dialog */}
      <Dialog open={showSaveTemplateDialog} onOpenChange={onSaveTemplateDialogChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('featureFlags.saveCurrentAsTemplate')}</DialogTitle>
            <DialogDescription>
              {t('featureFlags.saveCurrentAsTemplateDesc')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">{t('featureFlags.templateName')}</Label>
              <Input
                id="template-name"
                value={newTemplateName}
                onChange={(e) => onNewTemplateNameChange(e.target.value)}
                placeholder={t('featureFlags.templateNamePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="template-description">{t('featureFlags.templateDescription')}</Label>
              <Textarea
                id="template-description"
                value={newTemplateDescription}
                onChange={(e) => onNewTemplateDescriptionChange(e.target.value)}
                placeholder={t('featureFlags.templateDescriptionPlaceholder')}
                rows={3}
              />
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="template-public"
                checked={newTemplateIsPublic}
                onCheckedChange={onNewTemplateIsPublicChange}
              />
              <Label htmlFor="template-public" className="cursor-pointer">
                {t('featureFlags.makeTemplatePublic')}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                onSaveTemplateDialogChange(false);
                onNewTemplateNameChange('');
                onNewTemplateDescriptionChange('');
                onNewTemplateIsPublicChange(false);
              }}
            >
              {t('featureFlags.cancel')}
            </Button>
            <Button
              onClick={onSaveTemplate}
              disabled={savingTemplate || !newTemplateName.trim()}
            >
              {savingTemplate ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  {t('featureFlags.saving')}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t('featureFlags.saveTemplate')}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Template Preview Dialog */}
      {template && (
        <Dialog open={!!showTemplatePreview} onOpenChange={() => onTemplatePreviewChange(null)}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{t('featureFlags.templatePreview')} {template.name}</DialogTitle>
              <DialogDescription>
                {template.description || t('featureFlags.previewOfTemplate')}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              {differences.length > 0 ? (
                <>
                  <div>
                    <h4 className="font-semibold mb-2">
                      {t('featureFlags.changes')} ({differences.length} {differences.length !== 1 ? t('featureFlags.flagsPlural') : t('featureFlags.flag')})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {differences.map((diff) => (
                        <div
                          key={diff.flag}
                          className="flex items-center justify-between p-2 rounded-md border bg-background"
                        >
                          <code className="text-sm font-mono">{diff.flag}</code>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm ${diff.current ? 'text-green-600' : 'text-gray-400'}`}>
                              {diff.current ? t('featureFlags.enabled') : t('featureFlags.disabled')}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className={`text-sm font-semibold ${diff.template ? 'text-green-600' : 'text-gray-400'}`}>
                              {diff.template ? t('featureFlags.enabled') : t('featureFlags.disabled')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p>{t('featureFlags.templateMatchesCurrent')}</p>
                  <p className="text-sm mt-2">{t('featureFlags.noChangesIfApplied')}</p>
                </div>
              )}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>{t('featureFlags.created')} {new Date(template.createdAt).toLocaleString()}</p>
                <p>{t('featureFlags.lastUpdated')} {new Date(template.updatedAt).toLocaleString()}</p>
                <p>{t('featureFlags.createdBy')} {template.createdBy}</p>
                <p>{t('featureFlags.usageCount')} {template.usageCount}</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onTemplatePreviewChange(null)}>
                {t('featureFlags.close')}
              </Button>
              {template._id && (
                <Button
                  onClick={() => {
                    onApplyTemplate(template._id!, template.name);
                    onTemplatePreviewChange(null);
                  }}
                  disabled={applyingTemplate === template._id}
                >
                  {applyingTemplate === template._id ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      {t('featureFlags.applying')}
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      {t('featureFlags.applyTemplate')}
                    </>
                  )}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Cancel Draft Mode Confirmation Dialog */}
      <AlertDialog open={showCancelDraftDialog} onOpenChange={onCancelDraftDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('featureFlags.discardChanges')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('featureFlags.pendingChangesWillBeLost').replace('{{count}}', String(pendingChangesCount))}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('featureFlags.keepEditing')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmCancelDraft}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('featureFlags.discardChangesAction')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Template Confirmation Dialog */}
      <AlertDialog open={showDeleteTemplateDialog} onOpenChange={onDeleteTemplateDialogChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('featureFlags.deleteTemplate')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('featureFlags.confirmDeleteTemplate').replace('{{name}}', templateToDelete?.name || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => onDeleteTemplateDialogChange(false)}>{t('featureFlags.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={onConfirmDeleteTemplate}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('featureFlags.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

