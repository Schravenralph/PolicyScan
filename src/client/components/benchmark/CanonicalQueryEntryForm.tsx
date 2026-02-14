/**
 * Canonical Query Entry Form Component
 * 
 * Form for entering queries with canonical document selection (used in canonical upload mode).
 */

import { Plus, X, Trash2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { DocumentSelector } from './DocumentSelector';
import { t } from '../../utils/i18n';

interface QueryEntry {
  query: string;
  relevant_documents: Array<{
    url: string;
    relevance: number;
    documentId?: string;
    source?: string;
  }>;
}

interface CanonicalQueryEntryFormProps {
  queries: QueryEntry[];
  onAddQuery: () => void;
  onRemoveQuery: (index: number) => void;
  onQueryChange: (index: number, field: 'query', value: string) => void;
  onRemoveDocument: (queryIndex: number, docIndex: number) => void;
  onDocumentChange: (
    queryIndex: number,
    docIndex: number,
    field: 'url' | 'relevance' | 'documentId' | 'source',
    value: string | number
  ) => void;
  onDocumentsSelected: (queryIndex: number, selectedDocs: Array<{
    url: string;
    documentId?: string;
    source?: string;
  }>) => void;
  disabled?: boolean;
}

export function CanonicalQueryEntryForm({
  queries,
  onAddQuery,
  onRemoveQuery,
  onQueryChange,
  onRemoveDocument,
  onDocumentChange,
  onDocumentsSelected,
  disabled = false,
}: CanonicalQueryEntryFormProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Queries *</Label>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onAddQuery}
          disabled={disabled}
        >
          <Plus className="w-4 h-4 mr-2" />
          {t('benchmark.addQuery')}
        </Button>
      </div>

      {queries.map((queryEntry, queryIndex) => (
        <Card key={queryIndex} className="p-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Badge variant="outline">Query {queryIndex + 1}</Badge>
              {queries.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveQuery(queryIndex)}
                  disabled={disabled}
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>Query Tekst *</Label>
              <Input
                value={queryEntry.query}
                onChange={(e) => onQueryChange(queryIndex, 'query', e.target.value)}
                placeholder="Bijv. arbeidsmigranten"
                disabled={disabled}
              />
            </div>

            <div className="space-y-2">
              <Label>{t('benchmark.relevantDocuments')} *</Label>
              <DocumentSelector
                onDocumentsSelected={(selectedDocs) => {
                  onDocumentsSelected(queryIndex, selectedDocs);
                }}
                selectedDocumentIds={new Set(
                  queryEntry.relevant_documents
                    .filter(doc => doc.documentId)
                    .map(doc => doc.documentId!)
                )}
              />
              
              {/* Display selected documents with relevance controls */}
              {queryEntry.relevant_documents.length > 0 && (
                <div className="space-y-2 mt-4">
                  <Label>{t('benchmark.selectedDocuments')}</Label>
                  {queryEntry.relevant_documents.map((doc, docIndex) => (
                    <div key={docIndex} className="flex gap-2 items-center p-2 border rounded">
                      <div className="flex-1">
                        <p className="font-medium text-sm">{doc.url}</p>
                        {doc.documentId && (
                          <p className="text-xs text-gray-500">Document ID: {doc.documentId}</p>
                        )}
                      </div>
                      <Input
                        type="number"
                        min="0"
                        max="4"
                        value={doc.relevance}
                        onChange={(e) => onDocumentChange(queryIndex, docIndex, 'relevance', parseInt(e.target.value) || 0)}
                        placeholder="Relevance (0-4)"
                        disabled={disabled}
                        className="w-32"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onRemoveDocument(queryIndex, docIndex)}
                        disabled={disabled}
                      >
                        <X className="w-4 h-4 text-red-600" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
