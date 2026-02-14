/**
 * DocumentSelector Component
 * 
 * Allows users to browse and select canonical documents from different sources
 * (DSO/STOP-TPOD, IMRO, Rechtspraak) for ground truth datasets.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Search, CheckCircle2, Loader2, FileText } from 'lucide-react';
import { api } from '../../services/api';
import { EmptyState } from '../ui/EmptyState';
import { toast } from '../../utils/toast';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';
import type { CanonicalDocument } from '../../services/api';

type DocumentSource = 'DSO' | 'Rechtspraak';

interface DocumentSelectorProps {
  onDocumentsSelected: (documents: Array<{
    documentId: string;
    url: string;
    title: string;
    source: string;
  }>) => void;
  selectedDocumentIds?: Set<string>;
  source?: DocumentSource;
}

export function DocumentSelector({
  onDocumentsSelected,
  selectedDocumentIds = new Set(),
  source,
}: DocumentSelectorProps) {
  const [documents, setDocuments] = useState<CanonicalDocument[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSource, setSelectedSource] = useState<DocumentSource>(source || 'DSO');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(selectedDocumentIds);
  const limit = 20;

  const loadDocuments = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.append('source', selectedSource);
      queryParams.append('limit', limit.toString());
      queryParams.append('page', page.toString());
      if (searchQuery) {
        queryParams.append('search', searchQuery);
      }
      const url = `/canonical-documents?${queryParams.toString()}`;
      const response = await api.get<{
        data: CanonicalDocument[];
        pagination: {
          total: number;
          page: number;
          limit: number;
        };
      }>(url);

      setDocuments(response.data || []);
      setTotal(response.pagination?.total || 0);
    } catch (error) {
      logError(error, 'load-canonical-documents');
      toast.error('Fout', 'Kon documenten niet laden.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [selectedSource, page, searchQuery]);

  const toggleDocument = (doc: CanonicalDocument) => {
    const newSelected = new Set(selectedDocs);
    if (newSelected.has(doc._id)) {
      newSelected.delete(doc._id);
    } else {
      newSelected.add(doc._id);
    }
    setSelectedDocs(newSelected);

    // Notify parent of selected documents
    const selectedDocuments = Array.from(newSelected)
      .map(id => {
        const document = documents.find(d => d._id === id);
        if (!document) return null;
        return {
          documentId: document._id,
          url: document.canonicalUrl || document.sourceId,
          title: document.title,
          source: document.source,
        };
      })
      .filter(Boolean) as Array<{
        documentId: string;
        url: string;
        title: string;
        source: string;
      }>;

    onDocumentsSelected(selectedDocuments);
  };

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setPage(1); // Reset to first page on search
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('documentSelector.selectDocuments')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Source Selection */}
        <div className="flex gap-2">
          <Button
            variant={selectedSource === 'DSO' ? 'default' : 'outline'}
            onClick={() => {
              setSelectedSource('DSO');
              setPage(1);
            }}
            className="flex-1"
          >
            DSO / STOP-TPOD / IMRO
          </Button>
          <Button
            variant={selectedSource === 'Rechtspraak' ? 'default' : 'outline'}
            onClick={() => {
              setSelectedSource('Rechtspraak');
              setPage(1);
            }}
            className="flex-1"
          >
            Rechtspraak
          </Button>
        </div>

        {/* Search */}
        <div className="space-y-2">
          <Label>{t('documentSelector.searchDocuments')}</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" aria-hidden="true" />
            <Input
              placeholder="Zoek op titel, type, of uitgever..."
              value={searchQuery}
              onChange={handleSearch}
              className="pl-10"
            />
          </div>
        </div>

        {/* Document List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            <span className="ml-2 text-gray-600">{t('documentSelector.loadingDocuments')}</span>
          </div>
        ) : documents.length === 0 ? (
          <EmptyState
            title="Geen documenten gevonden"
            message="Probeer een andere zoekopdracht of filter."
            icon={FileText}
            suggestions={[
              "Controleer de spelling",
              "Probeer andere zoektermen",
              "Kies een andere bron (DSO/Rechtspraak)"
            ]}
          />
        ) : (
          <>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {documents.map((doc) => {
                const isSelected = selectedDocs.has(doc._id);
                return (
                  <Card
                    key={doc._id}
                    className={`cursor-pointer transition-colors ${
                      isSelected ? 'border-primary bg-primary/5' : 'hover:border-gray-300'
                    }`}
                    onClick={() => toggleDocument(doc)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-semibold">{doc.title}</h4>
                            {isSelected && (
                              <CheckCircle2 className="w-5 h-5 text-primary" />
                            )}
                          </div>
                          <div className="flex flex-wrap gap-2 mb-2">
                            <Badge variant="outline">{doc.source}</Badge>
                            {doc.documentType && (
                              <Badge variant="outline">{doc.documentType}</Badge>
                            )}
                            {doc.publisherAuthority && (
                              <Badge variant="outline">{doc.publisherAuthority}</Badge>
                            )}
                          </div>
                          {doc.canonicalUrl && (
                            <p className="text-sm text-gray-500 truncate">{doc.canonicalUrl}</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  Vorige
                </Button>
                <span className="text-sm text-gray-600">
                  Pagina {page} van {totalPages} ({total} documenten)
                </span>
                <Button
                  variant="outline"
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Volgende
                </Button>
              </div>
            )}

            {/* Selected Count */}
            {selectedDocs.size > 0 && (
              <div className="text-sm text-gray-600">
                {selectedDocs.size} document(en) geselecteerd
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

