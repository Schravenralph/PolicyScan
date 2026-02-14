import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import type { GroundTruthDataset } from './GroundTruthDatasetList';
import { UploadModeSelector } from './UploadModeSelector';
import { FileUploadSection } from './FileUploadSection';
import { DatasetInfoForm } from './DatasetInfoForm';
import { ManualQueryEntryForm } from './ManualQueryEntryForm';
import { CanonicalQueryEntryForm } from './CanonicalQueryEntryForm';
import { ValidationErrorsDisplay } from './ValidationErrorsDisplay';
import { DatasetPreviewSection } from './DatasetPreviewSection';
import { UploadProgress } from './UploadProgress';
import { DatasetUploadActions } from './DatasetUploadActions';

interface GroundTruthDatasetUploadProps {
  onSuccess?: (dataset: GroundTruthDataset) => void;
  onCancel?: () => void;
}

type UploadMode = 'file' | 'manual' | 'canonical';

interface QueryEntry {
  query: string;
  relevant_documents: Array<{
    url: string;
    relevance: number;
    documentId?: string; // Optional: MongoDB ObjectId of canonical document
    source?: string; // Optional: Document source (DSO, Rechtspraak, etc.)
  }>;
}

/**
 * GroundTruthDatasetUpload Component
 * 
 * Supports uploading ground truth datasets via JSON file or manual entry.
 * Includes validation, preview, and progress tracking.
 * 
 * @component
 */
