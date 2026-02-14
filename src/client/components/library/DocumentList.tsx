/**
 * Document List Component
 * 
 * Displays the list of documents with:
 * - Header with export menu
 * - Loading/empty states
 * - Document cards with validation and error handling
 * - Pagination controls
 */

import { FileText, Download, Mail, FileDown, ChevronDown, Loader2, ExternalLink, MoreVertical, Copy, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Checkbox } from '../ui/checkbox';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    DropdownMenuCheckboxItem,
} from '../ui/dropdown-menu';
import { logError } from '../../utils/errorHandler';
import { t } from '../../utils/i18n';
import type { CanonicalDocument } from '../../services/api';
import { getCanonicalDocumentTitle, getCanonicalDocumentUrl, getCanonicalDocumentSummary } from '../../utils/canonicalDocumentUtils';
import { validateDocument, getDocumentSourceInfo } from '../../utils/libraryUtils';

interface DocumentListProps {
  filteredDocuments: CanonicalDocument[];
  loading: boolean;
  searchQuery: string;
  total: number;
  selectedIds: Set<string>;
  toggleSelection: (docId: string) => void;
  toggleSelectAll: () => void;
  handleExport: (format: 'csv' | 'pdf') => void;
  exportSingleDocument: (doc: CanonicalDocument, format: 'csv' | 'pdf') => void;
  copyDocumentUrl: (url: string) => void;
  onDeleteDocument?: (docId: string) => void;
  exporting: boolean;
  includeCitations: boolean;
  citationFormat: 'apa' | 'custom';
  setIncludeCitations: (value: boolean) => void;
  setCitationFormat: (value: 'apa' | 'custom') => void;
  setShowEmailDialog: (value: boolean) => void;
  page: number;
  totalPages: number;
  setPage: (page: number | ((prev: number) => number)) => void;
}

