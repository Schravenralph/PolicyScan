import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, RefreshCw } from 'lucide-react';
import { logError, parseError } from '../utils/errorHandler';
import { toast } from '../utils/toast';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog';
import { api } from '../services/api';
import type { CanonicalDocument } from '../services/api';
import type { PaginationParams, DocumentFilterParams } from '../services/api';
import { t } from '../utils/i18n';
import { getCanonicalDocumentTitle } from '../utils/canonicalDocumentUtils';
import { LibraryFilters } from '../components/library/LibraryFilters';
import { DocumentList } from '../components/library/DocumentList';
import { EmailExportDialog } from '../components/library/EmailExportDialog';
import { AddDocumentDialog } from '../components/library/AddDocumentDialog';
import { useDeleteDocument } from '../hooks/useDocumentWithReactQuery';

interface LibraryPageProps {
    onDocumentSelect?: (documents: CanonicalDocument[]) => void;
}

export function LibraryPage({ onDocumentSelect }: LibraryPageProps) {
    const [searchParams] = useSearchParams();
    const [documents, setDocuments] = useState<CanonicalDocument[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [includeCitations, setIncludeCitations] = useState(false);
    const [citationFormat, setCitationFormat] = useState<'apa' | 'custom'>('apa');
    const [exporting, setExporting] = useState(false);
    const [showEmailDialog, setShowEmailDialog] = useState(false);
    const [emailRecipients, setEmailRecipients] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [queryIdFilter, setQueryIdFilter] = useState('');
    const [workflowRunIdFilter, setWorkflowRunIdFilter] = useState('');
    const [reviewStatusFilter, setReviewStatusFilter] = useState<'pending_review' | 'approved' | 'rejected' | 'needs_revision' | 'all'>('all');
    const [sourceFilter, setSourceFilter] = useState<'DSO' | 'Rechtspraak' | 'Wetgeving' | 'Gemeente' | 'PDOK' | 'Web' | 'all'>('all');
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [showAddDialog, setShowAddDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [documentToDelete, setDocumentToDelete] = useState<string | null>(null);
    const limit = 50;
    const deleteDocument = useDeleteDocument();

    // Load state from URL params on mount (for navigation from wizard)
    useEffect(() => {
        const urlQueryId = searchParams.get('queryId');
        const urlReviewStatus = searchParams.get('reviewStatus');
        
        if (urlQueryId) {
            setQueryIdFilter(urlQueryId);
            localStorage.setItem('library_queryIdFilter', urlQueryId);
        }
        
        if (urlReviewStatus && ['pending_review', 'approved', 'rejected', 'needs_revision'].includes(urlReviewStatus)) {
            setReviewStatusFilter(urlReviewStatus as typeof reviewStatusFilter);
            localStorage.setItem('library_reviewStatusFilter', urlReviewStatus);
        }
    }, [searchParams]);

    // Load persisted state on mount
    useEffect(() => {
        const savedSelectedIds = localStorage.getItem('library_selectedIds');
        if (savedSelectedIds) {
            try {
                setSelectedIds(new Set(JSON.parse(savedSelectedIds)));
            } catch (e) {
                console.error('Failed to parse saved selection', e);
            }
        }

        const savedSearchQuery = localStorage.getItem('library_searchQuery');
        if (savedSearchQuery) setSearchQuery(savedSearchQuery);

        // Only use localStorage if URL params didn't set it
        if (!searchParams.get('queryId')) {
            const savedQueryIdFilter = localStorage.getItem('library_queryIdFilter');
            if (savedQueryIdFilter) setQueryIdFilter(savedQueryIdFilter);
        }

        const savedWorkflowRunIdFilter = localStorage.getItem('library_workflowRunIdFilter');
        if (savedWorkflowRunIdFilter) setWorkflowRunIdFilter(savedWorkflowRunIdFilter);

        const savedSourceFilter = localStorage.getItem('library_sourceFilter');
        if (savedSourceFilter && ['DSO', 'Rechtspraak', 'Wetgeving', 'Gemeente', 'PDOK', 'Web', 'all'].includes(savedSourceFilter)) {
            setSourceFilter(savedSourceFilter as typeof sourceFilter);
        }

        // Only use localStorage if URL params didn't set it
        if (!searchParams.get('reviewStatus')) {
            const savedReviewStatusFilter = localStorage.getItem('library_reviewStatusFilter');
            if (savedReviewStatusFilter) setReviewStatusFilter(savedReviewStatusFilter as typeof reviewStatusFilter);
        }
    }, []);

    // Persist state changes
    useEffect(() => {
        localStorage.setItem('library_selectedIds', JSON.stringify(Array.from(selectedIds)));
    }, [selectedIds]);

    useEffect(() => {
        localStorage.setItem('library_searchQuery', searchQuery);
    }, [searchQuery]);

    useEffect(() => {
        localStorage.setItem('library_queryIdFilter', queryIdFilter);
    }, [queryIdFilter]);

    useEffect(() => {
        localStorage.setItem('library_workflowRunIdFilter', workflowRunIdFilter);
    }, [workflowRunIdFilter]);

    useEffect(() => {
        localStorage.setItem('library_reviewStatusFilter', reviewStatusFilter);
    }, [reviewStatusFilter]);

    useEffect(() => {
        localStorage.setItem('library_sourceFilter', sourceFilter);
    }, [sourceFilter]);

    useEffect(() => {
        loadDocuments();
    }, [page, queryIdFilter, workflowRunIdFilter, reviewStatusFilter, sourceFilter]);

    const loadDocuments = async () => {
        setLoading(true);
        try {
            const filterParams: { queryId?: string; workflowRunId?: string; reviewStatus?: string; source?: string } = {};
            if (queryIdFilter.trim()) {
                filterParams.queryId = queryIdFilter.trim();
            }
            if (workflowRunIdFilter.trim()) {
                filterParams.workflowRunId = workflowRunIdFilter.trim();
            }
            if (reviewStatusFilter !== 'all') {
                filterParams.reviewStatus = reviewStatusFilter;
            }
            if (sourceFilter !== 'all') {
                filterParams.source = sourceFilter;
            }
            
            const response = await api.canonicalDocument.getCanonicalDocuments({
                page,
                limit,
                ...filterParams,
            } as PaginationParams & DocumentFilterParams);
            setDocuments(response.data || []);
            setTotal(response.pagination?.total || 0);
        } catch (error) {
            logError(error, 'load-library-documents');
        } finally {
            setLoading(false);
        }
    };

    const filteredDocuments = useMemo(() => {
        if (!searchQuery.trim()) {
            return documents;
        }
        const queryLower = searchQuery.toLowerCase();
        return documents.filter((doc) => {
            const title = String(doc.title || doc.titel || '').toLowerCase();
            const summary = String(doc.summary || doc.samenvatting || '').toLowerCase();
            const url = String(doc.url || doc.sourceUrl || '').toLowerCase();
            return title.includes(queryLower) || summary.includes(queryLower) || url.includes(queryLower);
        });
    }, [documents, searchQuery]);

    const toggleSelection = (docId: string) => {
        setSelectedIds((prev) => {
            const newSelected = new Set(prev);
            if (newSelected.has(docId)) {
                newSelected.delete(docId);
            } else {
                newSelected.add(docId);
            }
            return newSelected;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredDocuments.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredDocuments.map(doc => {
                const id = doc._id || doc.id;
                return typeof id === 'string' ? id : String(id || '');
            })));
        }
    };

    const getDocumentsToExport = () => {
        if (selectedIds.size === 0) {
            return filteredDocuments; // Export all if nothing selected
        }
        return filteredDocuments.filter(doc => {
            const id = doc._id || doc.id;
            const idString = typeof id === 'string' ? id : String(id || '');
            return selectedIds.has(idString);
        });
    };

    const exportSingleDocument = async (doc: CanonicalDocument, format: 'csv' | 'pdf') => {
        const documentsToExport = [doc];
        setExporting(true);
        try {
            const transformedDocs = documentsToExport.map(transformDocumentForExport);
            const blob = await api.exportResults(
                transformedDocs,
                format,
                {
                    includeCitations,
                    citationFormat,
                }
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const docTitle = getCanonicalDocumentTitle(doc) || 'document';
            const safeTitle = docTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = `${safeTitle}-${new Date().toISOString().split('T')[0]}.${format}`;
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            toast.success(t('toastMessages.exportSuccessful'), `Document geëxporteerd als ${format.toUpperCase()}`);
        } catch (error) {
            logError(error, 'export-single-document');
            const errorInfo = parseError(error);
            toast.error(errorInfo.title || t('toastMessages.failedToExport').replace('{{format}}', format.toUpperCase()), errorInfo.message || `Exporteren van document als ${format.toUpperCase()} mislukt`);
        } finally {
            setExporting(false);
        }
    };

    const copyDocumentUrl = async (url: string) => {
        try {
            await navigator.clipboard.writeText(url);
            toast.success(t('toastMessages.urlCopied'), 'Document URL gekopieerd naar klembord');
        } catch (error) {
            logError(error, 'copy-document-url');
            toast.error(t('toastMessages.copyFailed'), t('toastMessages.copyFailed'));
        }
    };

    const transformDocumentForExport = (doc: CanonicalDocument) => {
        const docId = doc._id || doc.id;
        const idString = typeof docId === 'string' ? docId : String(docId || '');
        const content = typeof doc.content === 'string' ? doc.content : (typeof doc.fullText === 'string' ? doc.fullText : (typeof doc.samenvatting === 'string' ? doc.samenvatting : ''));
        const sourceUrl = typeof doc.canonicalUrl === 'string' ? doc.canonicalUrl : (typeof doc.url === 'string' ? doc.url : (typeof doc.sourceUrl === 'string' ? doc.sourceUrl : ''));
        const title = typeof doc.title === 'string' ? doc.title : (typeof doc.titel === 'string' ? doc.titel : '');
        const summary = typeof doc.summary === 'string' ? doc.summary : (typeof doc.samenvatting === 'string' ? doc.samenvatting : '');
        return {
            id: idString,
            content: content,
            sourceUrl: sourceUrl,
            metadata: {
                ...doc,
                title: title,
                summary: summary,
                url: sourceUrl,
            },
        };
    };

    const handleExport = async (format: 'csv' | 'pdf') => {
        if (filteredDocuments.length === 0) return;

        const documentsToExport = getDocumentsToExport();
        if (documentsToExport.length === 0) {
            toast.warning(t('toastMessages.pleaseSelectDocuments'));
            return;
        }

        setExporting(true);
        try {
            const transformedDocs = documentsToExport.map(transformDocumentForExport);
            const blob = await api.exportResults(
                transformedDocs,
                format,
                {
                    includeCitations,
                    citationFormat,
                }
            );

            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            const filename = `document-library-${new Date().toISOString().split('T')[0]}.${format}`;
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        } catch (error) {
            logError(error, 'export-library-results');
            const errorInfo = parseError(error);
            toast.error(errorInfo.title || 'Fout bij exporteren', errorInfo.message || `Het exporteren naar ${format.toUpperCase()} is mislukt. Probeer het opnieuw.`);
        } finally {
            setExporting(false);
        }
    };

    const handleEmailExport = async () => {
        if (filteredDocuments.length === 0) return;

        const documentsToExport = getDocumentsToExport();
        if (documentsToExport.length === 0) {
            toast.warning('Geen documenten geselecteerd', 'Selecteer eerst documenten om te exporteren.');
            return;
        }

        if (!emailRecipients.trim()) {
            toast.warning('E-mailadres ontbreekt', 'Voer het e-mailadres van de ontvanger in.');
            return;
        }

        const recipients = emailRecipients.split(',').map(email => email.trim()).filter(Boolean);
        if (recipients.length === 0) {
            toast.warning('Ongeldig e-mailadres', 'Voer een geldig e-mailadres in.');
            return;
        }

        setExporting(true);
        try {
            const transformedDocs = documentsToExport.map(transformDocumentForExport);
            await api.emailExport(
                transformedDocs,
                recipients,
                undefined,
                {
                    includeCitations,
                    citationFormat,
                }
            );
            toast.success('E-mail verzonden', `E-mail succesvol verzonden naar ${recipients.length} ontvanger(s).`);
            setShowEmailDialog(false);
            setEmailRecipients('');
        } catch (error) {
            logError(error, 'email-export');
            const errorInfo = parseError(error);
            toast.error(errorInfo.title || 'Fout bij verzenden e-mail', errorInfo.message || 'Het verzenden van de e-mail is mislukt. Probeer het opnieuw.');
        } finally {
            setExporting(false);
        }
    };

    useEffect(() => {
        if (onDocumentSelect && selectedIds.size > 0) {
            const selectedDocs = filteredDocuments.filter(doc => {
                const docId = doc._id || doc.id;
                const idString = typeof docId === 'string' ? docId : String(docId || '');
                return selectedIds.has(idString);
            });
            onDocumentSelect(selectedDocs);
        }
    }, [selectedIds, filteredDocuments, onDocumentSelect]);

    const handleDeleteClick = (docId: string) => {
        setDocumentToDelete(docId);
        setShowDeleteDialog(true);
    };

    const handleConfirmDelete = async () => {
        if (!documentToDelete) return;

        try {
            await deleteDocument.mutateAsync(documentToDelete);
            toast.success(t('common.delete'), 'Document succesvol verwijderd');
            setShowDeleteDialog(false);
            setDocumentToDelete(null);
            // Reload documents after deletion
            loadDocuments();
        } catch (error) {
            logError(error, 'delete-document');
            const errorInfo = parseError(error);
            toast.error(errorInfo.title || 'Fout bij verwijderen', errorInfo.message || 'Het verwijderen van het document is mislukt.');
        }
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="container mx-auto p-6 max-w-6xl">
            <div className="mb-8 flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold mb-2">Documentbibliotheek</h1>
                    <p className="text-muted-foreground">
                        Blader door alle beschikbare documenten in de bibliotheek
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => loadDocuments()}
                        title="Verversen"
                    >
                        <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button onClick={() => setShowAddDialog(true)}>
                        <Plus className="mr-2 h-4 w-4" />
                        Document Toevoegen
                    </Button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <Input
                    placeholder="Zoek documenten op titel, samenvatting of URL..."
                    value={searchQuery}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
                    className="w-full"
                />
            </div>

            {/* Filter Controls */}
            <LibraryFilters
              queryIdFilter={queryIdFilter}
              onQueryIdFilterChange={setQueryIdFilter}
              workflowRunIdFilter={workflowRunIdFilter}
              onWorkflowRunIdFilterChange={setWorkflowRunIdFilter}
              reviewStatusFilter={reviewStatusFilter}
              onReviewStatusFilterChange={setReviewStatusFilter}
              sourceFilter={sourceFilter}
              onSourceFilterChange={setSourceFilter}
              onPageReset={() => setPage(1)}
            />

            {/* Documents List */}
            <DocumentList
              filteredDocuments={filteredDocuments}
              loading={loading}
              searchQuery={searchQuery}
              total={total}
              selectedIds={selectedIds}
              toggleSelection={toggleSelection}
              toggleSelectAll={toggleSelectAll}
              handleExport={handleExport}
              exportSingleDocument={exportSingleDocument}
              copyDocumentUrl={copyDocumentUrl}
              onDeleteDocument={handleDeleteClick}
              exporting={exporting}
              includeCitations={includeCitations}
              citationFormat={citationFormat}
              setIncludeCitations={setIncludeCitations}
              setCitationFormat={setCitationFormat}
              setShowEmailDialog={setShowEmailDialog}
              page={page}
              totalPages={totalPages}
              setPage={setPage}
            />

            {/* Email Export Dialog */}
            <EmailExportDialog
              open={showEmailDialog}
              onOpenChange={(open) => {
                setShowEmailDialog(open);
                if (!open) {
                  setEmailRecipients('');
                }
              }}
              emailRecipients={emailRecipients}
              onEmailRecipientsChange={setEmailRecipients}
              onEmailExport={handleEmailExport}
              exporting={exporting}
              selectedCount={selectedIds.size}
              totalCount={filteredDocuments.length}
            />

            <AddDocumentDialog
                open={showAddDialog}
                onOpenChange={setShowAddDialog}
                onSuccess={() => {
                    loadDocuments();
                    setPage(1);
                }}
            />

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('common.delete')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            Weet je zeker dat je dit document wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => {
                            setShowDeleteDialog(false);
                            setDocumentToDelete(null);
                        }}>
                            Annuleren
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={deleteDocument.isPending}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {deleteDocument.isPending ? 'Verwijderen...' : t('common.delete')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

