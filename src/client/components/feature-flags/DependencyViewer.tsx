/**
 * Dependency Viewer Component
 * 
 * Modal/dialog for viewing feature flag dependencies.
 */

import { X, AlertCircle, Info, AlertTriangle, GitBranch } from 'lucide-react';
import { Button } from '../ui/button';
import type {
  FlagDependencyGraph,
} from '../../types/featureFlags.js';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils.js';
import { t } from '../../utils/i18n';

interface DependencyViewerProps {
  flagName: string;
  dependencyGraphs: Map<string, FlagDependencyGraph>;
  onClose: () => void;
}

export function DependencyViewer({
  flagName,
  dependencyGraphs,
  onClose,
}: DependencyViewerProps) {
  const graph = dependencyGraphs.get(flagName);

  if (!graph) {
    return (
      <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
        <div className="bg-white dark:bg-gray-900 rounded-lg border-2 border-primary p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold">{t('featureFlags.dependenciesFor')} {getFeatureFlagDisplayName(flagName)}</h3>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">{t('featureFlags.noDependencyInfo')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white dark:bg-gray-900 border-primary rounded-lg border-2 p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold">{t('featureFlags.dependenciesFor')} {getFeatureFlagDisplayName(flagName)}</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-4">
          {graph.parents.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <Info className="h-4 w-4" />
                {t('featureFlags.parentFlags')}
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {graph.parents.map(parent => (
                  <li key={parent} className="text-sm">
                    <span className="text-xs">{getFeatureFlagDisplayName(parent)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {graph.requires.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                {t('featureFlags.requiredFlags')}
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {graph.requires.map(req => (
                  <li key={req} className="text-sm">
                    <span className="text-xs">{getFeatureFlagDisplayName(req)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {graph.children.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <GitBranch className="h-4 w-4" />
                {t('featureFlags.childFlags')}
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {graph.children.map(child => (
                  <li key={child} className="text-sm">
                    <span className="text-xs">{getFeatureFlagDisplayName(child)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {graph.conflicts.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                {t('featureFlags.conflictingFlags')}
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {graph.conflicts.map(conflict => (
                  <li key={conflict} className="text-sm">
                    <span className="text-xs">{getFeatureFlagDisplayName(conflict)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {graph.mutuallyExclusiveWith.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-red-600" />
                {t('featureFlags.mutuallyExclusiveFlags')}
              </h4>
              <ul className="list-disc list-inside space-y-1">
                {graph.mutuallyExclusiveWith.map(exclusive => (
                  <li key={exclusive} className="text-sm">
                    <span className="text-xs">{getFeatureFlagDisplayName(exclusive)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {graph.parents.length === 0 && graph.requires.length === 0 && 
           graph.children.length === 0 && graph.conflicts.length === 0 && 
           graph.mutuallyExclusiveWith.length === 0 && (
            <p className="text-sm text-muted-foreground">{t('featureFlags.noDependenciesDefined')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
