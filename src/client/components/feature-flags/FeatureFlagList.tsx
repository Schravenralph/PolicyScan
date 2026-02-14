/**
 * FeatureFlagList Component
 * 
 * Main flag list rendering component for FeatureFlagsPage.
 * Handles grouped view, list view, environment flags, and dependency viewer.
 * Extracted from FeatureFlagsPage.tsx for better organization.
 */

import { Settings, Database, Info, GitBranch, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Filter } from 'lucide-react';
import type {
  FeatureFlag,
  FeatureFlagCategory,
  ValidationError,
  ValidationWarning,
  FlagDependencyGraph,
  CategoryStats,
} from '../../types/featureFlags.js';
import { getFeatureFlagDisplayName, buildFlagTree, flattenFlagTree, type FlagTreeNode } from '../../utils/featureFlagUtils.js';
import { FlagCard } from './FlagCard';
import { DependencyViewer } from './DependencyViewer';
import { t } from '../../utils/i18n';
import { formatFeatureFlagState } from '../../utils/featureFlagFormatters.js';

export interface FeatureFlagListProps {
  // Flags data
  environmentFlags: FeatureFlag[];
  databaseFlags: FeatureFlag[];
  filteredDatabaseFlags: FeatureFlag[];
  filteredIndependentFlags: FeatureFlag[];
  filteredDependentFlags: FeatureFlag[];
  flagsByCategory: Record<FeatureFlagCategory, FeatureFlag[]>;
  categoryStats: Record<FeatureFlagCategory, CategoryStats>;
  categories: FeatureFlagCategory[];
  
  // View mode
  viewMode: 'list' | 'grouped';
  selectedCategory: FeatureFlagCategory | 'All';
  onCategoryChange: (category: FeatureFlagCategory | 'All') => void;
  
  // Draft mode
  draftMode: boolean;
  draftFlags: Record<string, boolean>;
  
  // State
  updating: Set<string>;
  validationErrors: Record<string, ValidationError[]>;
  validationWarnings: Record<string, ValidationWarning[]>;
  dependencyGraphs: Map<string, FlagDependencyGraph>;
  selectedFlagForDeps: string | null;
  showDependencies: boolean;
  
  // Actions
  onUpdateFlag: (flagName: string, enabled: boolean) => void;
  onViewDependencies: (flagName: string) => void;
  onCloseDependencies: () => void;
  onEnableCategoryFlags: (category: FeatureFlagCategory) => void;
  onDisableCategoryFlags: (category: FeatureFlagCategory) => void;
  
  // Helper functions
  getFlagState: (flag: FeatureFlag) => boolean;
}


/**
 * Main feature flag list component
 */