export function GroundTruthDatasetUpload({
  onSuccess,
  onCancel,
}: GroundTruthDatasetUploadProps) {
  const [uploadMode, setUploadMode] = useState<UploadMode>('file');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [queries, setQueries] = useState<QueryEntry[]>([
    { query: '', relevant_documents: [] },
  ]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<GroundTruthDataset | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const validateDataset = (data: Partial<GroundTruthDataset>): string[] => {
    const errors: string[] = [];

    if (!data.name || data.name.trim().length === 0) {
      errors.push('Naam is verplicht');
    }

    if (!data.queries || !Array.isArray(data.queries) || data.queries.length === 0) {
      errors.push('Ten minste één query is vereist');
      return errors; // Early return if no queries
    }

    data.queries.forEach((queryEntry, index) => {
      if (!queryEntry.query || queryEntry.query.trim().length === 0) {
        errors.push(`Query ${index + 1}: Query tekst is verplicht`);
      }

      if (!queryEntry.relevant_documents || !Array.isArray(queryEntry.relevant_documents)) {
        errors.push(`Query ${index + 1}: Relevant documents moet een array zijn`);
        return;
      }

      if (queryEntry.relevant_documents.length === 0) {
        errors.push(`Query ${index + 1}: Ten minste één relevant document is vereist`);
      }

      queryEntry.relevant_documents.forEach((doc, docIndex) => {
        // URL is required unless documentId is provided (for canonical documents)
        const docWithId = doc as { url: string; relevance: number; documentId?: string };
        if ((!docWithId.url || docWithId.url.trim().length === 0) && !docWithId.documentId) {
          errors.push(`Query ${index + 1}, Document ${docIndex + 1}: URL of Document ID is verplicht`);
        }

        if (doc.relevance === undefined || doc.relevance === null) {
          errors.push(`Query ${index + 1}, Document ${docIndex + 1}: Relevance score is verplicht`);
        } else if (doc.relevance < 0 || doc.relevance > 4) {
          errors.push(`Query ${index + 1}, Document ${docIndex + 1}: Relevance moet tussen 0 en 4 zijn`);
        }
      });
    });

    return errors;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.endsWith('.json')) {
      setFileError(t('benchmark.onlyJsonFilesAllowed'));
      setFile(null);
      return;
    }

    setFile(selectedFile);
    setFileError(null);

    // Read and validate file
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);

        // Validate structure
        const errors = validateDataset(parsed);
        if (errors.length > 0) {
          setFileError(`Validatiefouten: ${errors.join(', ')}`);
          setFile(null);
          return;
        }

        // Set form fields from file
        setName(parsed.name || '');
        setDescription(parsed.description || '');
        setQueries(parsed.queries || []);
        setPreviewData(parsed as GroundTruthDataset);
      } catch (error) {
        setFileError('Ongeldig JSON bestand. Controleer de syntax.');
        setFile(null);
        logError(error, 'parse-json-file');
      }
    };
    reader.onerror = () => {
      setFileError('Fout bij lezen van bestand');
      setFile(null);
    };
    reader.readAsText(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.endsWith('.json')) {
      // Simulate file input change
      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(droppedFile);
      if (fileInputRef.current) {
        fileInputRef.current.files = dataTransfer.files;
        // Create a proper ChangeEvent for the file input
        const syntheticEvent = {
          target: { files: dataTransfer.files },
          currentTarget: fileInputRef.current,
        } as React.ChangeEvent<HTMLInputElement>;
        handleFileSelect(syntheticEvent);
      }
    } else {
      setFileError(t('benchmark.onlyJsonFilesAllowed'));
    }
  };

  const handleAddQuery = () => {
    setQueries(prev => [...prev, { query: '', relevant_documents: [] }]);
  };

  const handleRemoveQuery = (index: number) => {
    setQueries(prev => prev.filter((_, i) => i !== index));
  };

  const handleQueryChange = (index: number, field: 'query', value: string) => {
    setQueries(prev => prev.map((q, i) => 
      i === index ? { ...q, [field]: value } : q
    ));
  };

  const handleAddDocument = (queryIndex: number) => {
    setQueries(prev => prev.map((q, i) => 
      i === queryIndex 
        ? { ...q, relevant_documents: [...q.relevant_documents, { url: '', relevance: 1 }] }
        : q
    ));
  };

  const handleRemoveDocument = (queryIndex: number, docIndex: number) => {
    setQueries(prev => prev.map((q, i) => 
      i === queryIndex 
        ? { ...q, relevant_documents: q.relevant_documents.filter((_, di) => di !== docIndex) }
        : q
    ));
  };

  const handleDocumentChange = (
    queryIndex: number,
    docIndex: number,
    field: 'url' | 'relevance' | 'documentId' | 'source',
    value: string | number
  ) => {
    setQueries(prev => prev.map((q, i) => 
      i === queryIndex 
        ? {
            ...q,
            relevant_documents: q.relevant_documents.map((doc, di) => 
              di === docIndex ? { ...doc, [field]: value } : doc
            )
          }
        : q
    ));
  };

  const handlePreview = () => {
    const dataset: Partial<GroundTruthDataset> = {
      name,
      description,
      queries,
    };

    const errors = validateDataset(dataset);
    setValidationErrors(errors);

    if (errors.length === 0) {
      setPreviewData(dataset as GroundTruthDataset);
    } else {
      setPreviewData(null);
    }
  };

  const handleSubmit = async () => {
    const dataset: Partial<GroundTruthDataset> = {
      name: name.trim(),
      description: description.trim() || undefined,
      queries: queries.map(q => ({
        query: q.query.trim(),
        relevant_documents: q.relevant_documents.map(doc => ({
          url: doc.url.trim() || doc.documentId || '', // Use documentId as fallback URL if URL is empty
          relevance: doc.relevance,
          ...(doc.documentId && { documentId: doc.documentId }),
          ...(doc.source && { source: doc.source }),
        })),
      })),
    };

    const errors = validateDataset(dataset);
    setValidationErrors(errors);

    if (errors.length > 0) {
      toast.error(t('validation.errors'), errors.join(', '));
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return prev;
          }
          return prev + 10;
        });
      }, 200);

      const response = await api.post<{
        success: boolean;
        dataset: GroundTruthDataset;
      }>('/benchmark/ground-truth/datasets', dataset);
      
      clearInterval(progressInterval);
      setUploadProgress(100);

      const uploadedDataset = response.dataset;

      toast.success(t('benchmark.uploadCompleted'), t('benchmark.uploadCompletedDesc').replace('{{name}}', uploadedDataset.name ?? dataset.name ?? ''));
      
      if (onSuccess) {
        onSuccess(uploadedDataset);
      }

      // Reset form
      setName('');
      setDescription('');
      setQueries([{ query: '', relevant_documents: [] }]);
      setFile(null);
      setPreviewData(null);
      setValidationErrors([]);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      logError(error, 'upload-ground-truth-dataset');
      const errorMessage = error instanceof Error ? error.message : t('benchmark.uploadError');
      toast.error(t('benchmark.uploadFailed'), errorMessage);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upload Ground Truth Dataset</CardTitle>
        <CardDescription>
          Upload een dataset via JSON bestand of voer handmatig queries en relevante documenten in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upload Mode Selection */}
        <UploadModeSelector
          uploadMode={uploadMode}
          onModeChange={setUploadMode}
          disabled={isUploading}
        />

        {/* File Upload Mode */}
        {uploadMode === 'file' && (
          <FileUploadSection
            file={file}
            fileError={fileError}
            fileInputRef={fileInputRef}
            onFileSelect={handleFileSelect}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClearFile={() => {
              setFile(null);
              setFileError(null);
              if (fileInputRef.current) {
                fileInputRef.current.value = '';
              }
            }}
            disabled={isUploading}
          />
        )}

        {/* Manual Entry Mode */}
        {uploadMode === 'manual' && (
          <div className="space-y-4">
            {/* Dataset Info */}
            <DatasetInfoForm
              name={name}
              description={description}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              nameId="name"
              descriptionId="description"
              disabled={isUploading}
            />

            {/* Queries */}
            <ManualQueryEntryForm
              queries={queries}
              onAddQuery={handleAddQuery}
              onRemoveQuery={handleRemoveQuery}
              onQueryChange={handleQueryChange}
              onAddDocument={handleAddDocument}
              onRemoveDocument={handleRemoveDocument}
              onDocumentChange={handleDocumentChange}
              disabled={isUploading}
            />
          </div>
        )}

        {/* Canonical Document Selection Mode */}
        {uploadMode === 'canonical' && (
          <div className="space-y-4">
            {/* Dataset Info */}
            <DatasetInfoForm
              name={name}
              description={description}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              nameId="name-canonical"
              descriptionId="description-canonical"
              disabled={isUploading}
            />

            {/* Queries */}
            <CanonicalQueryEntryForm
              queries={queries}
              onAddQuery={handleAddQuery}
              onRemoveQuery={handleRemoveQuery}
              onQueryChange={handleQueryChange}
              onRemoveDocument={handleRemoveDocument}
              onDocumentChange={handleDocumentChange}
              onDocumentsSelected={(queryIndex, selectedDocs) => {
                setQueries(prev => prev.map((q, i) => 
                  i === queryIndex 
                    ? {
                        ...q,
                        relevant_documents: selectedDocs.map(doc => ({
                          url: doc.url,
                          relevance: 3, // Default relevance
                          documentId: doc.documentId,
                          source: doc.source,
                        }))
                      }
                    : q
                ));
              }}
              disabled={isUploading}
            />
          </div>
        )}

        {/* Validation Errors */}
        <ValidationErrorsDisplay errors={validationErrors} />

        {/* Preview */}
        <DatasetPreviewSection previewData={previewData} />

        {/* Upload Progress */}
        <UploadProgress progress={uploadProgress} isUploading={isUploading} />

        {/* Actions */}
        <DatasetUploadActions
          onCancel={onCancel}
          onPreview={handlePreview}
          onSubmit={handleSubmit}
          isUploading={isUploading}
          canSubmit={uploadMode === 'file' ? !!file : true}
        />
      </CardContent>
    </Card>
  );
}

