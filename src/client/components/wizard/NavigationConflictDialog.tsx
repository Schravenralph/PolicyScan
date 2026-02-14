/**
 * NavigationConflictDialog - Dialog for resolving navigation revision conflicts
 * 
 * Shows both local and server states when a revision conflict occurs,
 * allowing users to choose which state to keep or merge them.
 */

import { useState } from 'react';
import { AlertTriangle, RefreshCw, CheckCircle, XCircle, GitMerge, X } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';

export interface ConflictState {
  stepId: string;
  stepName: string;
  completedSteps: string[];
  context: Record<string, unknown>;
  revision: number;
}

export interface NavigationConflict {
  localState: ConflictState;
  serverState: ConflictState;
  expectedRevision: number;
  actualRevision: number;
  targetStepId: string;
}

interface NavigationConflictDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  conflict: NavigationConflict | null;
  onUseLocal: () => void;
  onUseServer: () => void;
  onMerge?: () => void;
  onRetry?: () => void;
  onIgnore?: () => void;
}

/**
 * Format step list for display
 */

/**
 * Get differences between local and server state
 */
function getStateDifferences(
  local: ConflictState,
  server: ConflictState
): Array<{ field: string; local: string; server: string }> {
  const differences: Array<{ field: string; local: string; server: string }> = [];

  if (local.stepId !== server.stepId) {
    differences.push({
      field: 'Huidige stap',
      local: local.stepName || local.stepId,
      server: server.stepName || server.stepId,
    });
  }

  const localCompleted = local.completedSteps.join(', ');
  const serverCompleted = server.completedSteps.join(', ');
  if (localCompleted !== serverCompleted) {
    differences.push({
      field: 'Voltooide stappen',
      local: localCompleted || t('common.none'),
      server: serverCompleted || t('common.none'),
    });
  }

  return differences;
}

export function NavigationConflictDialog({
  isOpen,
  onOpenChange,
  conflict,
  onUseLocal,
  onUseServer,
  onMerge,
  onRetry,
  onIgnore,
}: NavigationConflictDialogProps) {
  const [, setSelectedOption] = useState<'local' | 'server' | 'merge' | null>(null);

  if (!conflict) return null;

  const differences = getStateDifferences(conflict.localState, conflict.serverState);
  const hasDifferences = differences.length > 0;

  // Handle dialog close - if user clicks X, treat it as ignore if available
  const handleDialogChange = (newOpen: boolean) => {
    if (!newOpen && onIgnore) {
      // User closed dialog (X button or ESC) - treat as ignore
      onIgnore();
    }
    onOpenChange(newOpen);
  };

  const handleUseLocal = () => {
    setSelectedOption('local');
    onUseLocal();
    onOpenChange(false);
  };

  const handleUseServer = () => {
    setSelectedOption('server');
    onUseServer();
    onOpenChange(false);
  };

  const handleMerge = () => {
    if (onMerge) {
      setSelectedOption('merge');
      onMerge();
      onOpenChange(false);
    }
  };

  const handleRetry = () => {
    if (onRetry) {
      onRetry();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogChange}>
      <DialogContent className="max-w-2xl" role="alert" aria-live="assertive">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full flex items-center justify-center bg-warning/10 flex-shrink-0">
              <AlertTriangle className="w-6 h-6 text-warning" aria-hidden="true" />
            </div>
            <div className="flex-1">
              <DialogTitle className="font-serif font-semibold text-foreground">
                Navigatie Conflict
              </DialogTitle>
              <DialogDescription className="text-muted-foreground mt-1">
                De wizard staat is gewijzigd door een andere actie. Kies welke versie u wilt gebruiken.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Conflict Details */}
          <div className="p-4 rounded-lg bg-background border border-border">
            <div className="text-sm space-y-2">
              <div>
                <strong className="text-foreground">Verwachte revisie:</strong>{' '}
                <span className="text-muted-foreground">{conflict.expectedRevision}</span>
              </div>
              <div>
                <strong className="text-foreground">{t('wizard.currentRevisionOnServer')}</strong>{' '}
                <span className="text-muted-foreground">{conflict.actualRevision}</span>
              </div>
              <div>
                <strong className="text-foreground">Doel stap:</strong>{' '}
                <span className="text-muted-foreground">{conflict.targetStepId}</span>
              </div>
            </div>
          </div>

          {/* State Differences */}
          {hasDifferences && (
            <div className="space-y-3">
              <h4 className="text-sm font-semibold text-foreground">Verschillen:</h4>
              <div className="space-y-2">
                {differences.map((diff, index) => (
                  <div key={index} className="p-3 rounded-lg bg-background border border-border">
                    <div className="text-sm font-medium text-foreground mb-2">{diff.field}</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="font-medium text-primary mb-1">Lokaal:</div>
                        <div className="text-muted-foreground">{diff.local}</div>
                      </div>
                      <div>
                        <div className="font-medium text-secondary mb-1">Server:</div>
                        <div className="text-muted-foreground">{diff.server}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleUseLocal}
              variant="outline"
              className="w-full border-primary text-primary hover:bg-primary/10 justify-start"
              aria-label="Gebruik lokale versie"
            >
              <CheckCircle className="w-4 h-4 mr-2" aria-hidden="true" />
              <div className="flex-1 text-left">
                <div className="font-medium">Gebruik Lokale Versie</div>
                <div className="text-xs text-muted-foreground">
                  Behoud uw huidige wijzigingen
                </div>
              </div>
            </Button>

            <Button
              onClick={handleUseServer}
              variant="outline"
              className="w-full border-secondary text-secondary hover:bg-secondary/10 justify-start"
              aria-label="Gebruik server versie"
            >
              <XCircle className="w-4 h-4 mr-2" aria-hidden="true" />
              <div className="flex-1 text-left">
                <div className="font-medium">Gebruik Server Versie</div>
                <div className="text-xs text-muted-foreground">
                  Overschrijf met server status
                </div>
              </div>
            </Button>

            {onMerge && (
              <Button
                onClick={handleMerge}
                variant="outline"
                className="w-full border-accent text-accent hover:bg-accent/10 justify-start"
                aria-label="Voeg versies samen"
              >
                <GitMerge className="w-4 h-4 mr-2" aria-hidden="true" />
                <div className="flex-1 text-left">
                  <div className="font-medium">Voeg Samen</div>
                  <div className="text-xs text-muted-foreground">
                    Combineer beide versies (indien mogelijk)
                  </div>
                </div>
              </Button>
            )}

            {onRetry && (
              <Button
                onClick={handleRetry}
                variant="ghost"
                className="w-full text-muted-foreground hover:text-foreground"
                aria-label="Probeer opnieuw"
              >
                <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                Probeer Opnieuw
              </Button>
            )}
            <Button
              onClick={() => {
                if (onIgnore) {
                  onIgnore();
                }
                onOpenChange(false);
              }}
              variant="ghost"
              className="w-full border-dashed text-muted-foreground hover:text-foreground"
              aria-label="Negeren en doorgaan"
            >
              <X className="w-4 h-4 mr-2" aria-hidden="true" />
              Negeren en doorgaan
            </Button>
          </div>

          {/* Help Text */}
          <div className="p-3 rounded-lg bg-background border border-border">
            <p className="text-xs text-muted-foreground">
              <strong className="text-foreground">Tip:</strong> Dit conflict ontstaat wanneer de wizard staat
              is gewijzigd terwijl u navigeerde. Kies de versie die uw werk bevat, of probeer opnieuw
              om automatisch de nieuwste versie te gebruiken.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}


