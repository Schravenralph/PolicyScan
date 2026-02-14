/**
 * Website Error Display Component
 * 
 * Displays error messages for website suggestions with user-friendly
 * messages and guidance.
 */

import { memo } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { getUserFriendlyErrorMessage, getErrorGuidance } from '../../utils/errorMessages';
import { t } from '../../utils/i18n';

interface WebsiteErrorDisplayProps {
  error: Error | null;
  onClose: () => void;
}

function WebsiteErrorDisplayComponent({
  error,
  onClose,
}: WebsiteErrorDisplayProps) {
  if (!error) {
    return null;
  }

  const guidance = getErrorGuidance(error, { step: 2 });

  return (
    <div
      className="p-4 rounded-lg border bg-destructive/10 border-destructive mb-4"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1">
          <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex-1">
            <h3 className="font-semibold mb-1 text-foreground">
              {t('websiteErrorDisplay.title')}
            </h3>
            <p className="text-sm text-foreground mb-2">
              {getUserFriendlyErrorMessage(error, {
                action: 'Website suggesties genereren',
                step: 2,
                resource: 'website suggesties'
              })}
            </p>
            {guidance && (
              <p className="text-sm text-muted-foreground">
                {guidance}
              </p>
            )}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-background/50 rounded transition-colors flex-shrink-0"
          aria-label={t('websiteErrorDisplay.closeError')}
        >
          <X className="w-4 h-4 text-foreground" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

// Memoize WebsiteErrorDisplay to prevent unnecessary re-renders
// Only re-render when error or onClose changes
export const WebsiteErrorDisplay = memo(WebsiteErrorDisplayComponent, (prevProps, nextProps) => {
  // Compare error objects by message and name
  const prevError = prevProps.error;
  const nextError = nextProps.error;
  
  if (prevError === nextError) {
    return prevProps.onClose === nextProps.onClose;
  }
  
  if (!prevError || !nextError) {
    return false; // One is null, other is not
  }
  
  return (
    prevError.message === nextError.message &&
    prevError.name === nextError.name &&
    prevProps.onClose === nextProps.onClose
  );
});
