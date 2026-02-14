/**
 * File Upload Section Component
 * 
 * Drag-and-drop file upload area with file display and error handling.
 */

import React from 'react';
import { Upload, FileText, X, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';

interface FileUploadSectionProps {
  file: File | null;
  fileError: string | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onClearFile: () => void;
  disabled?: boolean;
}

export function FileUploadSection({
  file,
  fileError,
  fileInputRef,
  onFileSelect,
  onDragOver,
  onDrop,
  onClearFile,
  disabled = false,
}: FileUploadSectionProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="border-2 border-dashed rounded-lg p-8 text-center hover:border-primary transition-colors"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={onFileSelect}
        className="hidden"
      />
      <Upload className="w-12 h-12 mx-auto text-gray-400 mb-4" />
      <p className="text-sm text-gray-600 mb-2">
        Sleep een JSON bestand hierheen of klik om te selecteren
      </p>
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
      >
        Bestand Selecteren
      </Button>
      {file && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <FileText className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-600">{file.name}</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClearFile}
            disabled={disabled}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      )}
      {fileError && (
        <div className="mt-4 flex items-center justify-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>{fileError}</span>
        </div>
      )}
    </div>
  );
}
