/**
 * Website List Component
 * 
 * List of website cards with empty state handling.
 */

import { useMemo, memo } from 'react';
import { Search } from 'lucide-react';
import { Button } from '../ui/button';
import { WebsiteCard } from './WebsiteCard';
import type { BronWebsite } from '../../services/api';
import { t } from '../../utils/i18n';

interface WebsiteListProps {
  websites: BronWebsite[];
  selectedWebsites: string[];
  onToggleSelection: (websiteId: string) => void;
  onClearFilters: () => void;
  totalWebsites: number;
}

function WebsiteListComponent({
  websites,
  selectedWebsites,
  onToggleSelection,
  onClearFilters,
  totalWebsites: _totalWebsites,
}: WebsiteListProps) {
  // Convert selectedWebsites array to Set for O(1) lookup instead of O(n)
  // This optimization is especially important for large website lists
  const selectedSet = useMemo(() => new Set(selectedWebsites), [selectedWebsites]);
  
  // Create a stable map of toggle handlers to prevent creating new functions on every render
  // This works with React.memo on WebsiteCard to prevent unnecessary re-renders
  // Each website gets a stable handler reference that only changes when onToggleSelection changes
  const toggleHandlers = useMemo(() => {
    const handlers = new Map<string, () => void>();
    websites.forEach((website) => {
      const websiteId = website._id;
      if (websiteId) {
        handlers.set(websiteId, () => {
          onToggleSelection(websiteId);
        });
      }
    });
    return handlers;
  }, [websites, onToggleSelection]);

  if (websites.length === 0) {
    return (
      <div className="p-8 rounded-xl text-center bg-destructive/5">
        <Search className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
        <h4 className="text-lg mb-2 font-semibold font-serif text-foreground">
          {t('websiteList.noWebsitesFound')}
        </h4>
        <p className="mb-4 text-sm text-foreground">
          {t('websiteList.noWebsitesFoundWithFilters')}
        </p>
        <Button
          onClick={onClearFilters}
          variant="outline"
          className="mt-2 text-primary border-primary hover:bg-primary/10"
        >
          {t('websiteList.clearFilters')}
        </Button>
      </div>
    );
  }
  
  return (
    <div className="mt-4 space-y-4" role="list" aria-label={t('websiteList.availableWebsites')} data-testid="website-suggestions-list">
      {websites.map((website) => {
        const websiteId = website._id!;
        return (
          <WebsiteCard
            key={websiteId}
            website={website}
            websiteId={websiteId}
            isSelected={selectedSet.has(websiteId)}
            onToggle={toggleHandlers.get(websiteId) || (() => {})}
          />
        );
      })}
    </div>
  );
}

// Memoize WebsiteList to prevent unnecessary re-renders
// Only re-render when props actually change
export const WebsiteList = memo(WebsiteListComponent, (prevProps, nextProps) => {
  return (
    prevProps.websites.length === nextProps.websites.length &&
    prevProps.selectedWebsites.length === nextProps.selectedWebsites.length &&
    prevProps.totalWebsites === nextProps.totalWebsites && // Used in memo comparison
    prevProps.onToggleSelection === nextProps.onToggleSelection &&
    prevProps.onClearFilters === nextProps.onClearFilters &&
    // Deep compare websites array (check if same reference or same _id values)
    (prevProps.websites === nextProps.websites ||
      (prevProps.websites.length === nextProps.websites.length &&
        prevProps.websites.every((w, i) => w._id === nextProps.websites[i]?._id))) &&
    // Deep compare selectedWebsites array
    (prevProps.selectedWebsites === nextProps.selectedWebsites ||
      (prevProps.selectedWebsites.length === nextProps.selectedWebsites.length &&
        prevProps.selectedWebsites.every((id, i) => id === nextProps.selectedWebsites[i])))
  );
});
