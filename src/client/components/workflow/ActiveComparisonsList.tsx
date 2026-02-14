/**
 * Active Comparisons List Component
 * 
 * Displays a list of active workflow comparisons with status badges
 * and selection functionality.
 */

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { t } from '../../utils/i18n';

interface ActiveComparison {
  id: string;
  name: string;
  status: string;
}

interface ActiveComparisonsListProps {
  activeComparisons: ActiveComparison[];
  activeComparisonId: string | null;
  onComparisonSelect: (id: string) => void;
  showList: boolean;
  onToggleList: () => void;
}

export function ActiveComparisonsList({
  activeComparisons,
  activeComparisonId,
  onComparisonSelect,
  showList,
  onToggleList,
}: ActiveComparisonsListProps) {
  if (activeComparisons.length === 0) {
    return null;
  }

  return (
    <Card data-testid="active-comparisons-list">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t('workflowComparison.activeComparisons')}</CardTitle>
            <CardDescription>
              {activeComparisons.length} {activeComparisons.length === 1 ? t('workflowComparison.comparison') : t('workflowComparison.comparisons')} {t('workflowComparison.comparisonsRunning')}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            data-testid="toggle-active-comparisons-list"
            onClick={onToggleList}
            aria-label={t('workflowComparison.activeComparisons')}
            aria-expanded={showList}
          >
            {showList ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </CardHeader>
      {showList && (
        <CardContent>
          <div className="space-y-2" data-testid="active-comparisons-items">
            {activeComparisons.map((comp) => (
              <button
                type="button"
                key={comp.id}
                data-testid={`active-comparison-item-${comp.id}`}
                className={`w-full text-left flex items-center justify-between p-3 border rounded-lg transition-colors ${
                  activeComparisonId === comp.id
                    ? 'bg-primary/10 border-primary'
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => onComparisonSelect(comp.id)}
              >
                <div className="flex-1">
                  <p className="font-medium">{comp.name}</p>
                  <p className="text-sm text-muted-foreground">{t('workflowComparison.id')} {comp.id}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={
                      comp.status === 'running' ? 'default' :
                      comp.status === 'pending' ? 'secondary' :
                      'outline'
                    }
                    data-testid={`comparison-status-${comp.id}`}
                  >
                    {comp.status}
                  </Badge>
                  {activeComparisonId === comp.id && (
                    <Badge variant="outline" data-testid={`comparison-selected-${comp.id}`}>{t('workflowComparison.selected')}</Badge>
                  )}
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
