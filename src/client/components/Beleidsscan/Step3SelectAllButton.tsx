/**
 * Step3 Select All Button Component
 * 
 * Button to select or deselect all filtered documents.
 */

import { memo } from 'react';
import { CheckSquare, Square } from 'lucide-react';
import { t } from '../../utils/i18n';

interface Step3SelectAllButtonProps {
  selectedCount: number;
  totalCount: number;
  onSelectAll: () => void;
  disabled?: boolean;
}

function Step3SelectAllButtonComponent({
  selectedCount,
  totalCount,
  onSelectAll,
  disabled = false,
}: Step3SelectAllButtonProps) {
  const allSelected = selectedCount === totalCount && totalCount > 0;

  return (
    <div className="flex items-center justify-between">
      <button
        onClick={onSelectAll}
        disabled={disabled}
        data-testid="select-all-documents-button"
        className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 hover:shadow-sm transition-all text-sm disabled:opacity-50 disabled:cursor-not-allowed bg-background border-primary text-primary"
        aria-label={allSelected ? t('step3SelectAllButton.deselectAllAria').replace('{{count}}', String(totalCount)) : t('step3SelectAllButton.selectAllAria').replace('{{count}}', String(totalCount))}
      >
        {allSelected ? (
          <>
            <CheckSquare className="w-4 h-4" aria-hidden="true" />
            {t('step3SelectAllButton.deselectAll')}
          </>
        ) : (
          <>
            <Square className="w-4 h-4" aria-hidden="true" />
            {t('step3SelectAllButton.selectAll').replace('{{count}}', String(totalCount))}
          </>
        )}
      </button>
    </div>
  );
}

// Memoize Step3SelectAllButton to prevent unnecessary re-renders
// Only re-render when props actually change
export const Step3SelectAllButton = memo(Step3SelectAllButtonComponent, (prevProps, nextProps) => {
  return (
    prevProps.selectedCount === nextProps.selectedCount &&
    prevProps.totalCount === nextProps.totalCount &&
    prevProps.onSelectAll === nextProps.onSelectAll &&
    prevProps.disabled === nextProps.disabled
  );
});
