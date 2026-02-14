/**
 * File Upload Section Component
 *
 * Drag-and-drop file upload area with file display and error handling.
 */
import React from 'react';
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
export declare function FileUploadSection({ file, fileError, fileInputRef, onFileSelect, onDragOver, onDrop, onClearFile, disabled, }: FileUploadSectionProps): import("react/jsx-runtime").JSX.Element;
export {};
