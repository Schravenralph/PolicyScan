/**
 * Upload Mode Selector Component
 * 
 * Selector for choosing upload mode: file, manual, or canonical.
 */

import { Upload, FileText } from 'lucide-react';
import { Button } from '../ui/button';

type UploadMode = 'file' | 'manual' | 'canonical';

interface UploadModeSelectorProps {
  uploadMode: UploadMode;
  onModeChange: (mode: UploadMode) => void;
  disabled?: boolean;
}

export function UploadModeSelector({
  uploadMode,
  onModeChange,
  disabled = false,
}: UploadModeSelectorProps) {
  return (
    <div className="flex gap-2">
      <Button
        variant={uploadMode === 'file' ? 'default' : 'outline'}
        onClick={() => onModeChange('file')}
        className="flex-1"
        disabled={disabled}
      >
        <Upload className="w-4 h-4 mr-2" />
        JSON Bestand
      </Button>
      <Button
        variant={uploadMode === 'manual' ? 'default' : 'outline'}
        onClick={() => onModeChange('manual')}
        className="flex-1"
        disabled={disabled}
      >
        <FileText className="w-4 h-4 mr-2" />
        Handmatig Invoeren
      </Button>
      <Button
        variant={uploadMode === 'canonical' ? 'default' : 'outline'}
        onClick={() => onModeChange('canonical')}
        className="flex-1"
        disabled={disabled}
      >
        <FileText className="w-4 h-4 mr-2" />
        Selecteer uit Canonical Documents
      </Button>
    </div>
  );
}
