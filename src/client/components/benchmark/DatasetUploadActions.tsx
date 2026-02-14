/**
 * Dataset Upload Actions Component
 * 
 * Action buttons for cancel, preview, and upload.
 */

import { Button } from '../ui/button';

interface DatasetUploadActionsProps {
  onCancel?: () => void;
  onPreview: () => void;
  onSubmit: () => void;
  isUploading: boolean;
  canSubmit: boolean;
}

export function DatasetUploadActions({
  onCancel,
  onPreview,
  onSubmit,
  isUploading,
  canSubmit,
}: DatasetUploadActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2">
      {onCancel && (
        <Button variant="outline" onClick={onCancel} disabled={isUploading}>
          Annuleren
        </Button>
      )}
      <Button
        variant="outline"
        onClick={onPreview}
        disabled={isUploading}
      >
        Preview
      </Button>
      <Button
        onClick={onSubmit}
        disabled={isUploading || !canSubmit}
      >
        {isUploading ? 'Uploaden...' : 'Uploaden'}
      </Button>
    </div>
  );
}
