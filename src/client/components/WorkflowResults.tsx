import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { api, type BronDocument } from '../services/api';
import type { CanonicalDocument } from '../services/api';
import { CanonicalDocumentCard } from './CanonicalDocumentCard';
import { toast } from '../utils/toast';
import { t } from '../utils/i18n';
import { getSessionId, getUserId } from '../utils/session';
import { logError } from '../utils/errorHandler';
import { useWorkflowRun, useWorkflowOutput } from '../hooks/useWorkflowWithReactQuery';
import { useCanonicalDocumentsByQuery, useUpdateCanonicalDocumentAcceptance } from '../hooks/useCanonicalDocumentWithReactQuery';
import {
  getCanonicalDocumentTitle,
  getCanonicalDocumentUrl,
  getCanonicalDocumentAcceptance,
  getCanonicalDocumentType,
} from '../utils/canonicalDocumentUtils';
import { RunSummarySection } from './workflow/RunSummarySection';
import { DocumentFilterBar } from './workflow/DocumentFilterBar';
import { WorkflowOutputPreview } from './workflow/WorkflowOutputPreview';

interface WorkflowResultsProps {
    runId?: string;
    queryId?: string;
    onDocumentsLoaded?: (documents: BronDocument[] | CanonicalDocument[]) => void;
}

