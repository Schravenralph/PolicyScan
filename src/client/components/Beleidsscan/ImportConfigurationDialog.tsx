import { Upload, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { WorkflowDocument } from '../../services/api';

interface ImportData {
  version: number;
  exportedAt: string;
  configuration: {
    name: string;
    description?: string;
    workflowId: string;
    featureFlags: Record<string, boolean>;
  };
}

interface ImportConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importFileName: string;
  importData: ImportData | null;
  importName: string;
  availableWorkflows: WorkflowDocument[];
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onImportNameChange: (name: string) => void;
  onImport: () => Promise<void>;
  isSaving: boolean;
}

// Get workflow name by ID
function getWorkflowName(workflowId: string, availableWorkflows: WorkflowDocument[]): string {
  const workflow = availableWorkflows.find(w => w.id === workflowId);
  return workflow?.name || workflowId;
}

// Count enabled flags
function countEnabledFlags(flags: Record<string, boolean>): number {
  return Object.values(flags).filter(Boolean).length;
}

export function ImportConfigurationDialog({
  open,
  onOpenChange,
  importFileName,
  importData,
  importName,
  availableWorkflows,
  onFileSelect,
  onImportNameChange,
  onImport,
  isSaving,
}: ImportConfigurationDialogProps) {
  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl ">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Configuratie Importeren
          </DialogTitle>
          <DialogDescription>
            Selecteer een geëxporteerd JSON bestand om een configuratie te importeren
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* File Input */}
          <div className="space-y-2">
            <Label htmlFor="import-file">Selecteer JSON bestand</Label>
            <Input
              id="import-file"
              type="file"
              accept=".json,application/json"
              onChange={onFileSelect}
              aria-describedby="import-file-description"
            />
            <p id="import-file-description" className="text-sm text-muted-foreground">
              Selecteer een geëxporteerd configuratie bestand (.json)
            </p>
            {importFileName && (
              <p className="text-sm text-muted-foreground">
                Geselecteerd: {importFileName}
              </p>
            )}
          </div>

          {/* Preview */}
          {importData && (
            <div className="space-y-4 border rounded-lg p-4">
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="space-y-2 text-sm">
                  <div>
                    <span className="font-medium">Naam:</span>{' '}
                    <span>{importData.configuration.name}</span>
                  </div>
                  {importData.configuration.description && (
                    <div>
                      <span className="font-medium">Beschrijving:</span>{' '}
                      <span>{importData.configuration.description}</span>
                    </div>
                  )}
                  <div>
                    <span className="font-medium">Workflow:</span>{' '}
                    <span>{getWorkflowName(importData.configuration.workflowId, availableWorkflows)}</span>
                  </div>
                  <div>
                    <span className="font-medium">Feature Flags:</span>{' '}
                    <span>{countEnabledFlags(importData.configuration.featureFlags)} / {Object.keys(importData.configuration.featureFlags).length}</span>
                  </div>
                  {importData.exportedAt && (
                    <div className="text-xs text-muted-foreground">
                      Geëxporteerd op: {new Date(importData.exportedAt).toLocaleString('nl-NL')}
                    </div>
                  )}
                </div>
              </div>

              {/* Rename Option */}
              <div className="space-y-2">
                <Label htmlFor="import-name">Nieuwe naam (optioneel)</Label>
                <Input
                  id="import-name"
                  value={importName}
                  onChange={(e) => onImportNameChange(e.target.value)}
                  placeholder={importData.configuration.name}
                  aria-describedby="import-name-description"
                />
                <p id="import-name-description" className="text-xs text-muted-foreground">
                  Laat leeg om de originele naam te behouden
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleClose}
          >
            Annuleren
          </Button>
          <Button
            onClick={onImport}
            disabled={isSaving || !importData}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Importeren...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Importeren
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

