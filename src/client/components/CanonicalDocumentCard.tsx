import React, { useState, useMemo, useEffect, memo } from 'react';
import { ExternalLink, CheckCircle2, XCircle, Info, Loader2, Copy, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from './ui/button';
import { Label } from './ui/label';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from './ui/tooltip';
import { t } from '../utils/i18n';
import { DocumentMetadataBadge, type DocumentMetadata } from './DocumentMetadataBadge';
import { PublicationTypeBadge } from './wizard/PublicationTypeBadge';
import { DocumentTagEditor } from './DocumentTagEditor';
import { DocumentCollectionSelector } from './DocumentCollectionSelector';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { api } from '../services/api';
import { getStrategyDescription } from '../utils/aiCrawlingUtils';
import { logError } from '../utils/errorHandler';
import type { CanonicalDocument } from '../services/api';
import type { LightweightDocument } from '../utils/documentStateOptimization';
import {
  getCanonicalDocumentTitle,
  getCanonicalDocumentUrl,
  getCanonicalDocumentStatus,
  getCanonicalDocumentId,
  getCanonicalDocumentSummary,
} from '../utils/canonicalDocumentUtils';

export interface CanonicalDocumentCardProps {
    document: CanonicalDocument | LightweightDocument;
    onStatusChange?: (id: string, status: 'approved' | 'rejected' | 'pending') => void;
    onDocumentClick?: (documentId: string) => void;
    searchQuery?: string; // For highlighting search terms
}

// Highlight search terms in text
const highlightText = (text: string, searchQuery?: string): React.ReactNode => {
    if (!searchQuery || !text) return text;
    
    const query = searchQuery.trim();
    if (!query) return text;
    
     
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => {
        if (part.toLowerCase() === query.toLowerCase()) {
            return (
                <mark
                    key={index}
                    className="bg-yellow-300 text-foreground px-0.5 rounded-sm"
                >
                    {part}
                </mark>
            );
        }
        return part;
    });
};

interface DocumentExplanation {
    explanation: string;
    detailedExplanation: string;
    strategy: string;
    confidence?: number;
    reasoning?: string;
    traceId?: string;
    baseUrl?: string;
    query?: string;
    crawlDate?: Date;
    decisionPath?: Array<{
        step: number;
        decisionType: string;
        reasoning?: string;
        timestamp?: Date;
    }>;
}

