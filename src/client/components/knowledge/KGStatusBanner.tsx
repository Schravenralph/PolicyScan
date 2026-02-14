/**
 * Knowledge Graph Status Banner Component
 * 
 * Displays current KG status:
 * - Current branch
 * - Stats (entities, relationships)
 * - Pending changes indicator
 */
import { GitBranch, AlertCircle } from 'lucide-react';
import { Alert, AlertDescription } from '../ui/alert';
import { Badge } from '../ui/badge';
import type { KGStatus } from '../../services/api/KnowledgeGraphManagementApiService';
import { t } from '../../utils/i18n';

interface KGStatusBannerProps {
  status: KGStatus | null;
}

export function KGStatusBanner({ status }: KGStatusBannerProps) {
  if (!status) return null;

  return (
    <Alert className="mb-6">
      <GitBranch className="h-4 w-4" />
      <AlertDescription>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>
              <strong>{t('kg.status.currentBranch')}</strong> <Badge variant="outline">{status.currentBranch}</Badge>
            </span>
            <span>
              <strong>{t('kg.status.entities')}</strong> {status.stats.entityCount} | <strong>{t('kg.status.relationships')}</strong> {status.stats.relationshipCount}
            </span>
          </div>
          {status.pendingChanges.entityCount > 0 || status.pendingChanges.relationshipCount > 0 ? (
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              <span className="text-amber-600">
                <strong>{t('kg.status.pendingChanges')}</strong> {t('kg.status.pendingChangesCount')
                  .replace('{{entityCount}}', String(status.pendingChanges.entityCount))
                  .replace('{{relationshipCount}}', String(status.pendingChanges.relationshipCount))}
              </span>
            </div>
          ) : (
            <Badge variant="secondary">{t('kg.status.noPendingChanges')}</Badge>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
