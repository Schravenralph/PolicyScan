/**
 * DocumentSourceItem Component
 * 
 * Displays a single document in the document sources panel.
 * Shows title and source information in a minimal, clean format.
 */

import { FileText } from 'lucide-react';
import { getCanonicalDocumentTitle, getCanonicalDocumentSource, getCanonicalDocumentUrl } from '../../utils/canonicalDocumentUtils';
import type { CanonicalDocument } from '../../services/api';
import { t } from '../../utils/i18n';

interface DocumentSourceItemProps {
  document: CanonicalDocument;
}

export function DocumentSourceItem({ document }: DocumentSourceItemProps) {
  const title = getCanonicalDocumentTitle(document);
  const source = getCanonicalDocumentSource(document);
  const url = getCanonicalDocumentUrl(document);

  // Extract source information from enrichmentMetadata if available
  const enrichmentMetadata = document.enrichmentMetadata as Record<string, unknown> | undefined;
  const municipality = enrichmentMetadata?.municipality as string | undefined;
  const author = enrichmentMetadata?.author as string | undefined;
  const origin = enrichmentMetadata?.origin as string | undefined;

  // Extract sourceMetadata for Rechtspraak documents
  const sourceMetadata = document.sourceMetadata as Record<string, unknown> | undefined;
  const legacyWebsiteTitel = sourceMetadata?.legacyWebsiteTitel as string | undefined;
  const websiteTitel = sourceMetadata?.website_titel as string | undefined;

  // Determine display source with proper fallback chain:
  // 1. municipality/author/origin (from enrichmentMetadata)
  // 2. publisherAuthority (for Rechtspraak documents)
  // 3. legacyWebsiteTitel or website_titel (from sourceMetadata)
  // 4. source field (e.g., 'Rechtspraak')
  // 5. unknown fallback
  const displaySource = 
    municipality || 
    author || 
    origin || 
    document.publisherAuthority || 
    legacyWebsiteTitel || 
    websiteTitel || 
    source || 
    t('common.unknown');

  // Truncate title if too long
  const displayTitle = title.length > 60 ? `${title.substring(0, 60)}...` : title;

  return (
    <div className="bg-gray-800 rounded-lg p-3 hover:bg-gray-700 transition-colors border border-gray-700">
      <div className="flex items-start gap-2">
        <FileText className="w-4 h-4 text-gray-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-gray-200 truncate" title={title}>
            {displayTitle}
          </div>
          <div className="text-xs text-gray-400 mt-1">
            {displaySource}
          </div>
          {url && (
            <div className="text-xs text-gray-500 mt-1 truncate" title={url}>
              {url.length > 50 ? `${url.substring(0, 50)}...` : url}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
