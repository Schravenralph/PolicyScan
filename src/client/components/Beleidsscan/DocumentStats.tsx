import React, { memo } from 'react';
import { t } from '../../utils/i18n';

interface DocumentStatsProps {
  filteredCount: number;
  totalCount: number;
  hasActiveFilters: boolean;
  onClearFilters: () => void;
}

function DocumentStatsComponent({
  filteredCount,
  totalCount,
  hasActiveFilters,
  onClearFilters,
}: DocumentStatsProps): React.ReactElement {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-primary/5">
      <p className="text-sm text-foreground">
        <strong>{t('documentStats.showing').replace('{{filtered}}', String(filteredCount)).replace('{{total}}', String(totalCount))}</strong>
        {hasActiveFilters && (
          <span className="ml-2 text-xs text-muted-foreground">
            {t('documentStats.filtered')}
          </span>
        )}
      </p>
      {hasActiveFilters && (
        <button
          onClick={onClearFilters}
          className="text-xs px-2 py-1 rounded hover:bg-background transition-colors text-primary"
          aria-label={t('documentStats.clearAllFilters')}
        >
          {t('documentStats.clearAllFilters')}
        </button>
      )}
    </div>
  );
}

// Memoize DocumentStats to prevent unnecessary re-renders
// Only re-render when props actually change
export const DocumentStats = memo(DocumentStatsComponent, (prevProps, nextProps) => {
  return (
    prevProps.filteredCount === nextProps.filteredCount &&
    prevProps.totalCount === nextProps.totalCount &&
    prevProps.hasActiveFilters === nextProps.hasActiveFilters &&
    prevProps.onClearFilters === nextProps.onClearFilters
  );
});



