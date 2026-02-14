import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Plus, X, Loader2 } from 'lucide-react';
import { api } from '../../services/api';
import { logError } from '../../utils/errorHandler';
import { toast } from '../../utils/toast';
import { t } from '../../utils/i18n';
import { QueryPresetSelector } from './QueryPresetSelector';

/**
 * Query space selection configuration
 */
export interface QuerySpaceSelection {
  type: 'manual' | 'count' | 'filter' | 'preset' | 'preset-multi';
  queries?: string[];
  presetIds?: string[]; // For preset-multi type
  count?: number;
  filters?: {
    dateRange?: { start: string; end: string };
    topics?: string[];
    overheidslaag?: string[];
    overheidsinstantie?: string[];
    minDocumentsFound?: number;
    maxDocumentsFound?: number;
  };
  preset?: string; // For single preset type (backward compatibility)
  sampling?: {
    strategy: 'all' | 'random' | 'top-n' | 'stratified';
    count?: number;
    seed?: number;
  };
}

interface QuerySpaceSelectorProps {
  value?: QuerySpaceSelection;
  onChange: (selection: QuerySpaceSelection | undefined) => void;
  className?: string;
}

interface QuerySetPreset {
  id: string;
  name: string;
  description: string;
  queries: string[];
}

/**
 * Query Space Selector Component
 * 
 * Allows users to configure query space for benchmarking with:
 * - Manual query selection
 * - Count-based selection
 * - Filter-based selection
 * - Preset selection
 * - Sampling strategies
 * 
 * @component
 */
