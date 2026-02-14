/**
 * Manual Query Entry Form Component
 * 
 * Form for entering queries with manual URL inputs (used in manual upload mode).
 */

import { Plus, X, Trash2 } from 'lucide-react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
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

interface ManualQueryEntryFormProps {
  queries: QueryEntry[];
  onAddQuery: () => void;
  onRemoveQuery: (index: number) => void;
  onQueryChange: (index: number, field: 'query', value: string) => void;
  onAddDocument: (queryIndex: number) => void;
  onRemoveDocument: (queryIndex: number, docIndex: number) => void;
  onDocumentChange: (
    queryIndex: number,
    docIndex: number,
    field: 'url' | 'relevance' | 'documentId' | 'source',
    value: string | number
  ) => void;
  disabled?: boolean;
}

export function ManualQueryEntryForm({
  queries,
  onAddQuery,
  onRemoveQuery,
  onQueryChange,
  onAddDocument,
  onRemoveDocument,
  onDocumentChange,
  disabled = false,
}: ManualQueryEntryFormProps) {
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
              <div className="flex items-center justify-between">
                <Label>{t('benchmark.relevantDocuments')} *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onAddDocument(queryIndex)}
                  disabled={disabled}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('benchmark.addDocument')}
                </Button>
              </div>

              {queryEntry.relevant_documents.map((doc, docIndex) => (
                <div key={docIndex} className="flex gap-2 items-start">
                  <div className="flex-1 space-y-2">
                    <Input
                      value={doc.url}
                      onChange={(e) => onDocumentChange(queryIndex, docIndex, 'url', e.target.value)}
                      placeholder="URL"
                      disabled={disabled}
                    />
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
                  </div>
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

              {queryEntry.relevant_documents.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Voeg ten minste één relevant document toe
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
