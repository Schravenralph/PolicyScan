import React, { useState, memo, useMemo } from 'react';
import { ExternalLink, CheckCircle2, XCircle, Trash2, Info, Loader2 } from 'lucide-react';
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
import { DocumentMetadataBadge } from './DocumentMetadataBadge';
import { PublicationTypeBadge } from './wizard/PublicationTypeBadge';
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
import { Bron } from '../utils/transformations';

export interface WebsiteCardProps {
    /** Legacy Bron format (for websites and custom documents) */
    bron: Bron;
    onStatusChange: (id: string, status: 'approved' | 'rejected' | 'pending') => void;
    onRemove?: (id: string) => void;
    onDocumentClick?: (documentId: string) => void;
    isCustom?: boolean;
    searchQuery?: string; // For highlighting search terms
}

// Highlight search terms in text
const highlightText = (text: string, searchQuery?: string): React.ReactNode => {
    if (!searchQuery || !text) return text;

    const query = searchQuery.trim();
    if (!query) return text;

    // eslint-disable-next-line security/detect-non-literal-regexp
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

export const WebsiteCard = memo(function WebsiteCard({ bron, onStatusChange, onRemove, onDocumentClick, isCustom, searchQuery }: WebsiteCardProps) {
    const navigate = useNavigate();
    const [showExplanation, setShowExplanation] = useState(false);
    const [explanation, setExplanation] = useState<DocumentExplanation | null>(null);
    const [loadingExplanation, setLoadingExplanation] = useState(false);
    const [explanationError, setExplanationError] = useState<string | null>(null);
    const [updatingStatus, setUpdatingStatus] = useState<'approved' | 'rejected' | null>(null);

    // Use bron directly as documentData
    const documentData = bron;

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
        if (updatingStatus) return;
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
        }
        setShowExplanation(open);
    };

    return (
        <Card
            data-testid={`website-card-${documentData.id || documentData._id || 'unknown'}`}
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
                                    publicationType={documentData.metadata?.documentType || null}
                                    documentType={documentData.metadata?.documentType || null}
                                />
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <a
                                            href={documentData.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 hover:opacity-70 transition-opacity text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none rounded-sm max-w-[200px] sm:max-w-[300px]"
                                            onClick={() => {
                                                if (documentData.id && onDocumentClick) {
                                                    onDocumentClick(documentData.id);
                                                }
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
                                <span
                                    className="px-2 py-1 rounded text-xs bg-muted-foreground/10 text-muted-foreground"
                                >
                                    {documentData.bron}
                                </span>
                                <span
                                    className={`px-2 py-1 rounded text-xs ${
                                        documentData.type === 'website'
                                            ? 'bg-primary/10 text-primary'
                                            : 'bg-accent/10 text-accent'
                                    }`}
                                >
                                    {documentData.type === 'website' ? t('bronCard.website') : t('bronCard.document')}
                                </span>
                            </div>
                        </div>
                        {isCustom && onRemove && (
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <Button
                                        variant="outline"
                                        size="icon"
                                        onClick={() => onRemove(documentData.id)}
                                        className="border-accent text-accent hover:bg-accent hover:text-accent-foreground"
                                        aria-label="Verwijder bron"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>Verwijder bron</p>
                                </TooltipContent>
                            </Tooltip>
                        )}
                    </div>

                    {/* Samenvatting */}
                    <div className="mb-4">
                        <Label className="block mb-2 text-foreground">
                            Samenvatting
                        </Label>
                        <p className="text-sm text-muted-foreground">
                            {highlightedSummary}
                        </p>
                    </div>

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

                    {/* Actions */}
                    <div className="flex gap-3">
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
                            {documentData.status === 'rejected' ? t('step3.rejected') : t('documentCard.notSuitable')}
                        </Button>
                        <Button
                            onClick={handleShowExplanation}
                            variant="outline"
                            className="flex items-center gap-2"
                            title={t('documentCard.whyFound')}
                            aria-label="Toon uitleg waarom dit document gevonden is"
                        >
                            <Info className="w-4 h-4" />
                            Uitleg
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
                            Uitleg over hoe dit document is ontdekt tijdens het AI-geleide crawlen
                        </DialogDescription>
                    </DialogHeader>
                    {loadingExplanation ? (
                        <div className="flex items-center justify-center p-8" role="status">
                            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                            <span className="sr-only">{t('documentCard.loadingExplanation')}</span>
                        </div>
                    ) : explanationError ? (
                        <div className="text-center text-red-500 p-8">
                            {explanationError}
                        </div>
                    ) : explanation ? (
                        <div className="space-y-4 mt-4">
                            <div>
                                <h3 className="font-semibold mb-2">Strategie</h3>
                                <p className="text-sm text-muted-foreground">
                                    {getStrategyDescription(explanation.strategy)}
                                </p>
                            </div>
                            {explanation.confidence !== undefined && (
                                <div>
                                    <h3 className="font-semibold mb-2">Vertrouwensscore</h3>
                                    <p className="text-sm text-muted-foreground">
                                        {(explanation.confidence * 100).toFixed(0)}% - {
                                            explanation.confidence >= 0.8 ? 'Hoge vertrouwen - zeer waarschijnlijk relevant' :
                                            explanation.confidence >= 0.5 ? 'Gemiddeld vertrouwen - waarschijnlijk relevant' :
                                            'Lager vertrouwen - mogelijk review nodig'
                                        }
                                    </p>
                                </div>
                            )}
                            {explanation.reasoning && (
                                <div>
                                    <h3 className="font-semibold mb-2">Redenering</h3>
                                    <p className="text-sm text-gray-600 whitespace-pre-wrap">{explanation.reasoning}</p>
                                </div>
                            )}
                            {explanation.detailedExplanation && (
                                <div>
                                    <h3 className="font-semibold mb-2">Gedetailleerde uitleg</h3>
                                    <pre className="text-sm text-foreground whitespace-pre-wrap bg-muted p-3 rounded">
                                        {explanation.detailedExplanation}
                                    </pre>
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