export function DocumentList({
  filteredDocuments,
  loading,
  searchQuery,
  total,
  selectedIds,
  toggleSelection,
  toggleSelectAll,
  handleExport,
  exportSingleDocument,
  copyDocumentUrl,
  onDeleteDocument,
  exporting,
  includeCitations,
  citationFormat,
  setIncludeCitations,
  setCitationFormat,
  setShowEmailDialog,
  page,
  totalPages,
  setPage,
}: DocumentListProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documenten ({filteredDocuments.length} {searchQuery ? t('common.documentenFound') : `${t('common.of')} ${total} ${t('common.total')}`})
          </h2>
          {filteredDocuments.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSelectAll}
              className="text-xs"
            >
              {selectedIds.size === filteredDocuments.length ? t('common.deselectAll') : t('common.selectAll')}
            </Button>
          )}
          {selectedIds.size > 0 && (
            <span className="text-sm text-muted-foreground">
              {selectedIds.size} {t('common.of')} {filteredDocuments.length} {t('common.selected')}
            </span>
          )}
        </div>
        {filteredDocuments.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={exporting}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                {t('common.export')}
                <ChevronDown className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>{t('common.exportOptions')}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => handleExport('csv')}
                disabled={exporting}
              >
                <FileDown className="mr-2 h-4 w-4" />
                {t('common.exportToCsv')}
                {selectedIds.size > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({selectedIds.size} {t('common.selectedCount')})
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleExport('pdf')}
                disabled={exporting}
              >
                <FileDown className="mr-2 h-4 w-4" />
                {t('common.exportToPdf')}
                {selectedIds.size > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({selectedIds.size} {t('common.selectedCount')})
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setShowEmailDialog(true)}
                disabled={exporting}
              >
                <Mail className="mr-2 h-4 w-4" />
                {t('common.emailResults')}
                {selectedIds.size > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({selectedIds.size} {t('common.selectedCount')})
                  </span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={includeCitations}
                onCheckedChange={setIncludeCitations}
              >
                {t('common.includeCitations')}
              </DropdownMenuCheckboxItem>
              {includeCitations && (
                <>
                  <DropdownMenuCheckboxItem
                    checked={citationFormat === 'apa'}
                    onCheckedChange={(checked) => checked && setCitationFormat('apa')}
                  >
                    {t('common.apaFormat')}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem
                    checked={citationFormat === 'custom'}
                    onCheckedChange={(checked) => checked && setCitationFormat('custom')}
                  >
                    {t('common.customFormat')}
                  </DropdownMenuCheckboxItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-lg font-medium text-foreground">
              {t('common.loadingDocuments')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('common.loadingDocumentsDescription')}
            </p>
          </div>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <p className="text-muted-foreground">
          {searchQuery ? t('common.noDocumentsFound') : t('common.noDocumentsAvailable')}
        </p>
      ) : (
        <>
          <div className="space-y-4">
            {filteredDocuments.map((doc) => {
              try {
                // Validate document structure
                const validation = validateDocument(doc);
                
                const docIdValue = doc._id || doc.id;
                const docId = typeof docIdValue === 'string' ? docIdValue : String(docIdValue || 'unknown');
                
                // If document is invalid, render fallback UI
                if (!validation.valid) {
                  return (
                    <Card key={docId} className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-lg font-medium text-yellow-800 dark:text-yellow-200">
                          {t('searchPage.unnamedDocument')}
                        </CardTitle>
                        <div className="text-sm text-yellow-700 dark:text-yellow-300 mt-2">
                          <p className="font-semibold">Document heeft validatiefouten:</p>
                          <ul className="list-disc list-inside mt-1">
                            {validation.errors.map((error, idx) => (
                              <li key={idx}>{error}</li>
                            ))}
                          </ul>
                          <p className="mt-2 text-xs">Document ID: {docId}</p>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <p className="text-sm text-muted-foreground">
                          Dit document kan niet volledig worden weergegeven vanwege ontbrekende of ongeldige gegevens.
                        </p>
                      </CardContent>
                    </Card>
                  );
                }
                
                // Use helper functions for canonical document structure
                const title = getCanonicalDocumentTitle(doc) || t('searchPage.unnamedDocument');
                const documentUrl = getCanonicalDocumentUrl(doc);
                
                // Use getDocumentSourceInfo for proper source metadata extraction
                const sourceInfo = getDocumentSourceInfo(doc);
                const source = sourceInfo.source;
                const sourceUrl = sourceInfo.sourceUrl || documentUrl || '';
                const jurisdiction = sourceInfo.jurisdiction;
                
                // Extract summary/description using utility function that filters technical content
                const summary = getCanonicalDocumentSummary(doc, 200);

                const documentUrlToUse = sourceUrl || documentUrl || '';
                
                return (
                  <Card key={docId} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-2">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={selectedIds.has(docId)}
                          onCheckedChange={() => toggleSelection(docId)}
                          className="mt-1"
                          aria-label={selectedIds.has(docId) ? t('common.deselectDocument') : t('common.selectDocument')}
                        />
                        <div className="flex-1 min-w-0">
                          <CardTitle className="text-lg font-medium mb-2">
                            {title}
                          </CardTitle>
                          {documentUrlToUse && (
                            <div className="flex items-center gap-2 mb-2">
                              <a
                                href={documentUrlToUse}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm text-primary hover:text-primary/80 hover:underline font-medium min-w-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                              >
                                <ExternalLink className="h-4 w-4 flex-shrink-0" />
                                <span className="truncate max-w-[500px] block">{documentUrlToUse}</span>
                              </a>
                            </div>
                          )}
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical className="h-4 w-4" />
                              <span className="sr-only">Document actions</span>
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="!opacity-100 bg-background/100 backdrop-blur-none">
                            <DropdownMenuLabel>{t('common.documentActions')}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {documentUrlToUse && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => copyDocumentUrl(documentUrlToUse)}
                                >
                                  <Copy className="mr-2 h-4 w-4" />
                                  {t('common.copyUrl')}
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => window.open(documentUrlToUse, '_blank', 'noopener,noreferrer')}
                                >
                                  <ExternalLink className="mr-2 h-4 w-4" />
                                  {t('common.openInNewTab')}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => exportSingleDocument(doc, 'csv')}
                              disabled={exporting}
                            >
                              <FileDown className="mr-2 h-4 w-4" />
                              {t('common.exportAsCsv')}
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => exportSingleDocument(doc, 'pdf')}
                              disabled={exporting}
                            >
                              <FileDown className="mr-2 h-4 w-4" />
                              {t('common.exportAsPdf')}
                            </DropdownMenuItem>
                            {onDeleteDocument && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const docIdValue = doc._id || doc.id;
                                    const docId = typeof docIdValue === 'string' ? docIdValue : String(docIdValue || '');
                                    onDeleteDocument(docId);
                                  }}
                                  variant="destructive"
                                >
                                  <Trash2 className="mr-2 h-4 w-4" />
                                  {t('common.delete')}
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm text-muted-foreground items-center">
                        {source && <span>{source}</span>}
                        {jurisdiction && (
                          <Badge variant="outline">
                            {jurisdiction}
                          </Badge>
                        )}
                        {doc.reviewStatus && (
                          <Badge 
                            variant={
                              doc.reviewStatus === 'approved' ? 'default' :
                              doc.reviewStatus === 'rejected' ? 'destructive' :
                              doc.reviewStatus === 'needs_revision' ? 'secondary' :
                              'outline'
                            }
                          >
                            {doc.reviewStatus === 'pending_review' ? t('common.pendingReview') :
                             doc.reviewStatus === 'approved' ? t('common.approved') :
                             doc.reviewStatus === 'rejected' ? t('common.rejected') :
                             t('common.revisionNeeded')}
                          </Badge>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm leading-relaxed mb-3">
                        {summary}
                      </p>
                    </CardContent>
                  </Card>
                );
              } catch (error) {
                // Catch any rendering errors and show fallback UI
                const docIdValue = doc._id || doc.id;
                const docId = typeof docIdValue === 'string' ? docIdValue : String(docIdValue || 'unknown');
                
                logError(error, `library-document-render-error: documentId=${docId}`);
                
                return (
                  <Card key={docId} className="border-red-500 bg-red-50 dark:bg-red-950">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg font-medium text-red-800 dark:text-red-200">
                        {t('library.documentDisplayError')}
                      </CardTitle>
                      <div className="text-sm text-red-700 dark:text-red-300 mt-2">
                        <p>{t('library.documentDisplayErrorDescription')}</p>
                        <p className="mt-2 text-xs">Document ID: {docId}</p>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        {t('library.documentDisplayErrorHelp')}
                      </p>
                    </CardContent>
                  </Card>
                );
              }
            })}
          </div>

          {/* Pagination */}
          {!searchQuery && totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                {t('common.previous')}
              </Button>
              <span className="text-sm text-muted-foreground">
                {t('common.page')} {page} {t('common.pageOf')} {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                {t('common.next')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
