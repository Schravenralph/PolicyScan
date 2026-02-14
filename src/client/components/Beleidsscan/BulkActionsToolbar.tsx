/**
 * Bulk Actions Toolbar Component
 * 
 * Toolbar for performing bulk actions on selected documents
 * (approve, reject, deselect) with selection count display.
 */

import { memo } from 'react';
import { CheckSquare, X, Info } from 'lucide-react';
import { Button } from '../ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { t } from '../../utils/i18n';

interface BulkActionsToolbarProps {
  selectedCount: number;
  onBulkApprove: () => Promise<void>;
  onBulkReject: () => Promise<void>;
  onDeselectAll: () => void;
}

function BulkActionsToolbarComponent({
  selectedCount,
  onBulkApprove,
  onBulkReject,
  onDeselectAll,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg bg-primary/10 border border-primary/20">
      <div className="flex items-center gap-2 text-sm text-foreground">
        <strong>{selectedCount}</strong> {t('bulkActionsToolbar.documentsSelected').replace('{{count}}', String(selectedCount)).replace('{{plural}}', selectedCount !== 1 ? 'en' : '')}
        <Popover>
          <PopoverTrigger asChild>
            <button 
              className="p-1 hover:bg-background rounded transition-colors" 
              title={t('bulkActionsToolbar.bulkActionsInfo')} 
              aria-label={t('bulkActionsToolbar.bulkActionsInfoAria')}
            >
              <Info className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-foreground">{t('bulkActionsToolbar.bulkActionsTitle')}</h4>
              <p className="text-xs text-muted-foreground">
                {t('bulkActionsToolbar.bulkActionsDescription')}
              </p>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <div className="flex gap-2">
        <Button
          onClick={onBulkApprove}
          className="flex items-center gap-2"
          data-testid="bulk-approve-documents-button"
          aria-label={t('bulkActionsToolbar.approveAria').replace('{{count}}', String(selectedCount)).replace('{{plural}}', selectedCount !== 1 ? 'en' : '')}
        >
          <CheckSquare className="w-4 h-4" aria-hidden="true" />
          {t('bulkActionsToolbar.approve').replace('{{count}}', String(selectedCount))}
        </Button>
        <Button
          onClick={onBulkReject}
          variant="outline"
          className="flex items-center gap-2 border-destructive text-destructive hover:bg-destructive/10"
          data-testid="bulk-reject-documents-button"
          aria-label={t('bulkActionsToolbar.rejectAria').replace('{{count}}', String(selectedCount)).replace('{{plural}}', selectedCount !== 1 ? 'en' : '')}
        >
          <X className="w-4 h-4" aria-hidden="true" />
          {t('bulkActionsToolbar.reject').replace('{{count}}', String(selectedCount))}
        </Button>
        <Button
          onClick={onDeselectAll}
          variant="outline"
          className="flex items-center gap-2 text-foreground"
          data-testid="deselect-all-documents-button"
          aria-label={t('bulkActionsToolbar.deselectAllSelected')}
        >
          <X className="w-4 h-4" aria-hidden="true" />
          {t('bulkActionsToolbar.deselect')}
        </Button>
      </div>
    </div>
  );
}

// Memoize BulkActionsToolbar to prevent unnecessary re-renders
// Only re-render when props actually change
export const BulkActionsToolbar = memo(BulkActionsToolbarComponent, (prevProps, nextProps) => {
  return (
    prevProps.selectedCount === nextProps.selectedCount &&
    prevProps.onBulkApprove === nextProps.onBulkApprove &&
    prevProps.onBulkReject === nextProps.onBulkReject &&
    prevProps.onDeselectAll === nextProps.onDeselectAll
  );
});
