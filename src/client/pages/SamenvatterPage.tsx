/**
 * Samenvatter (Summarizer) Page
 * 
 * Page for viewing and generating document summaries.
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { FileText, Loader2, RefreshCw, Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import { documentSummarizationApi } from '../services/api/DocumentSummarizationApiService';
import { api } from '../services/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '../components/ui/alert';
import { toast } from 'sonner';
import type { CanonicalDocument } from '../services/api';
import DOMPurify from 'dompurify';

/**
 * Simple markdown renderer component
 * Converts basic markdown to HTML
 */
function MarkdownRenderer({ content }: { content: string }) {
  // Simple markdown to HTML conversion for basic formatting
  const renderMarkdown = (text: string): string => {
    let html = text;
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-4 mb-2">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 class="text-xl font-semibold mt-6 mb-3">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 class="text-2xl font-bold mt-8 mb-4">$1</h1>');
    
    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>');
    
    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em class="italic">$1</em>');
    
    // Lists
    html = html.replace(/^- (.*$)/gim, '<li class="ml-4">$1</li>');
    html = html.replace(/^(\d+)\. (.*$)/gim, '<li class="ml-4">$2</li>');
    
    // Wrap consecutive list items in ul
    html = html.replace(/(<li class="ml-4">.*<\/li>\n?)+/g, (match) => {
      return `<ul class="list-disc list-inside my-2 space-y-1">${match}</ul>`;
    });
    
    // Paragraphs (split by double newlines)
    const paragraphs = html.split(/\n\n+/);
    html = paragraphs
      .map(p => {
        const trimmed = p.trim();
        if (!trimmed) return '';
        // Don't wrap if already wrapped in HTML tags
        if (trimmed.startsWith('<')) return trimmed;
        return `<p class="mb-3">${trimmed}</p>`;
      })
      .join('\n');
    
    // Line breaks
    html = html.replace(/\n/g, '<br />');
    
    return html;
  };

  return (
    <div 
      className="prose prose-sm max-w-none"
      dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderMarkdown(content), { ADD_ATTR: ['class'] }) }}
    />
  );
}

