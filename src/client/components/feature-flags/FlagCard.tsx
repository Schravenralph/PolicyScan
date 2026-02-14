/**
 * Flag Card Component
 * 
 * Individual feature flag card with toggle, validation, and dependency viewer.
 */

import { GitBranch, AlertCircle, AlertTriangle } from 'lucide-react';
import { Switch } from '../ui/switch';
import { Button } from '../ui/button';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils.js';
import { t } from '../../utils/i18n';
import { formatFeatureFlagState } from '../../utils/featureFlagFormatters.js';
import type {
  FeatureFlag,
  ValidationError,
  ValidationWarning,
} from '../../types/featureFlags.js';

interface FlagCardProps {
  flag: FeatureFlag;
  draftMode: boolean;
  draftFlags: Record<string, boolean>;
  updating: Set<string>;
  validationErrors: Record<string, ValidationError[]>;
  validationWarnings: Record<string, ValidationWarning[]>;
  onUpdateFlag: (flagName: string, enabled: boolean) => void;
  onViewDependencies: (flagName: string) => void;
  getFlagState: (flag: FeatureFlag) => boolean;
  depth?: number; // Depth in dependency tree for indentation
  hasChildren?: boolean; // Whether this flag has dependent children
}

export function FlagCard({
  flag,
  draftMode,
  draftFlags,
  updating,
  validationErrors,
  validationWarnings,
  onUpdateFlag,
  onViewDependencies,
  getFlagState,
  depth = 0,
  hasChildren = false,
}: FlagCardProps) {
  const flagState = getFlagState(flag);
  const hasPendingChange = draftMode && draftFlags[flag.name] !== undefined && draftFlags[flag.name] !== flag.enabled;
  
  // Calculate indentation based on depth
  const indentStyle = depth > 0 ? { marginLeft: `${depth * 1.5}rem` } : undefined;

  return (
    <div className={`flex items-center justify-between p-3 rounded-md border bg-background`} style={indentStyle}>
      <div className="flex-1 flex items-start gap-2">
        {/* Visual connector for hierarchical display */}
        {depth > 0 && (
          <div className="flex flex-col items-center pt-1 min-w-[1rem]">
            <div className="w-px bg-border" style={{ height: '0.75rem', marginTop: '0.5rem' }} />
            <div className="w-2 h-2 rounded-full bg-border -mt-1" />
            {hasChildren && (
              <div className="w-px bg-border flex-1 min-h-[1rem]" />
            )}
          </div>
        )}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold">{getFeatureFlagDisplayName(flag.name)}</span>
            {flag.source === 'database' ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                Database
              </span>
            ) : flag.source === 'default' ? (
              <span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200">
                Default
              </span>
            ) : null}
          </div>
          {flag.description && (
          <p className="text-sm text-muted-foreground mt-1">
            {flag.description}
          </p>
        )}
        {flag.updatedAt && (
          <p className="text-xs text-muted-foreground mt-1">
            Last updated: {new Date(flag.updatedAt).toLocaleString()} by {flag.updatedBy || 'unknown'}
          </p>
        )}
      </div>
      <div className="flex items-center gap-4">
        {validationErrors[flag.name] && validationErrors[flag.name].length > 0 && (
          <div className="flex flex-col gap-1">
            {validationErrors[flag.name].map((err, idx) => (
              <div key={idx} className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3 w-3" />
                <span>{err.message}</span>
              </div>
            ))}
          </div>
        )}
        {validationWarnings[flag.name] && validationWarnings[flag.name].length > 0 && (
          <div className="flex flex-col gap-1">
            {validationWarnings[flag.name].map((warn, idx) => (
              <div key={idx} className="flex items-center gap-1 text-xs text-yellow-600 dark:text-yellow-400">
                <AlertTriangle className="h-3 w-3" />
                <span>{warn.message}</span>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onViewDependencies(flag.name)}
            className="h-8 w-8 p-0"
            title={t('featureFlags.viewDependencies')}
          >
            <GitBranch className="h-4 w-4" />
          </Button>
          <Switch
            checked={flagState}
            disabled={updating.has(flag.name) || flag.source === 'environment'}
            onCheckedChange={(checked) => onUpdateFlag(flag.name, checked)}
            aria-label={`${getFeatureFlagDisplayName(flag.name)} toggle`}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onUpdateFlag(flag.name, !flagState)}
            disabled={updating.has(flag.name) || flag.source === 'environment'}
            className={`text-sm font-medium h-auto p-1 ${
              hasPendingChange ? 'text-blue-600 dark:text-blue-400' : ''
            }`}
            aria-label={`Toggle ${getFeatureFlagDisplayName(flag.name)} to ${flagState ? 'disabled' : 'enabled'}`}
          >
            {formatFeatureFlagState(flagState)}
          </Button>
          {hasPendingChange && (
            <span className="text-xs text-blue-600 dark:text-blue-400" title={t('common.pendingChange')}>
              (pending)
            </span>
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