export function QuerySpaceSelector({ value, onChange, className }: QuerySpaceSelectorProps) {
  const [selectionType, setSelectionType] = useState<QuerySpaceSelection['type']>(
    value?.type || 'manual'
  );
  const [manualQueries, setManualQueries] = useState<string[]>(value?.queries || ['']);
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>(value?.presetIds || []);
  const [presetMultiManualQueries, setPresetMultiManualQueries] = useState<string[]>(['']);
  const [count, setCount] = useState<number>(value?.count || 10);
  const [preset, setPreset] = useState<string>(value?.preset || '');
  const [samplingStrategy, setSamplingStrategy] = useState<'all' | 'random' | 'top-n' | 'stratified'>(
    value?.sampling?.strategy || 'all'
  );
  const [samplingCount, setSamplingCount] = useState<number>(value?.sampling?.count || 10);
  const [presets, setPresets] = useState<QuerySetPreset[]>([]);
  const [isLoadingPresets, setIsLoadingPresets] = useState(false);
  const [combinedQueryCount, setCombinedQueryCount] = useState<number>(0);
  const [isLoadingQueryCount, setIsLoadingQueryCount] = useState(false);

  useEffect(() => {
    loadPresets();
  }, []);

  const buildSelection = (): QuerySpaceSelection | undefined => {
    const baseSelection: QuerySpaceSelection = {
      type: selectionType,
    };

    switch (selectionType) {
      case 'manual': {
        const validQueries = manualQueries.filter((q) => q.trim());
        if (validQueries.length === 0) {
          return undefined;
        }
        baseSelection.queries = validQueries;
        break;
      }

      case 'count':
        if (!count || count <= 0) {
          return undefined;
        }
        baseSelection.count = count;
        break;

      case 'preset':
        if (!preset) {
          return undefined;
        }
        baseSelection.preset = preset;
        break;

      case 'preset-multi': {
        const validPresetIds = selectedPresetIds.filter(id => id);
        const validQueries = presetMultiManualQueries.filter(q => q.trim());
        
        if (validPresetIds.length === 0 && validQueries.length === 0) {
          return undefined;
        }
        
        baseSelection.presetIds = validPresetIds;
        if (validQueries.length > 0) {
          baseSelection.queries = validQueries;
        }
        break;
      }

      case 'filter':
        // Filter selection - can be enhanced later
        break;
    }

    if (samplingStrategy !== 'all') {
      baseSelection.sampling = {
        strategy: samplingStrategy,
        count: samplingCount,
      };
    }

    return baseSelection;
  };

  const calculateCombinedQueryCount = useCallback(async () => {
    if (selectedPresetIds.length === 0 && presetMultiManualQueries.filter(q => q.trim()).length === 0) {
      setCombinedQueryCount(0);
      return;
    }

    setIsLoadingQueryCount(true);
    try {
      const validManualQueries = presetMultiManualQueries.filter(q => q.trim());
      const response = await api.post<{ queries: string[]; sources: Record<string, number> }>(
        '/api/query-presets/combine',
        {
          presetIds: selectedPresetIds,
          manualQueries: validManualQueries,
          deduplicate: true,
          combineMode: 'union',
        }
      );
      setCombinedQueryCount(response.queries.length);
    } catch (error) {
      logError(error, 'calculate-combined-query-count');
      setCombinedQueryCount(0);
    } finally {
      setIsLoadingQueryCount(false);
    }
  }, [selectedPresetIds, presetMultiManualQueries]);

  useEffect(() => {
    // Update parent when selection changes
    const newSelection = buildSelection();
    onChange(newSelection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionType, manualQueries, count, preset, selectedPresetIds, presetMultiManualQueries, samplingStrategy, samplingCount]);

  // Calculate combined query count for preset-multi
  useEffect(() => {
    if (selectionType === 'preset-multi') {
      calculateCombinedQueryCount();
    }
  }, [selectionType, selectedPresetIds, presetMultiManualQueries, calculateCombinedQueryCount]);

  const loadPresets = async () => {
    setIsLoadingPresets(true);
    try {
      const response = await api.get<{ presets: QuerySetPreset[]; total: number }>('/api/query-presets');
      const loadedPresets = response.presets || [];
      setPresets(loadedPresets);

      // Handle backward compatibility: if current preset is a name that exists in loaded presets, switch to ID
      // If preset is already an ID (or empty), this logic won't affect it unless it matches a name
      if (preset && loadedPresets.length > 0) {
        // Check if preset is an ID
        const isId = loadedPresets.some(p => p.id === preset);
        if (!isId) {
          // Check if it's a name
          const matchByName = loadedPresets.find(p => p.name === preset);
          if (matchByName) {
            setPreset(matchByName.id);
          }
        }
      }
    } catch (error) {
      logError(error, 'load-query-presets');
      toast.error('Fout', 'Kan presets niet laden.');
    } finally {
      setIsLoadingPresets(false);
    }
  };

  const addManualQuery = () => {
    setManualQueries([...manualQueries, '']);
  };

  const removeManualQuery = (index: number) => {
    setManualQueries(manualQueries.filter((_, i) => i !== index));
  };

  const updateManualQuery = (index: number, query: string) => {
    setManualQueries(prev => {
      const updated = [...prev];
      updated[index] = query;
      return updated;
    });
  };

  const addPresetMultiManualQuery = () => {
    setPresetMultiManualQueries(prev => [...prev, '']);
  };

  const removePresetMultiManualQuery = (index: number) => {
    setPresetMultiManualQueries(prev => prev.filter((_, i) => i !== index));
  };

  const updatePresetMultiManualQuery = (index: number, query: string) => {
    setPresetMultiManualQueries(prev => {
      const updated = [...prev];
      updated[index] = query;
      return updated;
    });
  };

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Query Space Configuratie</CardTitle>
        <CardDescription>
          Configureer welke queries gebruikt worden voor de benchmark
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Selection Type */}
        <div className="space-y-2">
          <Label>Selectie Type</Label>
          <Select value={selectionType} onValueChange={(v) => setSelectionType(v as QuerySpaceSelection['type'])}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="manual">{t('benchmark.queryTypeManual')}</SelectItem>
              <SelectItem value="count">{t('benchmark.queryTypeCount')}</SelectItem>
              <SelectItem value="preset">{t('benchmark.queryTypePreset')}</SelectItem>
              <SelectItem value="preset-multi">{t('benchmark.queryTypePresetMulti')}</SelectItem>
              <SelectItem value="filter">{t('benchmark.queryTypeFilter')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Manual Selection */}
        {selectionType === 'manual' && (
          <div className="space-y-2">
            <Label>Queries</Label>
            {manualQueries.map((query, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={query}
                  onChange={(e) => updateManualQuery(index, e.target.value)}
                  placeholder="Bijv. arbeidsmigranten huisvesting"
                />
                {manualQueries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeManualQuery(index)}
                  >
                    <X className="w-4 h-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button variant="outline" size="sm" onClick={addManualQuery} className="w-full">
              <Plus className="w-4 h-4 mr-2" />
              {t('benchmark.addQuery')}
            </Button>
          </div>
        )}

        {/* Count Selection */}
        {selectionType === 'count' && (
          <div className="space-y-2">
            <Label>Aantal Queries</Label>
            <Input
              type="number"
              min="1"
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value) || 1)}
            />
            <p className="text-xs text-muted-foreground">
              Selecteert de eerste N queries uit de beschikbare queries
            </p>
          </div>
        )}

        {/* Preset Selection */}
        {selectionType === 'preset' && (
          <div className="space-y-2">
            <Label>Preset</Label>
            {isLoadingPresets ? (
              <div className="flex items-center gap-2 text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t('benchmark.loadingPresets')}</span>
              </div>
            ) : (
              <Select value={preset} onValueChange={setPreset}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecteer een preset" />
                </SelectTrigger>
                <SelectContent>
                  {presets.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      <div className="flex flex-col">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-xs text-muted-foreground">{p.description}</span>
                        <span className="text-xs text-muted-foreground">
                          {p.queries.length} queries
                        </span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {preset && (
              <div className="mt-2">
                <p className="text-sm font-medium mb-1">{t('benchmark.queriesInPreset')}</p>
                <div className="flex flex-wrap gap-2">
                  {presets
                    .find((p) => p.id === preset)
                    ?.queries.map((q, i) => (
                      <Badge key={i} variant="outline">
                        {q}
                      </Badge>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Preset Multi Selection */}
        {selectionType === 'preset-multi' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Presets</Label>
              <QueryPresetSelector
                selectedPresetIds={selectedPresetIds}
                onSelectionChange={setSelectedPresetIds}
                groupBy="category"
                showPreview={false}
              />
            </div>

            <div className="space-y-2">
              <Label>Extra Handmatige Queries</Label>
              {presetMultiManualQueries.map((query, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    value={query}
                    onChange={(e) => updatePresetMultiManualQuery(index, e.target.value)}
                    placeholder="Bijv. arbeidsmigranten huisvesting"
                  />
                  {presetMultiManualQueries.length > 1 && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removePresetMultiManualQuery(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addPresetMultiManualQuery} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                {t('benchmark.addQuery')}
              </Button>
            </div>

            {/* Combined Query Count */}
            <div className="p-3 bg-muted rounded-md">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{t('benchmark.totalQueries')}</span>
                {isLoadingQueryCount ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm text-muted-foreground">Berekenen...</span>
                  </div>
                ) : (
                  <Badge variant="secondary" className="text-sm">
                    {combinedQueryCount} queries
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Filter Selection */}
        {selectionType === 'filter' && (
          <div className="space-y-2">
            <Label>{t('common.filters')}</Label>
            <p className="text-sm text-muted-foreground">
              Filter configuratie wordt binnenkort toegevoegd
            </p>
          </div>
        )}

        {/* Sampling Strategy */}
        {selectionType !== 'manual' && (
          <div className="space-y-2">
            <Label>Sampling Strategie</Label>
            <Select
              value={samplingStrategy}
              onValueChange={(v) => setSamplingStrategy(v as typeof samplingStrategy)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('benchmark.allQueries')}</SelectItem>
                <SelectItem value="random">Willekeurig</SelectItem>
                <SelectItem value="top-n">Top N</SelectItem>
                <SelectItem value="stratified">Gestratificeerd</SelectItem>
              </SelectContent>
            </Select>
            {samplingStrategy !== 'all' && (
              <div className="space-y-2">
                <Label>Aantal (voor sampling)</Label>
                <Input
                  type="number"
                  min="1"
                  value={samplingCount}
                  onChange={(e) => setSamplingCount(parseInt(e.target.value) || 10)}
                />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