export const CanonicalDocumentCard = memo(function CanonicalDocumentCard({ document, onStatusChange, onDocumentClick, searchQuery }: CanonicalDocumentCardProps) {
    const navigate = useNavigate();
    const [showExplanation, setShowExplanation] = useState(false);
    const [explanation, setExplanation] = useState<DocumentExplanation | null>(null);
    const [loadingExplanation, setLoadingExplanation] = useState(false);
    const [explanationError, setExplanationError] = useState<string | null>(null);
    const [updatingStatus, setUpdatingStatus] = useState<'approved' | 'rejected' | null>(null);
    const [copied, setCopied] = useState(false);
    const [summaryExpanded, setSummaryExpanded] = useState(false);

    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        if (copied) {
            timeout = setTimeout(() => setCopied(false), 2000);
        }
        return () => clearTimeout(timeout);
    }, [copied]);

    // Extract data from canonical document
    const documentData = useMemo(() => {
        const sourceMetadata = (document.sourceMetadata || {}) as Record<string, unknown>;
        const enrichmentMetadata = (document.enrichmentMetadata || {}) as Record<string, unknown>;
        
        // Extract legacy fields from sourceMetadata
        const legacyUrl = sourceMetadata.legacyUrl as string | undefined;
        const legacyWebsiteUrl = sourceMetadata.legacyWebsiteUrl as string | undefined;
        const legacyLabel = sourceMetadata.legacyLabel as string | undefined;
        const legacyRelevance = (sourceMetadata.legacyRelevance || sourceMetadata.legacyRelevantie) as string | undefined;
        const legacyThemes = (sourceMetadata.legacyThemes ?? enrichmentMetadata.themes) as string[] | undefined;
        const legacyIssuingAuthority = (sourceMetadata.legacyIssuingAuthority ?? enrichmentMetadata.issuingAuthority) as string | null | undefined;
        const legacyDocumentStatus = enrichmentMetadata.documentStatus as string | null | undefined;
        const legacyMetadataConfidence = enrichmentMetadata.metadataConfidence as number | undefined;
        const hierarchyLevel = (enrichmentMetadata.hierarchyLevel || sourceMetadata.hierarchyLevel) as 'municipality' | 'province' | 'national' | 'european' | undefined;
        const jurisdictionId = (enrichmentMetadata.jurisdictionId || sourceMetadata.jurisdictionId) as string | undefined;

        // Use utility function for consistent summary extraction
        const samenvatting = getCanonicalDocumentSummary(document, 300);

        const documentId = getCanonicalDocumentId(document) || String(Date.now());
        const documentUrl = getCanonicalDocumentUrl(document) || legacyUrl || legacyWebsiteUrl || '';
        const documentTitle = getCanonicalDocumentTitle(document);
        const documentStatus = getCanonicalDocumentStatus(document);

        const dates = document.dates as { publishedAt?: Date | string } | undefined;
        const metadata: DocumentMetadata = {
            documentType: (document.documentType || null) as string | null,
            publicationDate: dates?.publishedAt ? (typeof dates.publishedAt === 'string' ? dates.publishedAt : dates.publishedAt.toISOString().split('T')[0]) : null,
            themes: legacyThemes || [],
            issuingAuthority: legacyIssuingAuthority || null,
            documentStatus: legacyDocumentStatus || null,
            metadataConfidence: legacyMetadataConfidence,
            hierarchyLevel,
            jurisdictionId,
        };

        return {
            id: documentId,
            _id: document._id,
            titel: documentTitle,
            url: documentUrl,
            samenvatting: samenvatting,
            relevantie: legacyRelevance || '',
            bron: legacyLabel || document.documentType || 'Document',
            status: documentStatus,
            type: 'document' as const,
            metadata,
        };
    }, [document]);

    // Memoize highlighted text to prevent recalculation on unrelated renders
    const highlightedTitle = useMemo(() => highlightText(documentData.titel, searchQuery), [documentData.titel, searchQuery]);
    const highlightedSummary = useMemo(() => highlightText(documentData.samenvatting, searchQuery), [documentData.samenvatting, searchQuery]);
    const highlightedRelevance = useMemo(() => highlightText(documentData.relevantie, searchQuery), [documentData.relevantie, searchQuery]);

    const getBorderClass = () => {
        if (documentData.status === 'approved') return 'border-primary/30';
        if (documentData.status === 'rejected') return 'border-accent/30';
        return 'border-muted';
    };

    const getBackgroundClass = () => {
        if (documentData.status === 'approved') return 'bg-primary/10';
        if (documentData.status === 'rejected') return 'bg-accent/10';
        return 'bg-card';
    };

    const handleStatusUpdate = async (status: 'approved' | 'rejected') => {
        if (updatingStatus || !onStatusChange) return;
        setUpdatingStatus(status);
        try {
            await onStatusChange(documentData.id, status);
        } finally {
            setUpdatingStatus(null);
        }
    };

    const handleShowExplanation = async () => {
        setShowExplanation(true);
        setExplanationError(null);
        // Only fetch if we don't already have the explanation cached
        // This prevents refetching when user closes and reopens the dialog
        if (!explanation && !loadingExplanation) {
            setLoadingExplanation(true);
            try {
                const exp = await api.getDocumentExplanation(documentData.url);
                if (exp) {
                    setExplanation(exp);
                } else {
                    setExplanationError('Geen uitleg beschikbaar');
                }
            } catch (error) {
                logError(error, 'load-explanation');
                setExplanationError('Kon uitleg niet laden. Probeer het later opnieuw.');
            } finally {
                setLoadingExplanation(false);
            }
        }
    };
    
    // Reset explanation when dialog closes to allow refetch if needed
    const handleDialogClose = (open: boolean) => {
        if (!open) {
            // Keep explanation cached, but reset error
            setExplanationError(null);
            setCopied(false);
        }
        setShowExplanation(open);
    };

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
        } catch (err) {
            console.error('Failed to copy text:', err);
        }
    };

    return (
        <Card
            data-testid={`canonical-card-${documentData.id || documentData._id || 'unknown'}`}
            className={`p-6 border-2 transition-all ${getBackgroundClass()} ${getBorderClass()}`}
        >
            <div className="flex justify-between items-start gap-4">
                <div className="flex-1">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-2">
                                <h4 className="flex-1 font-serif font-semibold text-xl text-foreground">
                                    <button
                                        type="button"
                                        className="text-left hover:opacity-70 transition-opacity w-full focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-sm"
                                        onClick={() => {
                                            if (documentData.id && onDocumentClick) {
                                                onDocumentClick(documentData.id);
                                            }
                                        }}
                                    >
                                        {highlightedTitle}
                                    </button>
                                </h4>
                                <PublicationTypeBadge
                                    publicationType={(documentData.metadata?.documentType || null) as string | null | undefined}
                                    documentType={(documentData.metadata?.documentType || null) as string | null | undefined}
                                />
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                {documentData.url ? (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <a
                                                href={documentData.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 hover:opacity-70 transition-opacity text-primary hover:underline focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-sm max-w-[200px] sm:max-w-[300px]"
                                                onClick={(e) => {
                                                    // Allow default link behavior - open in new tab
                                                    e.stopPropagation();
                                                }}
                                            >
                                                <ExternalLink className="w-4 h-4 flex-shrink-0" />
                                                <span className="truncate">{documentData.url}</span>
                                                <span className="sr-only">{t('common.openInNewTab')}</span>
                                            </a>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            <p className="max-w-md break-all">{documentData.url}</p>
                                        </TooltipContent>
                                    </Tooltip>
                                ) : (
                                    <span className="text-muted-foreground italic text-xs">
                                        Geen URL beschikbaar
                                    </span>
                                )}
                                <span
                                    className="px-2 py-1 rounded text-xs bg-muted-foreground/10 text-muted-foreground"
                                >
                                    {String(documentData.bron)}
                                </span>
                                <span className="px-2 py-1 rounded text-xs bg-accent/10 text-accent">
                                    {t('bronCard.document')}
                                </span>
                                {(() => {
                                    const reviewStatus = (document as { reviewStatus?: string }).reviewStatus;
                                    if (!reviewStatus) return null;
                                    return (
                                        <Badge 
                                            variant={
                                                reviewStatus === 'approved' ? 'default' :
                                                reviewStatus === 'rejected' ? 'destructive' :
                                                reviewStatus === 'needs_revision' ? 'secondary' :
                                                'outline'
                                            }
                                        >
                                            {reviewStatus === 'pending_review' ? t('common.pendingReview') :
                                             reviewStatus === 'approved' ? t('common.approved') :
                                             reviewStatus === 'rejected' ? t('common.rejected') :
                                             t('common.revisionNeeded')}
                                        </Badge>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* Samenvatting */}
                    {documentData.samenvatting && (
                        <div className="mb-4">
                            <Label className="block mb-2 text-foreground font-semibold">
                                Samenvatting
                            </Label>
                            <div className="space-y-2">
                                <p className={`text-sm text-foreground leading-relaxed ${!summaryExpanded && documentData.samenvatting.length > 200 ? 'line-clamp-3' : ''}`}>
                                    {highlightedSummary || documentData.samenvatting}
                                </p>
                                {documentData.samenvatting.length > 200 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setSummaryExpanded(!summaryExpanded)}
                                        className="h-auto p-0 text-xs text-primary hover:text-primary/80"
                                    >
                                        {summaryExpanded ? 'Toon minder' : 'Toon meer'}
                                    </Button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Relevantie */}
                    <div className="mb-4">
                        <Label className="block mb-2 text-foreground">
                            Relevantie voor uw zoekopdracht
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {highlightedRelevance}
                        </p>
                    </div>

                    {/* Metadata */}
                    {documentData.metadata && (
                        <div className="mb-4">
                            <DocumentMetadataBadge metadata={documentData.metadata} />
                        </div>
                    )}

                    {/* Hierarchy Badge - if document has hierarchy info */}
                    {documentData.metadata?.hierarchyLevel && (
                        <div className="mb-4">
                            <Badge variant="outline" className="mr-2">
                                {documentData.metadata.hierarchyLevel === 'municipality' && 'Gemeente'}
                                {documentData.metadata.hierarchyLevel === 'province' && 'Provincie'}
                                {documentData.metadata.hierarchyLevel === 'national' && 'Nationaal'}
                                {documentData.metadata.hierarchyLevel === 'european' && 'Europees'}
                            </Badge>
                            <Button
                                variant="link"
                                size="sm"
                                onClick={() => {
                                    navigate(`/hierarchy${documentData.metadata?.jurisdictionId ? `?id=${documentData.metadata.jurisdictionId}` : ''}`);
                                }}
                            >
                                Bekijk hiërarchie
                            </Button>
                        </div>
                    )}

                    {/* Tags */}
                    <div className="mb-4">
                        <Label className="block mb-2 text-foreground font-semibold">
                            Tags
                        </Label>
                        <DocumentTagEditor
                            documentId={documentData.id}
                            currentTags={(document as any).tags || []}
                            onTagsChange={(_tagIds) => {
                                // Update local document state if needed
                                // The parent component should handle the actual update
                            }}
                        />
                    </div>

                    {/* Collections */}
                    <div className="mb-4">
                        <Label className="block mb-2 text-foreground font-semibold">
                            Collections
                        </Label>
                        <DocumentCollectionSelector
                            documentId={documentData.id}
                            currentCollectionIds={(document as any).collectionIds || []}
                            onCollectionsChange={(_collectionIds) => {
                                // Update local document state if needed
                                // The parent component should handle the actual update
                            }}
                        />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        {onStatusChange && (
                            <>
                                <Button
                                    onClick={() => handleStatusUpdate('approved')}
                                    disabled={updatingStatus !== null}
                                    variant={documentData.status === 'approved' ? 'default' : 'outline'}
                                    className={`flex items-center gap-2 ${
                                        documentData.status === 'approved'
                                            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                            : 'border-primary text-primary hover:bg-primary/10'
                                    }`}
                                >
                                    {updatingStatus === 'approved' ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <CheckCircle2 className="w-4 h-4" />
                                    )}
                                    {documentData.status === 'approved' ? t('step3.approved') : t('documentCard.suitable')}
                                </Button>
                                <Button
                                    onClick={() => handleStatusUpdate('rejected')}
                                    disabled={updatingStatus !== null}
                                    variant={documentData.status === 'rejected' ? 'default' : 'outline'}
                                    className={`flex items-center gap-2 ${
                                        documentData.status === 'rejected'
                                            ? 'bg-accent text-accent-foreground hover:bg-accent/90'
                                            : 'border-accent text-accent hover:bg-accent/10'
                                    }`}
                                >
                                    {updatingStatus === 'rejected' ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <XCircle className="w-4 h-4" />
                                    )}
                                    {documentData.status === 'rejected' ? t('documentCard.rejected') : t('documentCard.notSuitable')}
                                </Button>
                            </>
                        )}
                        <Button
                            onClick={handleShowExplanation}
                            variant="outline"
                            className="flex items-center gap-2"
                            title={t('documentCard.whyFound')}
                            aria-label={t('documentCard.whyFound')}
                        >
                            <Info className="w-4 h-4" />
                            {t('documentCard.explanation')}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Document Explanation Dialog */}
            <Dialog open={showExplanation} onOpenChange={handleDialogClose}>
                <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('documentCard.whyFound')}</DialogTitle>
                        <DialogDescription>
                            {t('documentCard.whyFoundDescription')}
                        </DialogDescription>
                    </DialogHeader>
                    {loadingExplanation ? (
                        <div className="flex items-center justify-center p-12" role="status">
                            <Loader2 className="w-8 h-8 animate-spin text-primary" />
                            <span className="sr-only">{t('documentCard.loadingExplanation')}</span>
                        </div>
                    ) : explanationError ? (
                        <div className="text-center text-red-500 p-8">
                            {explanationError}
                        </div>
                    ) : explanation ? (
                        <div className="space-y-4 mt-4">
                            <div>
                                <h3 className="font-semibold mb-2">{t('documentCard.strategy')}</h3>
                                <p className="text-sm text-gray-600">
                                    {getStrategyDescription(explanation.strategy)}
                                </p>
                            </div>
                            {explanation.confidence !== undefined && (
                                <div>
                                    <h3 className="font-semibold mb-2">{t('documentCard.confidence')}</h3>
                                    <p className="text-sm text-gray-600">
                                        {(explanation.confidence * 100).toFixed(0)}% - {
                                            explanation.confidence >= 0.8 ? t('documentCard.confidence.high') :
                                            explanation.confidence >= 0.5 ? t('documentCard.confidence.medium') :
                                            t('documentCard.confidence.low')
                                        }
                                    </p>
                                </div>
                            )}
                            {explanation.reasoning && (
                                <div>
                                    <h3 className="font-semibold mb-2">{t('documentCard.reasoning')}</h3>
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{explanation.reasoning}</p>
                                </div>
                            )}
                            {explanation.detailedExplanation && (
                                <div>
                                    <h3 className="font-semibold mb-2">{t('documentCard.detailedExplanation')}</h3>
                                    <div className="relative group">
                                        <pre className="text-sm text-gray-600 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 p-3 rounded overflow-x-auto pr-10">
                                            {explanation.detailedExplanation}
                                        </pre>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="absolute top-2 right-2 h-8 w-8 bg-background/50 hover:bg-background/80 shadow-sm opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                                            onClick={() => handleCopy(explanation.detailedExplanation)}
                                            title={t('documentCard.copyExplanation')}
                                        >
                                            {copied ? (
                                                <Check className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <Copy className="h-4 w-4 text-muted-foreground" />
                                            )}
                                            <span className="sr-only">{copied ? 'Gekopieerd' : 'Kopiëren'}</span>
                                        </Button>
                                    </div>
                                </div>
                            )}
                            {explanation.decisionPath && explanation.decisionPath.length > 0 && (
                                <div>
                                    <h3 className="font-semibold mb-2">Beslissingspad</h3>
                                    <div className="space-y-2">
                                        {explanation.decisionPath.map((step, index: number) => (
                                            <div key={index} className="border-l-2 border-blue-500 pl-4 py-2">
                                                <div className="font-medium text-sm">{step.step}. {step.decisionType}</div>
                                                {step.reasoning && (
                                                    <div className="text-xs text-gray-600 mt-1">{step.reasoning}</div>
                                                )}
                                                {step.timestamp && (
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {new Date(step.timestamp).toLocaleString('nl-NL')}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center text-gray-500 p-8">
                            Geen uitleg beschikbaar voor dit document. Dit document is mogelijk niet gevonden via AI-geleide crawling.
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </Card>
    );
});
