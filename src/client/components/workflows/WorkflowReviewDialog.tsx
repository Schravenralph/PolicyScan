import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Loader2, Filter, AlertTriangle } from 'lucide-react';
import { toast } from '../../utils/toast';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';
import { useWorkflowRunStatus } from '../../hooks/useWorkflowWithReactQuery';
import { useDebounce } from '../../hooks/useDebounce';
import { performanceMonitor } from '../../utils/performanceMonitor';
import { ReviewProgressIndicator } from './ReviewProgressIndicator';
import { ReviewBulkOperations } from './ReviewBulkOperations';
import { ReviewFiltersAndSort } from './ReviewFiltersAndSort';
import { CandidateCard } from './CandidateCard';
import { ReviewFooterActions } from './ReviewFooterActions';

interface CandidateResult {
    id: string;
    title: string;
    url: string;
    snippet?: string;
    metadata?: Record<string, unknown>;
    reviewStatus: 'pending' | 'accepted' | 'rejected';
    reviewNotes?: string;
}

interface WorkflowReview {
    _id: string;
    runId: string;
    workflowId: string;
    moduleId: string;
    moduleName: string;
    candidateResults: CandidateResult[];
    status: 'pending' | 'completed';
}

interface WorkflowReviewDialogProps {
    runId: string;
    workflowId: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onReviewComplete: () => void;
}

