/**
 * BronnenOverzicht List Component
 * 
 * Displays custom bronnen list and main bronnen list with grouping,
 * loading state, and empty state handling.
 */

import { Loader2 } from 'lucide-react';
import { WebsiteCard } from './WebsiteCard';
import { t } from '../utils/i18n';
import { CanonicalDocumentCard } from './CanonicalDocumentCard';
import type { Bron } from '../utils/transformations';
import type { CanonicalDocument } from '../services/api';
import type { MetadataFilters } from './MetadataFilterPanel';
import type { GroupingOption } from './MetadataGroupingSelector';

interface GroupedItem {
  type: 'document' | 'website';
  document?: CanonicalDocument;
  bron?: Bron;
}

interface BronnenOverzichtListProps {
  // Custom bronnen
  customBronnen: Bron[];
  filters: MetadataFilters;
  onCustomBronStatusChange: (bronId: string, status: 'approved' | 'rejected' | 'pending') => void;
  onRemoveCustomBron: (bronId: string) => void;
  
  // Main list
  groupedItems: Record<string, GroupedItem[]>;
  grouping: GroupingOption;
  isFetchingBronnen: boolean;
  totalCount: number;
  
  // Handlers
  onWebsiteStatusChange: (bronId: string, status: 'approved' | 'rejected' | 'pending') => void;
  onDocumentStatusChange: (documentId: string, status: 'approved' | 'rejected' | 'pending') => void;
}

export function BronnenOverzichtList({
  customBronnen,
  filters,
  onCustomBronStatusChange,
  onRemoveCustomBron,
  groupedItems,
  grouping,
  isFetchingBronnen,
  totalCount,
  onWebsiteStatusChange,
  onDocumentStatusChange,
}: BronnenOverzichtListProps) {
  return (
    <>
      {/* Custom Bronnen List */}
      {customBronnen.length > 0 && (
        <div className="mb-8">
          <h3 className="text-2xl mb-4 font-serif font-semibold text-foreground">
            Eigen documenten
          </h3>
          <div className="space-y-4">
            {customBronnen.map((bron) => (
              <WebsiteCard
                key={bron.id}
                bron={bron}
                onStatusChange={onCustomBronStatusChange}
                onRemove={onRemoveCustomBron}
                isCustom
              />
            ))}
          </div>
        </div>
      )}

      {/* Bronnen List */}
      <div>
        <h3 className="text-2xl mb-4 font-serif font-semibold text-foreground">
          Gevonden documenten ({totalCount})
        </h3>
        <div className="space-y-4">
          {isFetchingBronnen ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              Bronnen worden geladen...
            </div>
          ) : Object.keys(groupedItems).length > 0 ? (
            Object.entries(groupedItems).map(([groupName, groupItems]) => (
              <div key={groupName} className="mb-6">
                {grouping !== 'none' && (
                  <h4 className="text-lg mb-3 font-serif font-semibold text-foreground">
                    {groupName} ({groupItems.length})
                  </h4>
                )}
                <div className="space-y-4">
                  {groupItems.map((item) => {
                    if (item.type === 'website' && item.bron) {
                      return (
                        <WebsiteCard
                          key={item.bron.id}
                          bron={item.bron}
                          onStatusChange={onWebsiteStatusChange}
                        />
                      );
                    } else if (item.document) {
                      return (
                        <CanonicalDocumentCard
                          key={item.document._id}
                          document={item.document}
                          onStatusChange={onDocumentStatusChange}
                        />
                      );
                    } else if (item.bron) {
                      return (
                        <WebsiteCard
                          key={item.bron.id}
                          bron={item.bron}
                          onStatusChange={onCustomBronStatusChange}
                          onRemove={onRemoveCustomBron}
                          isCustom
                        />
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground">
              {Object.keys(filters).length > 0
                ? t('common.noDocumentsFoundWithFilters')
                : t('common.noDocumentsFound')}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
