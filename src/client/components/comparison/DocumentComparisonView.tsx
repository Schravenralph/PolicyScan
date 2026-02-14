/**
 * Document Comparison View Component
 * 
 * Displays structured document-to-document comparison results including:
 * - Matched concepts with evidence bundles
 * - Differences (changed, conflicting, A-only, B-only)
 * - Confidence scores
 * - Summary statistics
 * 
 * @see docs/21-issues/WI-COMPARISON-001-structured-document-comparison.md
 */

import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Loader2, FileText, AlertCircle, CheckCircle2, XCircle, ArrowLeftRight, Info, Eye } from 'lucide-react';
import { api } from '../../services/api';
import type { CanonicalDocument } from '../../services/api';
import { toast } from '../../utils/toast';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';

interface DocumentComparisonViewProps {
  documentAId?: string;
  documentBId?: string;
  onDocumentSelect?: (side: 'A' | 'B', documentId: string) => void;
}

interface ComparisonResult {
  documentA: CanonicalDocument;
  documentB: CanonicalDocument;
  comparisonId: string;
  matchedConcepts: MatchedConcept[];
  differences: DocumentDifference[];
  summary: ComparisonSummary;
  confidence: number;
  metadata: ComparisonMetadata;
}

interface MatchedConcept {
  concept: string;
  normType: 'regulation' | 'requirement' | 'policy' | 'procedure';
  evidenceA: EvidenceBundle;
  evidenceB: EvidenceBundle;
  status: 'identical' | 'changed' | 'conflicting' | 'a-only' | 'b-only';
  delta?: ConceptDelta;
  confidence: number;
  impact?: string;
}

interface DocumentDifference {
  category: 'regulation' | 'requirement' | 'policy' | 'procedure' | 'metadata';
  concept: string;
  status: 'a-only' | 'b-only' | 'changed' | 'conflicting';
  evidenceA?: EvidenceBundle;
  evidenceB?: EvidenceBundle;
  delta?: ConceptDelta;
  confidence: number;
  impact: string;
}

interface EvidenceBundle {
  documentId: string;
  chunks: ChunkEvidence[];
  citations: Citation[];
  confidence: number;
}

interface ChunkEvidence {
  chunkId: string;
  text: string;
  offsets: { start: number; end: number };
  relevanceScore: number;
}

interface Citation {
  chunkId: string;
  text: string;
  offsets: { start: number; end: number };
  pageNumber?: number;
  section?: string;
}

interface ConceptDelta {
  type: 'added' | 'removed' | 'modified' | 'conflicting';
  oldValue?: string;
  newValue?: string;
  changeDescription: string;
}

interface ComparisonSummary {
  totalConcepts: number;
  identical: number;
  changed: number;
  conflicting: number;
  aOnly: number;
  bOnly: number;
  overallSimilarity: number;
  keyDifferences: string[];
}

interface ComparisonMetadata {
  comparisonDate: string;
  comparisonStrategy: 'semantic' | 'structured' | 'hybrid';
  extractionMethod: 'llm' | 'rule-based' | 'hybrid';
  processingTime: number;
}

