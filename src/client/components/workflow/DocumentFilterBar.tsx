/**
 * Document Filter Bar Component
 * 
 * Filter buttons for document status (all, pending, approved, rejected).
 */

import { Filter } from 'lucide-react';
import { t } from '../../utils/i18n';
import type { CanonicalDocument } from '../../services/api';
import { getCanonicalDocumentAcceptance } from '../../utils/canonicalDocumentUtils';

interface DocumentFilterBarProps {
  filter: 'all' | 'pending' | 'approved' | 'rejected';
  onFilterChange: (filter: 'all' | 'pending' | 'approved' | 'rejected') => void;
  documents: CanonicalDocument[];
  filteredCount: number;
}

export function DocumentFilterBar({
  filter,
  onFilterChange,
  documents,
  filteredCount,
}: DocumentFilterBarProps) {
  const getCountForFilter = (f: 'all' | 'pending' | 'approved' | 'rejected') => {
    if (f === 'all') return documents.length;
    return documents.filter(d => {
      const acceptance = getCanonicalDocumentAcceptance(d);
      return f === 'pending' ? acceptance === null :
        f === 'approved' ? acceptance === true :
        acceptance === false;
    }).length;
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <div className="flex gap-1">
          {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
            <button
              key={f}
              onClick={() => onFilterChange(f)}
              className={`px-3 py-1 text-sm rounded-full transition-colors ${
                filter === f
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {f === 'all' ? t('workflowResults.all') : 
               f === 'pending' ? t('workflowResults.pending') : 
               f === 'approved' ? t('workflowResults.approved') : 
               t('workflowResults.rejected')}
              {f !== 'all' && (
                <span className="ml-1 text-xs opacity-75">
                  ({getCountForFilter(f)})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="text-sm text-gray-500">
        {filteredCount} {t('workflowResults.ofDocuments')} {documents.length}
      </div>
    </div>
  );
}