export function SamenvatterPage() {
  const [documentId, setDocumentId] = useState<string>('');
  const [document, setDocument] = useState<CanonicalDocument | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [allDocuments, setAllDocuments] = useState<CanonicalDocument[]>([]);
  const [recentDocuments, setRecentDocuments] = useState<CanonicalDocument[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load summary when document is selected
  useEffect(() => {
    if (documentId) {
      loadSummary();
    } else {
      setSummary(null);
      setDocument(null);
    }
  }, [documentId]);

  // Load 10 most recent documents on mount
  useEffect(() => {
    const loadRecentDocuments = async () => {
      setLoadingRecent(true);
      try {
        const response = await api.canonicalDocument.getCanonicalDocuments({
          limit: 10,
          page: 1,
        });
        
        // Sort by createdAt (most recent first) - backend should return in this order, but ensure it
        const sorted = (response.data || []).sort((a, b) => {
          const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
          const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
          return dateB - dateA; // Most recent first
        });
        
        setRecentDocuments(sorted.slice(0, 10));
      } catch (err) {
        console.error('Error loading recent documents:', err);
        setRecentDocuments([]);
      } finally {
        setLoadingRecent(false);
      }
    };

    loadRecentDocuments();
  }, []);

  // Real-time filtered results based on search query, sorted chronologically (most recent first)
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }
    const queryLower = searchQuery.toLowerCase();
    const filtered = allDocuments.filter(doc =>
      doc.title.toLowerCase().includes(queryLower)
    );
    
    // Sort by date (most recent first) - chronological order
    return filtered.sort((a, b) => {
      const dateA = new Date(a.createdAt || a.updatedAt || 0).getTime();
      const dateB = new Date(b.createdAt || b.updatedAt || 0).getTime();
      return dateB - dateA; // Most recent first
    });
  }, [allDocuments, searchQuery]);

  // Debounced search: load documents when user stops typing
  useEffect(() => {
    // Clear previous timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // If search query is empty, clear results
    if (!searchQuery.trim()) {
      setAllDocuments([]);
      return;
    }

    // Set loading state
    setSearching(true);

    // Debounce: wait 300ms after user stops typing
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // Load more documents for better search results (increase limit)
        const response = await api.canonicalDocument.getCanonicalDocuments({
          limit: 200, // Increased from 20 to get more results
          page: 1,
        });
        
        setAllDocuments(response.data || []);
      } catch (err) {
        toast.error('Failed to search documents');
        console.error('Error searching documents:', err);
        setAllDocuments([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    // Cleanup timeout on unmount or when searchQuery changes
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const loadSummary = async () => {
    if (!documentId) return;

    setLoading(true);
    setError(null);
    try {
      const response = await documentSummarizationApi.getSummary(documentId);
      if (response) {
        setSummary(response.summary);
      } else {
        setSummary(null);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load summary';
      setError(errorMessage);
      console.error('Error loading summary:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadDocument = async (id: string) => {
    try {
      const doc = await api.canonicalDocument.getCanonicalDocumentById(id);
      setDocument(doc);
      setDocumentId(id);
      // Don't clear search query or documents - keep them for better UX
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load document';
      toast.error(errorMessage);
      console.error('Error loading document:', err);
    }
  };

  // Manual search trigger (for Enter key or button click)
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setAllDocuments([]);
      return;
    }

    // Clear any pending timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setSearching(true);
    try {
      const response = await api.canonicalDocument.getCanonicalDocuments({
        limit: 200, // Increased limit for better search coverage
        page: 1,
      });
      
      setAllDocuments(response.data || []);
    } catch (err) {
      toast.error('Failed to search documents');
      console.error('Error searching documents:', err);
      setAllDocuments([]);
    } finally {
      setSearching(false);
    }
  };

  const handleGenerateSummary = async (forceRegenerate: boolean = false) => {
    if (!documentId) {
      toast.error('Please select a document first');
      return;
    }

    setGenerating(true);
    setError(null);
    try {
      const response = await documentSummarizationApi.generateSummary(documentId, forceRegenerate);
      setSummary(response.summary);
      toast.success(forceRegenerate ? 'Summary regenerated successfully' : 'Summary generated successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate summary';
      setError(errorMessage);
      toast.error(errorMessage);
      console.error('Error generating summary:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleRegenerateSummary = async () => {
    await handleGenerateSummary(true);
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl h-full flex flex-col">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
          <FileText className="h-8 w-8 text-blue-600" />
          Samenvatter
        </h1>
        <p className="text-muted-foreground">
          Genereer en bekijk samenvattingen van documenten in de bibliotheek
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1">
        {/* Left column: Document selection */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Document Selecteren</CardTitle>
              <CardDescription>
                Zoek en selecteer een document om een samenvatting te genereren
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Zoek op titel... (resultaten verschijnen automatisch)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSearch();
                    }
                  }}
                />
                <Button onClick={handleSearch} disabled={searching}>
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4" />
                  )}
                </Button>
              </div>

              {/* Show search results when searching, otherwise show recent documents */}
              {searchQuery.trim() ? (
                searching ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    <span className="ml-2 text-sm text-muted-foreground">Zoeken...</span>
                  </div>
                ) : searchResults.length > 0 ? (
                  <div className="border rounded-lg max-h-96 overflow-y-auto">
                    <div className="p-2 text-xs text-muted-foreground border-b bg-gray-50">
                      {searchResults.length} resultaat{searchResults.length !== 1 ? 'en' : ''} gevonden
                    </div>
                    {searchResults.map((doc) => (
                      <button
                        key={doc._id}
                        onClick={() => loadDocument(doc._id)}
                        className={`w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0 ${
                          documentId === doc._id ? 'bg-blue-50 border-blue-200' : ''
                        }`}
                      >
                        <div className="font-medium">{doc.title}</div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {doc.source} • {doc.documentType}
                        </div>
                        {doc.createdAt && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(doc.createdAt).toLocaleDateString('nl-NL')}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground text-sm">
                    Geen documenten gevonden voor "{searchQuery}"
                  </div>
                )
              ) : (
                <>
                  {loadingRecent ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                  ) : recentDocuments.length > 0 ? (
                    <div className="border rounded-lg max-h-96 overflow-y-auto">
                      <div className="p-2 text-xs text-muted-foreground border-b bg-gray-50">
                        Meest recente documenten
                      </div>
                      {recentDocuments.map((doc) => (
                        <button
                          key={doc._id}
                          onClick={() => loadDocument(doc._id)}
                          className={`w-full text-left p-3 hover:bg-gray-50 border-b last:border-b-0 ${
                            documentId === doc._id ? 'bg-blue-50 border-blue-200' : ''
                          }`}
                        >
                          <div className="font-medium">{doc.title}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {doc.source} • {doc.documentType}
                          </div>
                          {doc.createdAt && (
                            <div className="text-xs text-muted-foreground mt-1">
                              {new Date(doc.createdAt).toLocaleDateString('nl-NL')}
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      Geen recente documenten beschikbaar
                    </div>
                  )}
                </>
              )}

              {document && (
                <div className="border rounded-lg p-4 bg-gray-50">
                  <div className="font-semibold mb-2">{document.title}</div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <div>Bron: {document.source}</div>
                    <div>Type: {document.documentType}</div>
                    {document.dates.publishedAt && (
                      <div>
                        Gepubliceerd: {new Date(document.dates.publishedAt).toLocaleDateString('nl-NL')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Summary display and controls */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Samenvatting</CardTitle>
                  <CardDescription>
                    {summary ? 'Bestaande samenvatting' : 'Geen samenvatting beschikbaar'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  {summary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRegenerateSummary}
                      disabled={generating || !documentId}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Opnieuw genereren
                    </Button>
                  )}
                  <Button
                    onClick={() => handleGenerateSummary(false)}
                    disabled={generating || !documentId}
                  >
                    {generating ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Genereren...
                      </>
                    ) : summary ? (
                      'Opnieuw genereren'
                    ) : (
                      'Genereer samenvatting'
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {error && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Fout</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              )}

              {!loading && !documentId && (
                <div className="text-center py-8 text-muted-foreground">
                  Selecteer een document om een samenvatting te bekijken of te genereren
                </div>
              )}

              {!loading && documentId && !summary && !generating && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Geen samenvatting</AlertTitle>
                  <AlertDescription>
                    Er is nog geen samenvatting voor dit document. Klik op "Genereer samenvatting" om er een aan te maken.
                  </AlertDescription>
                </Alert>
              )}

              {generating && (
                <div className="flex flex-col items-center justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-600 mb-4" />
                  <p className="text-muted-foreground">Samenvatting wordt gegenereerd...</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Dit kan even duren voor grote documenten
                  </p>
                </div>
              )}

              {summary && !generating && (
                <div className="border rounded-lg p-4 bg-white">
                  <div className="flex items-center gap-2 mb-3 text-sm text-green-600">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Samenvatting beschikbaar</span>
                  </div>
                  <div className="prose prose-sm max-w-none">
                    <MarkdownRenderer content={summary} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
