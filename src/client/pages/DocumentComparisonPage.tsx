/**
 * Document Comparison Page
 * 
 * Allows users to select two documents and compare them using the structured
 * document comparison service.
 * 
 * @see docs/21-issues/WI-COMPARISON-001-structured-document-comparison.md
 */

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { DocumentComparisonView } from '../components/comparison/DocumentComparisonView';
import { api } from '../services/api';
import type { CanonicalDocument } from '../services/api';
import { toast } from '../utils/toast';
import { logError, parseError } from '../utils/errorHandler';
import { Loader2, Search, FileText } from 'lucide-react';
import { CanonicalDocumentCard } from '../components/CanonicalDocumentCard';

export function DocumentComparisonPage() {
  const [documentAId, setDocumentAId] = useState<string>('');
  const [documentBId, setDocumentBId] = useState<string>('');
  const [documentA, setDocumentA] = useState<CanonicalDocument | null>(null);
  const [documentB, setDocumentB] = useState<CanonicalDocument | null>(null);
  const [loadingA, setLoadingA] = useState(false);
  const [loadingB, setLoadingB] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CanonicalDocument[]>([]);
  const [searching, setSearching] = useState(false);

  const loadDocument = async (documentId: string, side: 'A' | 'B') => {
    if (!documentId.trim()) {
      if (side === 'A') setDocumentA(null);
      else setDocumentB(null);
      return;
    }

    const setLoading = side === 'A' ? setLoadingA : setLoadingB;
    const setDocument = side === 'A' ? setDocumentA : setDocumentB;

    setLoading(true);
    try {
      const doc = await api.canonicalDocument.getCanonicalDocumentById(documentId);
      if (doc) {
        setDocument(doc);
        if (side === 'A') {
          setDocumentAId(doc._id?.toString() || documentId);
        } else {
          setDocumentBId(doc._id?.toString() || documentId);
        }
      } else {
        toast.error('Document niet gevonden', `Het document met ID "${documentId}" kon niet worden gevonden. Controleer of het ID correct is.`);
        setDocument(null);
      }
    } catch (err) {
      logError(err, `Failed to load document ${documentId}`);
      const errorInfo = parseError(err);
      toast.error(errorInfo.title || 'Fout bij laden document', errorInfo.message || 'Het document kon niet worden geladen. Probeer het opnieuw.');
      setDocument(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      // Use search API endpoint
      const response = await api.get<{
        documents: CanonicalDocument[];
        total: number;
      }>(`/search?q=${encodeURIComponent(searchQuery)}&limit=20`);
      setSearchResults(response.documents || []);
    } catch (err) {
      logError(err, 'Document search failed');
      const errorInfo = parseError(err);
      toast.error(errorInfo.title || 'Zoeken mislukt', errorInfo.message || 'Het zoeken naar documenten is mislukt. Probeer het opnieuw.');
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSelectDocument = (document: CanonicalDocument, side: 'A' | 'B') => {
    const docId = document._id?.toString() || '';
    if (side === 'A') {
      setDocumentAId(docId);
      setDocumentA(document);
    } else {
      setDocumentBId(docId);
      setDocumentB(document);
    }
    setSearchQuery('');
    setSearchResults([]);
  };

  useEffect(() => {
    if (documentAId) {
      loadDocument(documentAId, 'A');
    }
  }, [documentAId]);

  useEffect(() => {
    if (documentBId) {
      loadDocument(documentBId, 'B');
    }
  }, [documentBId]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2">Document Comparison</h1>
        <p className="text-muted-foreground">
          Compare two documents to identify differences, matched concepts, and evidence
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Document A Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Document A</CardTitle>
            <CardDescription>Select the first document to compare</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-a-id">Document ID</Label>
              <div className="flex gap-2">
                <Input
                  id="doc-a-id"
                  value={documentAId}
                  onChange={(e) => setDocumentAId(e.target.value)}
                  placeholder="Enter document ID or search..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      loadDocument(documentAId, 'A');
                    }
                  }}
                />
                <Button onClick={() => loadDocument(documentAId, 'A')} disabled={loadingA}>
                  {loadingA ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load'}
                </Button>
              </div>
            </div>

            {/* Search for documents */}
            <div className="space-y-2">
              <Label htmlFor="search-a">Search Documents</Label>
              <div className="flex gap-2">
                <Input
                  id="search-a"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title or content..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                />
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </Button>
              </div>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                <p className="text-sm font-medium">Search Results</p>
                {searchResults.map((doc) => (
                  <div
                    key={(() => {
                      const docId = doc._id;
                      if (typeof docId === 'string') return docId;
                      if (docId && typeof docId === 'object' && 'toString' in docId && typeof (docId as { toString: () => string }).toString === 'function') {
                        return (docId as { toString: () => string }).toString();
                      }
                      return String(doc.url || '');
                    })()}
                    className="p-2 border rounded hover:bg-accent cursor-pointer"
                    onClick={() => handleSelectDocument(doc, 'A')}
                  >
                    <p className="text-sm font-medium">{String(doc.title || doc.url || '')}</p>
                    <p className="text-xs text-muted-foreground truncate">{String(doc.url || '')}</p>
                  </div>
                ))}
              </div>
            )}

            {documentA && (
              <div className="mt-4">
                <CanonicalDocumentCard document={documentA} />
              </div>
            )}

            {loadingA && (
              <div className="flex flex-col items-center justify-center p-4 space-y-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Document wordt geladen...</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Document B Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Document B</CardTitle>
            <CardDescription>Select the second document to compare</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="doc-b-id">Document ID</Label>
              <div className="flex gap-2">
                <Input
                  id="doc-b-id"
                  value={documentBId}
                  onChange={(e) => setDocumentBId(e.target.value)}
                  placeholder="Enter document ID or search..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      loadDocument(documentBId, 'B');
                    }
                  }}
                />
                <Button onClick={() => loadDocument(documentBId, 'B')} disabled={loadingB}>
                  {loadingB ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Load'}
                </Button>
              </div>
            </div>

            {documentB && (
              <div className="mt-4">
                <CanonicalDocumentCard document={documentB} />
              </div>
            )}

            {loadingB && (
              <div className="flex flex-col items-center justify-center p-4 space-y-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Document wordt geladen...</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Comparison View */}
      {documentAId && documentBId && (
        <DocumentComparisonView
          documentAId={documentAId}
          documentBId={documentBId}
          onDocumentSelect={(side, id) => {
            if (side === 'A') {
              setDocumentAId(id);
            } else {
              setDocumentBId(id);
            }
          }}
        />
      )}

      {(!documentAId || !documentBId) && (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>Select two documents above to begin comparison</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

