/**
 * Upload Progress Component
 * 
 * Displays upload progress with percentage and progress bar.
 */

import { Progress } from '../ui/progress';

interface UploadProgressProps {
  progress: number;
  isUploading: boolean;
}

export function UploadProgress({ progress, isUploading }: UploadProgressProps) {
  if (!isUploading) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span>Uploaden...</span>
        <span>{progress}%</span>
      </div>
      <Progress value={progress} />
    </div>
  );
}