export function WorkflowReviewDialog({
    runId,
    workflowId,
    open,
    onOpenChange,
    onReviewComplete
}: WorkflowReviewDialogProps) {
    const [review, setReview] = useState<WorkflowReview | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [, setError] = useState<string | null>(null);
    const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
    const [rejectedCandidates, setRejectedCandidates] = useState<Set<string>>(new Set());
    const [filterQuery, setFilterQuery] = useState('');
    // Debounce filter query to prevent excessive filtering (300ms delay)
    const debouncedFilterQuery = useDebounce(filterQuery, 300);
    const [sortBy, setSortBy] = useState<'relevance' | 'title' | 'url' | 'boost'>('relevance');
    const [showOnlyAccepted, setShowOnlyAccepted] = useState(false);
    const [showOnlyRejected, setShowOnlyRejected] = useState(false);
    const [showOnlyPending, setShowOnlyPending] = useState(false);
    const [expandedCandidates, setExpandedCandidates] = useState<Set<string>>(new Set());
    const previousRunStatusRef = useRef<string | null>(null);

    // Poll run status to detect when workflow resumes
    const { data: runStatus } = useWorkflowRunStatus(runId, {
        refetchInterval: open ? 3000 : false, // Poll every 3 seconds when dialog is open
        enabled: open && !!runId
    });

    const loadReview = useCallback(async () => {
        setLoading(true);
        
        // Retry logic to handle race condition where review might not be created yet
        const maxRetries = 5;
        const retryDelay = 1000; // Start with 1 second
        let lastError: Error | null = null;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const data = await api.getReview(runId) as WorkflowReview;
                setReview(data);
                
                // Initialize selections based on existing review status
                const accepted = new Set<string>();
                const rejected = new Set<string>();
                data.candidateResults.forEach((candidate: CandidateResult) => {
                    if (candidate.reviewStatus === 'accepted') {
                        accepted.add(candidate.id);
                    } else if (candidate.reviewStatus === 'rejected') {
                        rejected.add(candidate.id);
                    }
                });
                setSelectedCandidates(accepted);
                setRejectedCandidates(rejected);
                
                // Success - exit retry loop
                setLoading(false);
                return;
            } catch (error) {
                lastError = error as Error;
                const errorObj = error as Error & { statusCode?: number; code?: string };
                const statusCode = errorObj.statusCode;
                const errorMessage = errorObj.message || t('common.unknownError');
                
                // Handle RUN_NOT_PAUSED error - workflow has resumed
                const errorCode = errorObj.code;
                if (errorCode === 'RUN_NOT_PAUSED' || (statusCode === 400 && errorMessage.includes('not paused'))) {
                    const statusMatch = errorMessage.match(/not paused: (\w+)/);
                    const currentRunStatus = statusMatch ? statusMatch[1] : 'running';
                    setError(t('workflow.review.resumedAndStatus').replace('{{status}}', currentRunStatus));
                    toast.warning(t('workflow.review.resumed'), t('workflow.review.resumedDesc'));
                    // Close dialog after a short delay
                    setTimeout(() => {
                        onOpenChange(false);
                    }, 3000);
                    setLoading(false);
                    return;
                }
                
                // Handle 404 errors (review doesn't exist)
                // This is expected when workflow is paused manually without a review point
                if (statusCode === 404) {
                    // On first attempt, don't log as error - this is a valid scenario
                    // Only log on retries to indicate a real problem
                    if (attempt > 0) {
                        logError(error, 'load-review');
                    } else {
                        // First attempt 404 is expected - just debug log
                        console.debug('[WorkflowReviewDialog] No review found on first attempt - workflow paused without review');
                    }
                    toast.warning(
                        t('workflow.review.notFound'),
                        t('workflow.review.notFoundDesc')
                    );
                    // Close dialog after a delay
                    setTimeout(() => {
                        onOpenChange(false);
                    }, 3000);
                    setLoading(false);
                    return;
                }
                
                // Don't retry on connection errors (backend down)
                if (statusCode === 500 && (errorObj.code === 'ECONNREFUSED' || errorMessage.includes('not reachable'))) {
                    logError(error, 'load-review');
                    setError(t('errors.backend.notReachable'));
                    toast.error(
                        t('errors.backend.title'),
                        t('errors.backend.notReachable')
                    );
                    setLoading(false);
                    return;
                }
                
                // Retry with exponential backoff (except on last attempt)
                if (attempt < maxRetries - 1) {
                    const delay = retryDelay * Math.pow(2, attempt);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
            }
        }
        
        // All retries failed
        if (lastError) {
            const errorObj = lastError as Error & { statusCode?: number };
            if (errorObj.statusCode === 404) {
                // 404 after retries - review doesn't exist (workflow paused without review)
                // Don't log as error - this is expected when manually pausing
                console.debug('[WorkflowReviewDialog] No review found after retries - workflow paused without review');
                toast.warning(
                    t('workflow.review.notFound'),
                    t('workflow.review.loadFailedAfterRetries')
                );
                setTimeout(() => {
                    onOpenChange(false);
                }, 3000);
            } else {
                // Other errors should be logged
                logError(lastError, 'load-review');
                toast.error(t('workflow.review.loadFailed'), t('common.tryAgainLater'));
            }
        }
        
        setLoading(false);
    }, [runId, onOpenChange]);

    useEffect(() => {
        if (open && runId) {
            setError(null);
            previousRunStatusRef.current = null;
            loadReview();
        } else if (!open) {
            // Reset state when dialog closes
            setError(null);
            setReview(null);
            previousRunStatusRef.current = null;
        }
    }, [open, runId, loadReview]);

    // Monitor run status and close dialog if workflow resumes
    useEffect(() => {
        if (!open || !runStatus) return;

        // Track status changes
        if (previousRunStatusRef.current === 'paused' && runStatus !== 'paused') {
            // Workflow has resumed or changed status
            if (runStatus === 'running' || runStatus === 'completed') {
                setError(t('workflow.review.resumedAndStatus').replace('{{status}}', runStatus));
                toast.warning(t('workflow.review.resumed'), t('workflow.review.resumedDesc'));
                // Close dialog after a short delay
                setTimeout(() => {
                    onOpenChange(false);
                }, 3000);
            }
        }

        previousRunStatusRef.current = runStatus;
    }, [runStatus, open, onOpenChange]);

    const getFilteredCandidates = useCallback(() => {
        if (!review) return [];
        
        return review.candidateResults.filter(candidate => {
            // Apply text filter (use debounced version)
            if (debouncedFilterQuery) {
                const query = debouncedFilterQuery.toLowerCase();
                const matches = (
                    candidate.title.toLowerCase().includes(query) ||
                    candidate.url.toLowerCase().includes(query) ||
                    candidate.snippet?.toLowerCase().includes(query)
                );
                if (!matches) return false;
            }
            
            // Apply status filters
            if (showOnlyAccepted && !selectedCandidates.has(candidate.id)) return false;
            if (showOnlyRejected && !rejectedCandidates.has(candidate.id)) return false;
            if (showOnlyPending && selectedCandidates.has(candidate.id) || rejectedCandidates.has(candidate.id)) return false;
            
            return true;
        });
    }, [review, debouncedFilterQuery, showOnlyAccepted, showOnlyRejected, showOnlyPending, selectedCandidates, rejectedCandidates]);

    const handleSelectAll = useCallback(() => {
        if (!review) return;
        const filtered = getFilteredCandidates();
        setSelectedCandidates(prev => {
            const next = new Set(prev);
            filtered.forEach(c => next.add(c.id));
            return next;
        });
        setRejectedCandidates(prev => {
            const next = new Set(prev);
            filtered.forEach(c => next.delete(c.id));
            return next;
        });
    }, [review, getFilteredCandidates]);

    const handleDeselectAll = useCallback(() => {
        if (!review) return;
        const filtered = getFilteredCandidates();
        setSelectedCandidates(prev => {
            const next = new Set(prev);
            filtered.forEach(c => next.delete(c.id));
            return next;
        });
        setRejectedCandidates(prev => {
            const next = new Set(prev);
            filtered.forEach(c => next.delete(c.id));
            return next;
        });
    }, [review, getFilteredCandidates]);

    const handleSubmit = useCallback(async () => {
        if (!review) return;

        setSubmitting(true);
        try {
            // Submit all decisions
            const decisions = review.candidateResults.map(candidate => ({
                candidateId: candidate.id,
                status: selectedCandidates.has(candidate.id) ? 'accepted' as const : 'rejected' as const,
                notes: candidate.reviewNotes
            }));

            await api.reviewCandidates(review._id, decisions);

            // Complete review and resume workflow
            await api.completeReview(review._id, workflowId);

            toast.success(t('workflow.review.completed'));
            onReviewComplete();
            onOpenChange(false);
        } catch (error) {
            logError(error, 'submit-review');
            toast.error(t('workflow.review.submitFailed'));
        } finally {
            setSubmitting(false);
        }
    }, [review, selectedCandidates, workflowId, onReviewComplete, onOpenChange]);

    // Keyboard shortcuts
    useEffect(() => {
        if (!open) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }

            // Ctrl/Cmd + A: Select all
            if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
                e.preventDefault();
                handleSelectAll();
            }
            // Ctrl/Cmd + D: Deselect all
            if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
                e.preventDefault();
                handleDeselectAll();
            }
            // Ctrl/Cmd + Enter: Submit
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                if (selectedCandidates.size > 0 && !submitting) {
                    handleSubmit();
                }
            }
            // Escape: Close dialog
            if (e.key === 'Escape') {
                e.preventDefault();
                onOpenChange(false);
            }
            // Ctrl/Cmd + F: Focus search
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                const searchInput = document.querySelector(`input[placeholder="${t('workflowReview.filterCandidates')}"]`) as HTMLInputElement;
                searchInput?.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, selectedCandidates.size, submitting, handleSelectAll, handleDeselectAll, handleSubmit, onOpenChange]);

    const handleCandidateToggle = (candidateId: string, accepted: boolean) => {
        if (accepted) {
            setSelectedCandidates(prev => {
                const next = new Set(prev);
                next.add(candidateId);
                return next;
            });
            setRejectedCandidates(prev => {
                const next = new Set(prev);
                next.delete(candidateId);
                return next;
            });
        } else {
            setRejectedCandidates(prev => {
                const next = new Set(prev);
                next.add(candidateId);
                return next;
            });
            setSelectedCandidates(prev => {
                const next = new Set(prev);
                next.delete(candidateId);
                return next;
            });
        }
    };

    const handleBulkAccept = () => {
        if (!review) return;
        const filtered = getFilteredCandidates();
        filtered.forEach(candidate => {
            if (!selectedCandidates.has(candidate.id) && !rejectedCandidates.has(candidate.id)) {
                handleCandidateToggle(candidate.id, true);
            }
        });
    };

    const handleBulkReject = () => {
        if (!review) return;
        const filtered = getFilteredCandidates();
        filtered.forEach(candidate => {
            if (!rejectedCandidates.has(candidate.id) && !selectedCandidates.has(candidate.id)) {
                handleCandidateToggle(candidate.id, false);
            }
        });
    };

    const toggleCandidateExpansion = (candidateId: string) => {
        setExpandedCandidates(prev => {
            const next = new Set(prev);
            if (next.has(candidateId)) {
                next.delete(candidateId);
            } else {
                next.add(candidateId);
            }
            return next;
        });
    };


    // Memoize sorted candidates to prevent recalculation on every render
    const sortedCandidates = useMemo(() => {
        return performanceMonitor.measureSync(
            'WorkflowReviewDialog',
            'sortCandidates',
            () => {
                const filtered = getFilteredCandidates();
                // Limit to 1000 candidates for performance (very large lists can cause lag)
                const candidatesToSort = filtered.length > 1000 ? filtered.slice(0, 1000) : filtered;
                
                return [...candidatesToSort].sort((a, b) => {
                    if (sortBy === 'relevance') {
                        const aScore = (a.metadata?.relevanceScore as number) || 0;
                        const bScore = (b.metadata?.relevanceScore as number) || 0;
                        const aBoost = (a.metadata?.boostScore as number) || 0;
                        const bBoost = (b.metadata?.boostScore as number) || 0;
                        return (bScore + bBoost) - (aScore + aBoost);
                    } else if (sortBy === 'boost') {
                        const aBoost = (a.metadata?.boostScore as number) || 0;
                        const bBoost = (b.metadata?.boostScore as number) || 0;
                        return bBoost - aBoost;
                    } else if (sortBy === 'title') {
                        return a.title.localeCompare(b.title);
                    } else {
                        return a.url.localeCompare(b.url);
                    }
                });
            },
            { candidateCount: getFilteredCandidates().length, sortBy }
        );
    }, [getFilteredCandidates, sortBy]);

    if (!review && !loading) {
        return null;
    }

    const acceptedCount = selectedCandidates.size;
    const rejectedCount = rejectedCandidates.size;
    const totalCount = review?.candidateResults.length || 0;
    const pendingCount = totalCount - acceptedCount - rejectedCount;
    // completionPercentage calculated but not used in render
    void (totalCount > 0 ? ((acceptedCount + rejectedCount) / totalCount) * 100 : 0);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
                <DialogHeader className="flex-shrink-0">
                    <DialogTitle className="flex items-center gap-2">
                        Review: {review?.moduleName || t('workflowReview.workflowReview')}
                    </DialogTitle>
                    <DialogDescription>
                        Review candidate documents from step: {review?.moduleName}
                        <br />
                        Run ID: {runId}
                    </DialogDescription>
                </DialogHeader>

                {loading ? (
                    <div className="flex items-center justify-center p-8 flex-1">
                        <Loader2 className="h-8 w-8 animate-spin" />
                    </div>
                ) : review ? (
                    <>
                        {/* Progress Indicator */}
                        <ReviewProgressIndicator
                            totalCount={totalCount}
                            acceptedCount={acceptedCount}
                            rejectedCount={rejectedCount}
                            pendingCount={pendingCount}
                            filteredCount={sortedCandidates.length}
                            hasFilter={!!filterQuery}
                        />

                        {/* Bulk Operations */}
                        <ReviewBulkOperations
                            onSelectAll={handleSelectAll}
                            onDeselectAll={handleDeselectAll}
                            onBulkAccept={handleBulkAccept}
                            onBulkReject={handleBulkReject}
                        />

                        {/* Filter and Sort Controls */}
                        <ReviewFiltersAndSort
                            filterQuery={filterQuery}
                            onFilterChange={setFilterQuery}
                            sortBy={sortBy}
                            onSortChange={setSortBy}
                            showOnlyAccepted={showOnlyAccepted}
                            onShowOnlyAcceptedChange={setShowOnlyAccepted}
                            showOnlyRejected={showOnlyRejected}
                            onShowOnlyRejectedChange={setShowOnlyRejected}
                            showOnlyPending={showOnlyPending}
                            onShowOnlyPendingChange={setShowOnlyPending}
                        />

                        {/* Candidate List */}
                        <ScrollArea className="flex-1 min-h-0 pr-4">
                            <div className="space-y-3">
                                {review && review.candidateResults.length > 1000 && (
                                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
                                        <AlertTriangle className="h-4 w-4 text-yellow-600 mt-0.5 flex-shrink-0" />
                                        <div className="text-sm text-yellow-800">
                                            <p className="font-medium">{t('benchmark.largeCandidateList')}</p>
                                            <p className="text-xs mt-1">
                                                {t('benchmark.largeCandidateListDescription')}
                                            </p>
                                        </div>
                                    </div>
                                )}
                                {sortedCandidates.length === 0 ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Filter className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                        <p>{t('workflowReview.noCandidatesMatch')}</p>
                                    </div>
                                ) : (
                                    sortedCandidates.map((candidate) => (
                                        <CandidateCard
                                            key={candidate.id}
                                            candidate={candidate}
                                            isAccepted={selectedCandidates.has(candidate.id)}
                                            isRejected={rejectedCandidates.has(candidate.id)}
                                            isExpanded={expandedCandidates.has(candidate.id)}
                                            onToggle={(checked) => handleCandidateToggle(candidate.id, checked)}
                                            onToggleExpansion={() => toggleCandidateExpansion(candidate.id)}
                                        />
                                    ))
                                )}
                            </div>
                        </ScrollArea>

                        {/* Footer Actions */}
                        <ReviewFooterActions
                            candidateCount={sortedCandidates.length}
                            acceptedCount={acceptedCount}
                            submitting={submitting}
                            onCancel={() => onOpenChange(false)}
                            onSubmit={handleSubmit}
                        />
                    </>
                ) : null}
            </DialogContent>
        </Dialog>
    );
}