export function WorkflowResults({ runId, queryId, onDocumentsLoaded }: WorkflowResultsProps) {
    // Use React Query hooks for data fetching
    const { data: run, isLoading: isLoadingRun, refetch: refetchRun } = useWorkflowRun(runId || null);
    
    // Extract output name from run data
    const outputName = useMemo(() => {
        if (!run?.outputPaths?.jsonPath) return null;
        return run.outputPaths.jsonPath
            .split('/')
            .pop()
            ?.replace('.json', '') || null;
    }, [run?.outputPaths?.jsonPath]);
    
    const { data: output, isLoading: isLoadingOutput } = useWorkflowOutput(outputName);
    const { data: documents = [], isLoading: isLoadingDocuments } = useCanonicalDocumentsByQuery(queryId || null);
    const updateDocumentAcceptance = useUpdateCanonicalDocumentAcceptance();
    
    const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
    const [isConverting, setIsConverting] = useState(false);
    const sessionIdRef = useRef<string>(getSessionId());
    const viewedDocumentsRef = useRef<Set<string>>(new Set());

    const filteredDocuments = useMemo(() => documents.filter((doc) => {
        if (filter === 'all') return true;
        const acceptance = getCanonicalDocumentAcceptance(doc);
        if (filter === 'approved') return acceptance === true;
        if (filter === 'rejected') return acceptance === false;
        if (filter === 'pending') return acceptance === null;
        return true;
    }), [documents, filter]);

    // Track search interaction when documents are loaded
    useEffect(() => {
        if (documents.length > 0 && queryId) {
            const firstDoc = documents[0];
            api.recordInteraction({
                type: 'search',
                queryId,
                query: getCanonicalDocumentTitle(firstDoc), // Use first document title as search context
                timestamp: new Date(),
                userId: getUserId(),
                sessionId: sessionIdRef.current,
                metadata: {
                    documentCount: documents.length,
                    queryId
                }
            }).catch((feedbackError) => {
                console.warn('Failed to record search interaction:', feedbackError);
            });
        }
    }, [documents, queryId]);

    // Notify parent when documents are loaded
    useEffect(() => {
        if (documents.length > 0) {
            onDocumentsLoaded?.(documents);
        }
    }, [documents, onDocumentsLoaded]);

    const isLoading = isLoadingRun || isLoadingOutput || isLoadingDocuments;
    
    const loadRunData = useCallback(() => {
        void refetchRun();
    }, [refetchRun]);

    const handleConvertToDocuments = async () => {
        if (!queryId || !outputName) return;

        setIsConverting(true);
        try {
            const result = await api.convertWorkflowOutputToDocuments(outputName, queryId);
            // Documents will be refetched automatically via React Query
            onDocumentsLoaded?.(result.documents);
            toast.success(
                t('workflowResults.workflowConverted'),
                t('workflowResults.workflowConvertedDescription')
                    .replace('{{documents}}', result.documentsCreated.toString())
                    .replace('{{websites}}', result.websitesCreated.toString())
            );
        } catch (error) {
            logError(error, 'convert-output');
            toast.error(
                t('workflowResults.conversionFailed'),
                t('workflowResults.conversionFailedDescription')
            );
        } finally {
            setIsConverting(false);
        }
    };

    const handleStatusChange = useCallback(async (id: string, status: 'approved' | 'rejected' | 'pending') => {
        const accepted = status === 'approved' ? true : status === 'rejected' ? false : null;
        
        // Find document data before async operation
        const doc = documents.find(d => d._id === id);
        const pos = documents.findIndex(d => d._id === id);
        
        try {
            await updateDocumentAcceptance.mutateAsync({
                documentId: id,
                accepted,
            });

            // Record feedback for learning system
            if (doc && pos >= 0) {
                try {
                    await api.recordInteraction({
                        type: status === 'approved' ? 'accept' : status === 'rejected' ? 'reject' : 'view',
                        documentId: id,
                        queryId: queryId || undefined,
                        query: getCanonicalDocumentTitle(doc), // Use document title as query context
                        position: pos >= 0 ? pos : undefined,
                        timestamp: new Date(),
                        userId: getUserId(),
                        sessionId: sessionIdRef.current,
                        metadata: {
                            documentType: getCanonicalDocumentType(doc),
                            websiteUrl: getCanonicalDocumentUrl(doc) || undefined
                        }
                    });
                } catch (feedbackError) {
                    // Don't fail the status update if feedback recording fails
                    console.warn('Failed to record feedback:', feedbackError);
                }
            }
            // React Query will automatically refetch documents after the mutation
        } catch (error) {
            logError(error, 'update-document-status');
            toast.error(t('workflowResults.statusUpdateFailed'), t('workflowResults.statusUpdateFailedDesc'));
        }
    }, [documents, updateDocumentAcceptance, queryId]);

    // Track click interaction - using callback to prevent re-renders of list items
    const handleDocumentClick = useCallback((documentId: string) => {
        // Find document in filtered list to get correct position
        const index = filteredDocuments.findIndex(d => d._id === documentId);
        const clickedDoc = filteredDocuments[index];

        if (clickedDoc) {
            api.recordInteraction({
                type: 'click',
                documentId,
                queryId: queryId || undefined,
                query: getCanonicalDocumentTitle(clickedDoc),
                position: index,
                timestamp: new Date(),
                userId: getUserId(),
                sessionId: sessionIdRef.current
            }).catch(err => console.warn('Failed to record click:', err));
        }
    }, [filteredDocuments, queryId]);

    // Track document views for feedback
    const trackDocumentView = useCallback(async (
        document: CanonicalDocument,
        position: number
    ) => {
        if (!document._id) return;
        const documentId = document._id;

        if (viewedDocumentsRef.current.has(documentId)) {
            return; // Already tracked
        }
        viewedDocumentsRef.current.add(documentId);

        try {
            await api.recordInteraction({
                type: 'view',
                documentId,
                queryId: queryId || undefined,
                query: getCanonicalDocumentTitle(document),
                position,
                timestamp: new Date(),
                userId: getUserId(),
                sessionId: sessionIdRef.current
            });
        } catch (error) {
            console.warn('Failed to record document view:', error);
        }
    }, [queryId]);

    useEffect(() => {
        filteredDocuments.forEach((doc, index) => {
            void trackDocumentView(doc, index);
        });
    }, [filteredDocuments, trackDocumentView]);


    const handlePauseRun = async () => {
        if (!runId) return;
        try {
            await api.pauseRun(runId);
            toast.success(t('workflowResults.runPaused'), 'De workflow run is gepauzeerd.');
            void refetchRun(); // Refresh to show updated status
        } catch (_error) {
            toast.error(t('workflowResults.failedToPause'), 'Probeer het opnieuw.');
        }
    };

    const handleResumeRun = async () => {
        if (!runId) return;
        try {
            await api.resumeRun(runId);
            toast.success(t('workflowResults.runResumed'), 'De workflow run is hervat.');
            void refetchRun(); // Refresh to show updated status
        } catch (_error) {
            toast.error(t('workflowResults.failedToResume'), 'Probeer het opnieuw.');
        }
    };

    const handleStopRun = async () => {
        if (!runId) return;
        try {
            await api.cancelRun(runId);
            toast.success(t('workflowResults.runStopped'), 'De workflow run is netjes gestopt.');
            void refetchRun(); // Refresh to show updated status
        } catch (_error) {
            toast.error(t('workflowResults.failedToStop'), 'Probeer het opnieuw.');
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div role="status" className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Run Summary */}
            <RunSummarySection
                run={run ? {
                    id: run._id,
                    status: run.status,
                    startTime: run.startTime,
                    params: run.params,
                    type: run.type,
                    outputPaths: run.outputPaths,
                } : null}
                output={output || null}
                queryId={queryId || null}
                documentsCount={documents.length}
                isConverting={isConverting}
                onPauseRun={handlePauseRun}
                onResumeRun={handleResumeRun}
                onStopRun={handleStopRun}
                onRefresh={loadRunData}
                onConvertToDocuments={handleConvertToDocuments}
            />

            {/* Documents Section */}
            {documents.length > 0 && (
                <>
                    {/* Filter Bar */}
                    <DocumentFilterBar
                        filter={filter}
                        onFilterChange={setFilter}
                        documents={documents}
                        filteredCount={filteredDocuments.length}
                    />

                    {/* Document Cards */}
                    <div className="space-y-4">
                        {filteredDocuments.map((doc) => {
                            return (
                                <CanonicalDocumentCard
                                    key={doc._id}
                                    document={doc}
                                    onStatusChange={handleStatusChange}
                                    onDocumentClick={handleDocumentClick}
                                />
                            );
                        })}
                    </div>
                </>
            )}

            {/* Empty State for Documents */}
            {!isLoading && documents.length === 0 && !output && (
                <div className="text-center py-8 text-gray-500">
                    {t('workflowResults.noDocuments')}
                </div>
            )}

            {/* Workflow Output Preview (when no documents yet) */}
            {output && documents.length === 0 && (
                <WorkflowOutputPreview output={output} />
            )}
        </div>
    );
}