export function FeatureFlagList({
  environmentFlags,
  databaseFlags,
  filteredDatabaseFlags: _filteredDatabaseFlags,
  filteredIndependentFlags,
  filteredDependentFlags,
  flagsByCategory,
  categoryStats,
  categories,
  viewMode,
  selectedCategory,
  onCategoryChange,
  draftMode,
  draftFlags,
  updating,
  validationErrors,
  validationWarnings,
  dependencyGraphs,
  selectedFlagForDeps,
  showDependencies,
  onUpdateFlag,
  onViewDependencies,
  onCloseDependencies,
  onEnableCategoryFlags,
  onDisableCategoryFlags,
  getFlagState,
}: FeatureFlagListProps) {
  // Build hierarchical tree structure for filtered flags
  const flagTree = buildFlagTree(_filteredDatabaseFlags, dependencyGraphs);
  const flattenedTree = flattenFlagTree(flagTree);
  
  // Create a map to quickly check if a flag has children
  const hasChildrenMap = new Map<string, boolean>();
  function markChildren(node: FlagTreeNode) {
    hasChildrenMap.set(node.flag.name, node.children.length > 0);
    for (const child of node.children) {
      markChildren(child);
    }
  }
  for (const root of flagTree) {
    markChildren(root);
  }
  
  return (
    <>
      {/* Environment Flags Section */}
      {environmentFlags.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{t('featureFlags.environmentVariables')}</h2>
            <span className="text-sm text-muted-foreground">
              ({environmentFlags.length} {t('featureFlags.flags')})
            </span>
          </div>
          <div className="rounded-lg border bg-card">
            <div className="p-4 space-y-4">
              {environmentFlags.map((flag) => (
                <div
                  key={flag.name}
                  className="flex items-center justify-between p-4 rounded-md border bg-muted/50"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold">{getFeatureFlagDisplayName(flag.name)}</span>
                      <span className="px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                        {t('featureFlags.environment')}
                      </span>
                    </div>
                    {flag.description && (
                      <p className="text-sm text-muted-foreground mt-1">
                        {flag.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={flag.enabled}
                        disabled={true}
                        aria-label={`${getFeatureFlagDisplayName(flag.name)} toggle`}
                      />
                      <span className="text-sm font-medium">
                        {formatFeatureFlagState(flag.enabled)}
                      </span>
                    </div>
                    <AlertCircle className="h-4 w-4 text-muted-foreground" aria-label={t('common.setViaEnvironmentVariable')} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Manageable Flags Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-xl font-semibold">{t('featureFlags.manageableFlags')}</h2>
            <span className="text-sm text-muted-foreground">
              ({databaseFlags.length} {t('featureFlags.flags')})
            </span>
            {draftMode && (
              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                {t('featureFlags.editModeBadge')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedCategory} onValueChange={onCategoryChange}>
              <SelectTrigger className="w-[200px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder={t('featureFlags.filterByCategory')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">{t('featureFlags.allCategories')}</SelectItem>
                {categories.map(category => (
                  <SelectItem key={category} value={category}>
                    {category} ({categoryStats[category]?.total || 0})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Grouped View */}
        {viewMode === 'grouped' && (
          <div className="space-y-6">
            {categories.map(category => {
              const categoryFlags = flagsByCategory[category];
              if (categoryFlags.length === 0) return null;
              const stats = categoryStats[category];
              return (
                <div key={category} className="rounded-lg border bg-card">
                  <div className="p-4 border-b bg-muted/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-semibold">{category}</h3>
                        <p className="text-sm text-muted-foreground">
                          {stats.enabled} enabled, {stats.disabled} disabled, {stats.total} total
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => onEnableCategoryFlags(category)}
                          variant="outline"
                          size="sm"
                          disabled={stats.enabled === stats.total}
                        >
                          Enable All
                        </Button>
                        <Button
                          onClick={() => onDisableCategoryFlags(category)}
                          variant="outline"
                          size="sm"
                          disabled={stats.disabled === stats.total}
                        >
                          Disable All
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    {categoryFlags.map((flag) => {
                      const treeNode = flattenedTree.find(n => n.flag.name === flag.name);
                      return (
                        <FlagCard
                          key={flag.name}
                          flag={flag}
                          draftMode={draftMode}
                          draftFlags={draftFlags}
                          updating={updating}
                          validationErrors={validationErrors}
                          validationWarnings={validationWarnings}
                          onUpdateFlag={onUpdateFlag}
                          onViewDependencies={onViewDependencies}
                          getFlagState={getFlagState}
                          depth={treeNode?.depth || 0}
                          hasChildren={hasChildrenMap.get(flag.name) || false}
                        />
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* List View */}
        {viewMode === 'list' && (
          <div className="space-y-6">
            {/* Independent Flags Section */}
            {filteredIndependentFlags.length > 0 && (
              <div className="rounded-lg border bg-card">
                <div className="p-4 border-b bg-muted/50">
                  <div className="flex items-center gap-2">
                    <Info className="h-5 w-5 text-muted-foreground" />
                    <h3 className="text-lg font-semibold">Independent Flags</h3>
                    <span className="text-sm text-muted-foreground">
                      ({filteredIndependentFlags.length} flags with no dependencies)
                    </span>
                  </div>
                </div>
                <div className="p-4 space-y-4">
                  {filteredIndependentFlags.map((flag) => {
                    const treeNode = flattenedTree.find(n => n.flag.name === flag.name);
                    return (
                      <FlagCard
                        key={flag.name}
                        flag={flag}
                        draftMode={draftMode}
                        draftFlags={draftFlags}
                        updating={updating}
                        validationErrors={validationErrors}
                        validationWarnings={validationWarnings}
                        onUpdateFlag={onUpdateFlag}
                        onViewDependencies={onViewDependencies}
                        getFlagState={getFlagState}
                        depth={treeNode?.depth || 0}
                        hasChildren={hasChildrenMap.get(flag.name) || false}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Dependent Flags Section */}
            {filteredDependentFlags.length > 0 && (
              <div className="rounded-lg border bg-card">
                {filteredIndependentFlags.length > 0 && (
                  <div className="p-4 border-b bg-muted/50">
                    <div className="flex items-center gap-2">
                      <GitBranch className="h-5 w-5 text-muted-foreground" />
                      <h3 className="text-lg font-semibold">Dependent Flags</h3>
                      <span className="text-sm text-muted-foreground">
                        ({filteredDependentFlags.length} flags with dependencies)
                      </span>
                    </div>
                  </div>
                )}
                <div className="p-4 space-y-4">
                  {filteredDependentFlags.map((flag) => {
                    const treeNode = flattenedTree.find(n => n.flag.name === flag.name);
                    return (
                      <FlagCard
                        key={flag.name}
                        flag={flag}
                        draftMode={draftMode}
                        draftFlags={draftFlags}
                        updating={updating}
                        validationErrors={validationErrors}
                        validationWarnings={validationWarnings}
                        onUpdateFlag={onUpdateFlag}
                        onViewDependencies={onViewDependencies}
                        getFlagState={getFlagState}
                        depth={treeNode?.depth || 0}
                        hasChildren={hasChildrenMap.get(flag.name) || false}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Fallback if no flags match filter */}
            {filteredIndependentFlags.length === 0 && filteredDependentFlags.length === 0 && (
              <div className="rounded-lg border bg-card">
                <div className="p-4">
                  <div className="text-center py-8 text-muted-foreground">
                    {selectedCategory === 'All' 
                      ? t('featureFlags.noManageableFlags')
                      : t('featureFlags.noFlagsInCategory').replace('{{category}}', selectedCategory)}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dependency Viewer Modal */}
      {showDependencies && selectedFlagForDeps && (
        <DependencyViewer
          flagName={selectedFlagForDeps}
          dependencyGraphs={dependencyGraphs}
          onClose={onCloseDependencies}
        />
      )}
    </>
  );
}