export function DocumentComparisonView({
  documentAId,
  documentBId,
  onDocumentSelect: _onDocumentSelect,
}: DocumentComparisonViewProps) {
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedConceptDelta, setSelectedConceptDelta] = useState<{ concept: string; delta: ConceptDelta } | null>(null);

  const handleCompare = async () => {
    if (!documentAId || !documentBId) {
      toast.error(t('toastMessages.pleaseSelectBothDocuments'));
      return;
    }

    if (documentAId === documentBId) {
      toast.error(t('toastMessages.pleaseSelectTwoDifferentDocuments'));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await api.compareDocuments(documentAId, documentBId, {
        strategy: 'hybrid',
        extractionMethod: 'hybrid',
        includeMetadata: true,
      });
      setComparison(result);
      toast.success(t('toastMessages.documentComparisonCompleted'));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : t('test.failedToCompareDocuments');
      setError(errorMessage);
      logError(err, 'Document comparison failed');
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'identical':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'changed':
        return <ArrowLeftRight className="w-4 h-4 text-yellow-500" />;
      case 'conflicting':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'a-only':
      case 'b-only':
        return <Info className="w-4 h-4 text-blue-500" />;
      default:
        return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      identical: 'default',
      changed: 'secondary',
      conflicting: 'destructive',
      'a-only': 'outline',
      'b-only': 'outline',
    };

    return (
      <Badge variant={variants[status] || 'default'}>
        {status}
      </Badge>
    );
  };

  if (!documentAId || !documentBId) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>{t('toastMessages.pleaseSelectBothDocuments')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('documentComparison.title')}</CardTitle>
          <CardDescription>
            {t('documentComparison.description')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-4">
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">{t('documentComparison.documentA')}</p>
              <p className="text-xs text-muted-foreground">{documentAId}</p>
            </div>
            <ArrowLeftRight className="w-5 h-5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium mb-1">{t('documentComparison.documentB')}</p>
              <p className="text-xs text-muted-foreground">{documentBId}</p>
            </div>
            <Button onClick={handleCompare} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {t('documentComparison.comparing')}
                </>
              ) : (
                t('documentComparison.compareDocuments')
              )}
            </Button>
          </div>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      {comparison && (
        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="summary">{t('documentComparison.summary')}</TabsTrigger>
            <TabsTrigger value="concepts">{t('documentComparison.matchedConcepts')}</TabsTrigger>
            <TabsTrigger value="differences">{t('documentComparison.differences')}</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('documentComparison.comparisonSummary')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('documentComparison.totalConcepts')}</p>
                    <p className="text-2xl font-bold">{comparison.summary.totalConcepts}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('documentComparison.identical')}</p>
                    <p className="text-2xl font-bold text-green-600">{comparison.summary.identical}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('documentComparison.changed')}</p>
                    <p className="text-2xl font-bold text-yellow-600">{comparison.summary.changed}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('documentComparison.conflicting')}</p>
                    <p className="text-2xl font-bold text-red-600">{comparison.summary.conflicting}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <p className="text-sm text-muted-foreground">{t('documentComparison.overallSimilarity')}</p>
                    <p className="text-2xl font-bold">
                      {(comparison.summary.overallSimilarity * 100).toFixed(1)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('documentComparison.confidence')}</p>
                    <p className="text-2xl font-bold">
                      {(comparison.confidence * 100).toFixed(1)}%
                    </p>
                  </div>
                </div>
                {comparison.summary.keyDifferences.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">{t('documentComparison.keyDifferences')}</p>
                    <ul className="list-disc list-inside space-y-1">
                      {comparison.summary.keyDifferences.map((diff, idx) => (
                        <li key={idx} className="text-sm">{diff}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    {t('documentComparison.strategy')}: {comparison.metadata.comparisonStrategy} | 
                    {t('documentComparison.method')}: {comparison.metadata.extractionMethod} | 
                    {t('documentComparison.processingTime')}: {comparison.metadata.processingTime}ms
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="concepts" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('documentComparison.matchedConcepts')} ({comparison.matchedConcepts.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {comparison.matchedConcepts.map((concept, idx) => (
                      <Card key={idx} className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(concept.status)}
                            <h4 className="font-semibold">{concept.concept}</h4>
                            <Badge variant="outline">{concept.normType}</Badge>
                            {getStatusBadge(concept.status)}
                          </div>
                          <Badge variant="secondary">
                            {(concept.confidence * 100).toFixed(0)}{t('documentComparison.confidencePercent')}
                          </Badge>
                        </div>
                        {concept.delta && (
                          <div className="mb-2 p-2 bg-background rounded border border-border">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm">
                                  <strong>{t('documentComparison.change')}</strong> {concept.delta.changeDescription}
                                </p>
                                {concept.delta.oldValue && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {t('documentComparison.old')} {concept.delta.oldValue}
                                  </p>
                                )}
                                {concept.delta.newValue && (
                                  <p className="text-xs text-muted-foreground">
                                    {t('documentComparison.new')} {concept.delta.newValue}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedConceptDelta({ concept: concept.concept, delta: concept.delta! })}
                                className="flex-shrink-0"
                                aria-label={t('documentComparison.viewDetails')}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        {concept.impact && (
                          <p className="text-sm text-muted-foreground mb-2">
                            <strong>{t('documentComparison.impact')}</strong> {concept.impact}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-4 mt-2">
                          <div>
                            <p className="text-xs font-medium mb-1">{t('documentComparison.evidenceA')}</p>
                            <p className="text-xs text-muted-foreground">
                              {concept.evidenceA.chunks.length} {t('documentComparison.chunks')}, 
                              confidence: {(concept.evidenceA.confidence * 100).toFixed(0)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium mb-1">{t('documentComparison.evidenceB')}</p>
                            <p className="text-xs text-muted-foreground">
                              {concept.evidenceB.chunks.length} {t('documentComparison.chunks')}, 
                              confidence: {(concept.evidenceB.confidence * 100).toFixed(0)}%
                            </p>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="differences" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>{t('documentComparison.differences')} ({comparison.differences.length})</CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[600px]">
                  <div className="space-y-4">
                    {comparison.differences.map((diff, idx) => (
                      <Card key={idx} className="p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            {getStatusIcon(diff.status)}
                            <h4 className="font-semibold">{diff.concept}</h4>
                            <Badge variant="outline">{diff.category}</Badge>
                            {getStatusBadge(diff.status)}
                          </div>
                          <Badge variant="secondary">
                            {(diff.confidence * 100).toFixed(0)}{t('documentComparison.confidencePercent')}
                          </Badge>
                        </div>
                        <p className="text-sm mb-2">
                          <strong>{t('documentComparison.impact')}</strong> {diff.impact}
                        </p>
                        {diff.delta && (
                          <div className="mb-2 p-2 bg-background rounded border border-border">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <p className="text-sm">
                                  <strong>{t('documentComparison.change')}</strong> {diff.delta.changeDescription}
                                </p>
                                {diff.delta.oldValue && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {t('documentComparison.old')} {diff.delta.oldValue}
                                  </p>
                                )}
                                {diff.delta.newValue && (
                                  <p className="text-xs text-muted-foreground">
                                    {t('documentComparison.new')} {diff.delta.newValue}
                                  </p>
                                )}
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setSelectedConceptDelta({ concept: diff.concept, delta: diff.delta! })}
                                className="flex-shrink-0"
                                aria-label={t('documentComparison.viewDetails')}
                              >
                                <Eye className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Concept Difference Dialog */}
      <Dialog open={!!selectedConceptDelta} onOpenChange={(open) => !open && setSelectedConceptDelta(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {t('documentComparison.conceptDifference')}: {selectedConceptDelta?.concept}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {t('documentComparison.conceptDifferenceDescription')}
            </DialogDescription>
          </DialogHeader>
          {selectedConceptDelta && (
            <div className="space-y-4 mt-4">
              <div className="p-4 rounded-lg border bg-background border-border">
                <p className="text-sm font-semibold mb-2 text-foreground">
                  {t('documentComparison.changeType')}
                </p>
                <Badge variant={
                  selectedConceptDelta.delta.type === 'conflicting' ? 'destructive' :
                  selectedConceptDelta.delta.type === 'modified' ? 'secondary' :
                  'default'
                }>
                  {selectedConceptDelta.delta.type}
                </Badge>
              </div>
              
              <div className="p-4 rounded-lg border bg-background border-border">
                <p className="text-sm font-semibold mb-2 text-foreground">
                  {t('documentComparison.changeDescription')}
                </p>
                <p className="text-sm text-foreground">
                  {selectedConceptDelta.delta.changeDescription}
                </p>
              </div>

              {selectedConceptDelta.delta.oldValue && (
                <div className="p-4 rounded-lg border bg-background border-border">
                  <p className="text-sm font-semibold mb-2 text-foreground">
                    {t('documentComparison.oldValue')}
                  </p>
                  <p className="text-sm text-foreground bg-background p-3 rounded border border-border">
                    {selectedConceptDelta.delta.oldValue}
                  </p>
                </div>
              )}

              {selectedConceptDelta.delta.newValue && (
                <div className="p-4 rounded-lg border bg-background border-border">
                  <p className="text-sm font-semibold mb-2 text-foreground">
                    {t('documentComparison.newValue')}
                  </p>
                  <p className="text-sm text-foreground bg-background p-3 rounded border border-border">
                    {selectedConceptDelta.delta.newValue}
                  </p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


