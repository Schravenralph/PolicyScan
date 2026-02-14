import { useState, useEffect } from 'react';
import { api } from '../services/api';
import type { ExportTemplate, ExportFormat, ExportTemplateCreateInput } from '../services/api';
import { toast } from '../utils/toast';
import { t } from '../utils/i18n';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { Plus, Edit, Trash2, Eye, FileText, Filter } from 'lucide-react';
import { Switch } from '../components/ui/switch';
import { logError } from '../utils/errorHandler';

const EXPORT_FORMATS: ExportFormat[] = ['csv', 'json', 'markdown', 'tsv', 'html', 'xml', 'pdf', 'xlsx'];

export function ExportTemplatesPage() {
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | 'all'>('all');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [_selectedTemplate, _setSelectedTemplate] = useState<ExportTemplate | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<ExportTemplate | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ExportTemplate | null>(null);
  const [deletingTemplate, setDeletingTemplate] = useState<ExportTemplate | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [formData, setFormData] = useState<ExportTemplateCreateInput>({
    name: '',
    description: '',
    format: 'csv',
    template: '',
    variables: [],
    isPublic: false,
    isDefault: false,
  });

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const allTemplates = await api.exportTemplate.getTemplates({ public: true });
      setTemplates(allTemplates);
    } catch (error) {
      console.error('Error loading templates:', error);
      logError(error, 'load-export-templates');
      toast.error(t('templates.failedToLoad'), t('templates.tryAgainLater'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const filteredTemplates = selectedFormat === 'all'
    ? templates
    : templates.filter(t => t.format === selectedFormat);

  const handleCreate = () => {
    setFormData({
      name: '',
      description: '',
      format: 'csv',
      template: '',
      variables: [],
      isPublic: false,
      isDefault: false,
    });
    setShowCreateDialog(true);
  };

  const handleEdit = (template: ExportTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      format: template.format,
      template: template.template,
      variables: template.variables || [],
      isPublic: template.isPublic,
      isDefault: template.isDefault || false,
    });
    setShowEditDialog(true);
  };

  const handlePreview = (template: ExportTemplate) => {
    setPreviewTemplate(template);
    setShowPreviewDialog(true);
  };

  const handleDelete = (template: ExportTemplate) => {
    setDeletingTemplate(template);
    setShowDeleteDialog(true);
  };

  const saveTemplate = async () => {
    if (!formData.name.trim()) {
      toast.error(t('toastMessages.nameRequired'), t('toastMessages.pleaseEnterTemplateName'));
      return;
    }
    if (!formData.template.trim()) {
      toast.error(t('toastMessages.templateContentRequired'), t('toastMessages.pleaseEnterTemplateContent'));
      return;
    }

    try {
      setSaving(true);
      if (editingTemplate) {
        await api.exportTemplate.updateTemplate(editingTemplate._id!, {
          name: formData.name,
          description: formData.description,
          template: formData.template,
          variables: formData.variables,
          isPublic: formData.isPublic,
          isDefault: formData.isDefault,
        });
        toast.success(t('toastMessages.templateUpdated'), t('toastMessages.templateUpdatedMessage').replace('{{name}}', formData.name));
      } else {
        await api.exportTemplate.createTemplate(formData);
        toast.success(t('toastMessages.templateCreated'), t('toastMessages.templateCreatedMessage').replace('{{name}}', formData.name));
      }
      setShowCreateDialog(false);
      setShowEditDialog(false);
      setEditingTemplate(null);
      await loadTemplates();
    } catch (error) {
      console.error('Error saving template:', error);
      logError(error, 'save-export-template');
      toast.error(t('toastMessages.failedToSaveTemplate'), t('toastMessages.pleaseTryAgainLater'));
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deletingTemplate?._id) return;

    try {
      setDeleting(true);
      await api.exportTemplate.deleteTemplate(deletingTemplate._id);
      toast.success(t('toastMessages.templateDeleted'), t('toastMessages.templateDeletedMessage').replace('{{name}}', deletingTemplate.name));
      setShowDeleteDialog(false);
      setDeletingTemplate(null);
      await loadTemplates();
    } catch (error) {
      console.error('Error deleting template:', error);
      logError(error, 'delete-export-template');
      toast.error(t('toastMessages.failedToDeleteTemplate'), t('toastMessages.pleaseTryAgainLater'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading templates...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Export Templates</h1>
          <p className="text-muted-foreground mt-1">
            Manage custom export templates for different formats
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedFormat} onValueChange={(value) => setSelectedFormat(value as ExportFormat | 'all')}>
            <SelectTrigger className="w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder={t('exportTemplates.filterByFormat')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Formats</SelectItem>
              {EXPORT_FORMATS.map(format => (
                <SelectItem key={format} value={format}>
                  {format.toUpperCase()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              {selectedFormat === 'all' 
                ? 'No templates found. Create your first template to get started.'
                : `No ${selectedFormat.toUpperCase()} templates found.`}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map(template => (
            <Card key={template._id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <CardTitle className="text-lg">{template.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {template.description || t('exportTemplates.noDescription')}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="ml-2">
                    {template.format.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Used {template.usageCount} times</span>
                    {template.isPublic && <Badge variant="secondary">Public</Badge>}
                    {template.isDefault && <Badge variant="default">Default</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreview(template)}
                      className="flex-1"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Preview
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleEdit(template)}
                      className="flex-1"
                    >
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(template)}
                      className="flex-1"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showCreateDialog || showEditDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCreateDialog(false);
          setShowEditDialog(false);
          setEditingTemplate(null);
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-2 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? 'Edit Template' : 'Create Template'}</DialogTitle>
            <DialogDescription>
              {editingTemplate 
                ? 'Update your export template'
                : 'Create a new custom export template'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Template Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData((prev: ExportTemplateCreateInput) => ({ ...prev, name: e.target.value }))}
                placeholder={t('exportTemplates.namePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData((prev: ExportTemplateCreateInput) => ({ ...prev, description: e.target.value }))}
                placeholder={t('exportTemplates.descriptionPlaceholder')}
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="format">Format *</Label>
              <Select
                value={formData.format}
                onValueChange={(value) => setFormData((prev: ExportTemplateCreateInput) => ({ ...prev, format: value as ExportFormat }))}
              >
                <SelectTrigger id="format">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPORT_FORMATS.map(format => (
                    <SelectItem key={format} value={format}>
                      {format.toUpperCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="template">Template Content *</Label>
              <Textarea
                id="template"
                value={formData.template}
                onChange={(e) => setFormData((prev: ExportTemplateCreateInput) => ({ ...prev, template: e.target.value }))}
                placeholder={t('exportTemplates.templatePlaceholder')}
                rows={10}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Available variables: documents, searchParams, metadata, helpers
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="isPublic"
                checked={formData.isPublic}
                onCheckedChange={(checked) => setFormData((prev: ExportTemplateCreateInput) => ({ ...prev, isPublic: checked }))}
              />
              <Label htmlFor="isPublic" className="cursor-pointer">
                Make template public (visible to all users)
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <Switch
                id="isDefault"
                checked={formData.isDefault}
                onCheckedChange={(checked) => setFormData((prev: ExportTemplateCreateInput) => ({ ...prev, isDefault: checked }))}
              />
              <Label htmlFor="isDefault" className="cursor-pointer">
                Set as default template for this format
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowCreateDialog(false);
                setShowEditDialog(false);
                setEditingTemplate(null);
              }}
            >
              {t('exportTemplates.cancel')}
            </Button>
            <Button onClick={saveTemplate} disabled={saving}>
              {saving ? t('exportTemplates.saving') : editingTemplate ? t('exportTemplates.update') : t('exportTemplates.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-2 shadow-2xl">
          <DialogHeader>
            <DialogTitle>{previewTemplate?.name}</DialogTitle>
            <DialogDescription>
              {t('exportTemplates.templatePreview').replace('{{format}}', previewTemplate?.format.toUpperCase() || '')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {previewTemplate?.description && (
              <p className="text-sm text-muted-foreground">{previewTemplate.description}</p>
            )}
            <div className="space-y-2">
              <Label>{t('exportTemplates.templateContent')}</Label>
              <pre className="p-4 bg-muted rounded-md text-sm font-mono overflow-x-auto">
                {previewTemplate?.template}
              </pre>
            </div>
            {previewTemplate?.variables && previewTemplate.variables.length > 0 && (
              <div className="space-y-2">
                <Label>{t('exportTemplates.variablesUsed')}</Label>
                <div className="flex flex-wrap gap-2">
                  {previewTemplate.variables.map((variable: string) => (
                    <Badge key={variable} variant="secondary">{variable}</Badge>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('exportTemplates.deleteTemplate')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('exportTemplates.deleteConfirm').replace('{{name}}', deletingTemplate?.name || '')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('exportTemplates.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? t('exportTemplates.deleting') : t('exportTemplates.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

