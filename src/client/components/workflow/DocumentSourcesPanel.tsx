/**
 * DocumentSourcesPanel Component
 * 
 * Displays documents discovered during workflow execution in real-time.
 * Shows document titles and sources as they are found.
 */

import { FileText, Loader2 } from 'lucide-react';
import { useCanonicalDocumentsByQuery } from '../../hooks/useCanonicalDocumentWithReactQuery';
import { t } from '../../utils/i18n';
import { getCanonicalDocumentId } from '../../utils/canonicalDocumentUtils';
import { DocumentSourceItem } from './DocumentSourceItem';

interface DocumentSourcesPanelProps {
  queryId: string | null;
  workflowRunId: string | null;
  isWorkflowRunning: boolean;
  className?: string;
}

export function DocumentSourcesPanel({
  queryId,
  workflowRunId: _workflowRunId,
  isWorkflowRunning,
  className = '',
}: DocumentSourcesPanelProps) {
  // Poll documents every 2-3 seconds while workflow is running
  const { data: documents = [], isLoading, error } = useCanonicalDocumentsByQuery(queryId, {
    enabled: !!queryId,
    // Poll every 2.5 seconds when workflow is running
    refetchInterval: isWorkflowRunning && queryId ? 2500 : false,
  });

  // Use React Query's refetchInterval option via query options
  // We'll need to enhance the hook to support this, but for now we'll use a workaround
  // by checking if we should enable the query

  // Get unique documents (deduplicate by ID)
  const uniqueDocuments = Array.from(
    new Map(
      documents.map((doc) => {
        const id = getCanonicalDocumentId(doc);
        return [id || doc.sourceId, doc];
      })
    ).values()
  );

  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-700 flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="flex justify-between items-center p-4 border-b border-gray-700">
        <h3 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-400" />
          {t('documentSources.title')}
        </h3>
        {uniqueDocuments.length > 0 && (
          <span className="px-2 py-1 rounded text-xs font-bold bg-blue-900 text-blue-300">
            {uniqueDocuments.length}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {!queryId ? (
          <div className="text-gray-500 text-center py-8 italic text-sm">
            {t('documentSources.noQueryId')}
          </div>
        ) : isLoading && uniqueDocuments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 space-y-2">
            <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
            <p className="text-gray-400 text-sm">{t('documentSources.loading')}</p>
          </div>
        ) : error ? (
          <div className="text-red-400 text-center py-8 text-sm">
            {t('documentSources.loadError')}
          </div>
        ) : uniqueDocuments.length === 0 ? (
          <div className="text-gray-500 text-center py-8 italic text-sm">
            {isWorkflowRunning
              ? t('documentSources.waitingForDocuments')
              : t('common.noDocumentsFound')}
          </div>
        ) : (
          <div className="space-y-2">
            {uniqueDocuments.map((doc) => {
              const docId = getCanonicalDocumentId(doc);
              if (!docId) return null;
              return (
                <DocumentSourceItem key={docId} document={doc} />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
