/**
 * Selected Websites Summary Component
 * 
 * Displays a summary list of selected websites.
 */

import { useMemo, memo } from 'react';
import type { BronWebsite } from '../../services/api';
import { t } from '../../utils/i18n';

interface SelectedWebsitesSummaryProps {
  selectedWebsites: string[];
  suggestedWebsites: BronWebsite[];
}

function SelectedWebsitesSummaryComponent({
  selectedWebsites,
  suggestedWebsites,
}: SelectedWebsitesSummaryProps) {
  // Create a Map for O(1) lookup instead of O(n) find() for each website
  // This optimization is especially important when many websites are selected
  const websiteMap = useMemo(() => {
    const map = new Map<string, BronWebsite>();
    suggestedWebsites.forEach(website => {
      if (website._id) {
        map.set(website._id, website);
      }
    });
    return map;
  }, [suggestedWebsites]);

  if (selectedWebsites.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 p-6 rounded-xl bg-primary/5">
      <h4 className="mb-4 font-serif font-semibold text-foreground">
        {t('selectedWebsitesSummary.title')}
      </h4>
      <ul className="space-y-1 text-sm">
        {selectedWebsites.map(id => {
          const website = websiteMap.get(id);
          return website ? (
            <li key={id} className="text-muted-foreground">
              • {website.titel}
            </li>
          ) : null;
        })}
      </ul>
    </div>
  );
}

// Memoize SelectedWebsitesSummary to prevent unnecessary re-renders
// Only re-render when props actually change
export const SelectedWebsitesSummary = memo(SelectedWebsitesSummaryComponent, (prevProps, nextProps) => {
  return (
    prevProps.selectedWebsites.length === nextProps.selectedWebsites.length &&
    prevProps.suggestedWebsites.length === nextProps.suggestedWebsites.length &&
    // Deep compare selectedWebsites array
    prevProps.selectedWebsites.every((val, i) => val === nextProps.selectedWebsites[i]) &&
    // Deep compare suggestedWebsites array (by _id for simplicity)
    prevProps.suggestedWebsites.every((val, i) => val._id === nextProps.suggestedWebsites[i]?._id)
  );
});
