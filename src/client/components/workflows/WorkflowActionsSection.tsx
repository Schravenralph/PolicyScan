/**
 * Workflow Actions Section Component
 * 
 * Action buttons for workflow operations (export, duplicate, share, close).
 */

import { Share2, Download, Copy, Loader2 } from 'lucide-react';
import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

interface WorkflowActionsSectionProps {
  onExport: () => void;
  onDuplicate: () => void;
  onShare: () => void;
  onClose: () => void;
  isDuplicating: boolean;
}

export function WorkflowActionsSection({
  onExport,
  onDuplicate,
  onShare,
  onClose,
  isDuplicating,
}: WorkflowActionsSectionProps) {
  return (
    <div className="flex justify-between items-center pt-4 border-t">
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={onExport}
          title={t('workflowActions.exportJsonTitle')}
        >
          <Download className="w-4 h-4 mr-2" />
          {t('workflowActions.exportJson')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onDuplicate}
          disabled={isDuplicating}
          title={t('workflowActions.duplicateTitle')}
        >
          {isDuplicating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {t('workflowActions.duplicating')}
            </>
          ) : (
            <>
              <Copy className="w-4 h-4 mr-2" />
              {t('workflowActions.duplicate')}
            </>
          )}
        </Button>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={onShare}>
          <Share2 className="w-4 h-4 mr-2" />
          {t('workflowActions.share')}
        </Button>
        <Button variant="outline" onClick={onClose}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  );
}
