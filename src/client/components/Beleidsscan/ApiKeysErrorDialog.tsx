import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { t } from '../../utils/i18n';

interface ApiKeysError {
  message: string;
  missingKeys?: {
    openai?: boolean;
    google?: boolean;
  };
  canUseMock?: boolean;
}

interface ApiKeysErrorDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  apiKeysError: ApiKeysError | null;
  onUseMockSuggestions: () => void;
}

export function ApiKeysErrorDialog({
  isOpen,
  onOpenChange,
  apiKeysError,
  onUseMockSuggestions,
}: ApiKeysErrorDialogProps) {
  if (!apiKeysError) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif font-semibold text-foreground">
            {t('apiKeysErrorDialog.title')}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {apiKeysError.message}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-4 text-foreground">
          <div className="p-4 rounded-lg bg-destructive/10">
            <p className="text-sm font-medium mb-2 text-destructive">
              {t('apiKeysErrorDialog.missingKeys')}
            </p>
            <ul className="text-sm space-y-1 ml-4 list-disc text-foreground">
              {apiKeysError.missingKeys?.openai && (
                <li>{t('apiKeysErrorDialog.openaiKey')}</li>
              )}
              {apiKeysError.missingKeys?.google && (
                <>
                  <li>{t('apiKeysErrorDialog.googleApiKey')}</li>
                  <li>{t('apiKeysErrorDialog.googleEngineId')}</li>
                </>
              )}
            </ul>
          </div>
          <div className="p-4 rounded-lg bg-muted">
            <p className="text-sm font-medium mb-2 text-foreground">
              {t('apiKeysErrorDialog.configuration')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('apiKeysErrorDialog.configurationDescription')}
            </p>
          </div>
          {apiKeysError.canUseMock && (
            <div className="p-4 rounded-lg border-2 border-primary bg-muted">
              <p className="text-sm font-medium mb-2 text-foreground">
                {t('apiKeysErrorDialog.developmentMode')}
              </p>
              <p className="text-xs mb-3 text-muted-foreground">
                {t('apiKeysErrorDialog.developmentModeDescription')}
              </p>
              <Button
                onClick={onUseMockSuggestions}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {t('apiKeysErrorDialog.useMockSuggestions')}
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <Button
            onClick={() => onOpenChange(false)}
            variant="outline"
            className="flex-1 border-border text-foreground hover:bg-muted"
          >
            {t('common.close')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


