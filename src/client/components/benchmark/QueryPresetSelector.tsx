/**
 * Query Preset Selector Component
 * 
 * Multi-select component for query presets with search, filtering, grouping, and query preview.
 * Allows users to select multiple presets from the API and see a preview of combined queries.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { Loader2, Search, X } from 'lucide-react';
import { api } from '../../services/api';
import { toast } from '../../utils/toast';
import { logError } from '../../utils/errorHandler';

/**
 * Query Preset interface matching the API response
 */
interface QueryPreset {
  id: string;
  name: string;
  description: string;
  source: 'scraper' | 'iplo' | 'website' | 'manual';
  sourceId?: string;
  queries: string[];
  keywords?: string[];
  category?: string;
  queryCount: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Component props
 */
export interface QueryPresetSelectorProps {
  selectedPresetIds: string[];
  onSelectionChange: (presetIds: string[]) => void;
  groupBy?: 'category' | 'source' | 'none';
  filterBy?: string;
  showPreview?: boolean;
}

/**
 * Grouped presets by key
 */
type GroupedPresets = Record<string, QueryPreset[]>;

/**
 * Query Preset Selector Component
 * 
 * @component
 */
export function QueryPresetSelector({
  selectedPresetIds,
  onSelectionChange,
  groupBy = 'category',
  filterBy,
  showPreview = true,
}: QueryPresetSelectorProps) {
  const [presets, setPresets] = useState<QueryPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState(filterBy || '');

  /**
   * Load presets from API
   */
  const loadPresets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get<{ presets: QueryPreset[]; total: number }>('/api/query-presets');
      setPresets(response.presets || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      logError(err, 'load-query-presets');
      setError(errorMessage);
      toast.error('Fout', 'Kan presets niet laden.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load presets on mount
  useEffect(() => {
    loadPresets();
  }, [loadPresets]);

  // Update search query when filterBy prop changes
  useEffect(() => {
    if (filterBy !== undefined) {
      setSearchQuery(filterBy);
    }
  }, [filterBy]);

  /**
   * Handle preset toggle selection
   */
  const handlePresetToggle = useCallback((presetId: string) => {
    const newSelection = selectedPresetIds.includes(presetId)
      ? selectedPresetIds.filter((id: string) => id !== presetId)
      : [...selectedPresetIds, presetId];
    onSelectionChange(newSelection);
  }, [selectedPresetIds, onSelectionChange]);

  /**
   * Filter presets by search query
   */
  const filteredPresets = useMemo(() => {
    if (!searchQuery) {
      return presets;
    }

    const query = searchQuery.toLowerCase();
    return presets.filter(preset => {
      return (
        preset.name.toLowerCase().includes(query) ||
        preset.description.toLowerCase().includes(query) ||
        preset.queries.some(q => q.toLowerCase().includes(query)) ||
        (preset.keywords && preset.keywords.some(k => k.toLowerCase().includes(query)))
      );
    });
  }, [presets, searchQuery]);

  /**
   * Handle select all
   */
  const handleSelectAll = useCallback(() => {
    const allIds = filteredPresets.map(p => p.id);
    onSelectionChange(allIds);
  }, [filteredPresets, onSelectionChange]);

  /**
   * Handle clear all
   */
  const handleClearAll = useCallback(() => {
    onSelectionChange([]);
  }, [onSelectionChange]);

  /**
   * Group presets by category, source, or none
   */
  const groupedPresets = useMemo((): GroupedPresets => {
    if (groupBy === 'none') {
      return { 'All': filteredPresets };
    }

    const grouped: GroupedPresets = {};

    for (const preset of filteredPresets) {
      const key = groupBy === 'category'
        ? (preset.category || 'Uncategorized')
        : preset.source;

      if (!grouped[key]) {
        grouped[key] = [];
      }
      grouped[key].push(preset);
    }

    return grouped;
  }, [filteredPresets, groupBy]);

  /**
   * Get selected presets
   */
  const selectedPresets = useMemo(() => {
    return presets.filter(p => selectedPresetIds.includes(p.id));
  }, [presets, selectedPresetIds]);

  /**
   * Get combined queries from selected presets
   */
  const combinedQueries = useMemo(() => {
    const allQueries: string[] = [];
    const seen = new Set<string>();

    for (const preset of selectedPresets) {
      for (const query of preset.queries) {
        const normalized = query.toLowerCase().trim();
        if (normalized && !seen.has(normalized)) {
          seen.add(normalized);
          allQueries.push(query);
        }
      }
    }

    return allQueries;
  }, [selectedPresets]);


  // Render loading state
  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Presets laden...</span>
        </CardContent>
      </Card>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-destructive mb-4">Fout bij laden van presets</p>
            <Button onClick={loadPresets} variant="outline">
              Opnieuw proberen
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Query Preset Selector</CardTitle>
        <CardDescription>
          Selecteer een of meerdere presets om queries te combineren
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Zoek presets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Select All / Clear All buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={filteredPresets.length === 0}
          >
            Selecteer alles
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleClearAll}
            disabled={selectedPresetIds.length === 0}
          >
            Wis alles
          </Button>
          <div className="ml-auto text-sm text-muted-foreground">
            {selectedPresetIds.length} van {filteredPresets.length} geselecteerd
          </div>
        </div>

        {/* Preset list */}
        <ScrollArea className="h-[400px]">
          <div className="space-y-4">
            {Object.entries(groupedPresets).map(([groupKey, groupPresets]) => (
              <div key={groupKey} className="space-y-2">
                {groupBy !== 'none' && (
                  <h3 className="text-sm font-semibold text-muted-foreground px-2">
                    {groupBy === 'category' ? 'Categorie' : 'Bron'}: {groupKey}
                  </h3>
                )}
                <div className="space-y-1">
                  {groupPresets.map((preset) => {
                    const isSelected = selectedPresetIds.includes(preset.id);
                    return (
                      <div
                        key={preset.id}
                        className="flex items-start gap-3 rounded-md border p-3 hover:bg-accent transition-colors"
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handlePresetToggle(preset.id)}
                          className="mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium">{preset.name}</span>
                            <Badge variant="outline" className="text-xs">
                              {preset.queryCount} queries
                            </Badge>
                            <Badge variant="secondary" className="text-xs">
                              {preset.source}
                            </Badge>
                          </div>
                          {preset.description && (
                            <p className="text-sm text-muted-foreground mb-2">
                              {preset.description}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            {Object.keys(groupedPresets).length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Geen presets gevonden
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Query preview */}
        {showPreview && selectedPresets.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Query Preview</h3>
            <div className="rounded-md border bg-muted/50 p-4">
              <div className="text-sm text-muted-foreground mb-2">
                {combinedQueries.length} unieke queries van {selectedPresets.length} preset(s):
              </div>
              <ScrollArea className="h-[150px]">
                <div className="space-y-1">
                  {combinedQueries.map((query, index) => (
                    <div key={index} className="text-sm font-mono bg-background p-2 rounded border">
                      {query}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

