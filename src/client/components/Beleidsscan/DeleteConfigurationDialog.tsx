/**
 * DeleteConfigurationDialog Component
 * 
 * Confirmation dialog for deleting a workflow configuration.
 */

import { Loader2, Trash2, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import type { WorkflowConfiguration } from '../../services/api/WorkflowConfigurationApiService';

interface DeleteConfigurationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: WorkflowConfiguration | null;
  onConfirm: () => void;
  isDeleting: boolean;
}

export function DeleteConfigurationDialog({
  open,
  onOpenChange,
  config,
  onConfirm,
  isDeleting,
}: DeleteConfigurationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-destructive" />
            Configuratie Verwijderen
          </DialogTitle>
          <DialogDescription>
            Weet je zeker dat je de configuratie "{config?.name}" wilt verwijderen?
            Deze actie kan niet ongedaan worden gemaakt.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Annuleren
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Verwijderen...
              </>
            ) : (
              <>
                <Trash2 className="h-4 w-4 mr-2" />
                Verwijderen
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

