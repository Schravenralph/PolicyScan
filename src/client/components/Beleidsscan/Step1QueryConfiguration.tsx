import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { ArrowRight, Check, RefreshCw, Search, Building2, Map as MapIcon, HelpCircle, Info, AlertCircle, Save, Clock } from 'lucide-react';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Progress } from '../ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';
import { toast } from '../../utils/toast';
import { getEntityList, filterEntities } from '../../utils/businessRules';
import urbanPlanningTopics from '../../../../urban-planning-topics.json' with { type: 'json' };
import { BronWebsite } from '../../hooks/useWebsiteSuggestions';
import type { QueryData } from '../../services/api';
import type { BeleidsscanDraft } from '../../hooks/useDraftPersistence';
import { ACCESSIBLE_COLORS } from '../../constants/colors';
import { useBeleidsscan } from '../../context/BeleidsscanContext';

type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';

/**
 * Validation errors for Step 1 form fields
 */
export interface Step1ValidationErrors {
  onderwerp?: string;
  overheidslaag?: string;
  selectedEntity?: string;
}

interface Step1QueryConfigurationProps {
  // UI state (not in context yet)
  showStep1Info: boolean;
  setShowStep1Info: (show: boolean) => void;
  
  // Data (from hooks, not in context)
  overheidslagen: Array<{ id: WebsiteType; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; color: string }>;
  gemeenten: string[];
  waterschappen: string[];
  provincies: string[];
  rijksorganisaties: string[];
  isLoadingJurisdictions: boolean;
  
  // Handlers (from parent, not in context)
  handleGenerateWebsites: () => Promise<void>;
  getCharacterCounterColor: () => string;
  
  // Hook results (from parent hooks, not in context)
  isLoadingWebsites: boolean;
  websiteGenerationProgress: number;
  websiteGenerationStatus: string;
  websiteGenerationEstimatedTime?: number;
  
  // Draft persistence (from parent hook, not in context)
  saveDraftToStorage: () => void;
  hasDraft: boolean;
  loadDraftFromStorage: () => BeleidsscanDraft | null;
  restoreDraft: () => void;
  cancelWebsiteGeneration?: () => void;
}

export function Step1QueryConfiguration({
  showStep1Info,
  setShowStep1Info,
  overheidslagen,
  gemeenten,
  waterschappen,
  provincies,
  rijksorganisaties,
  isLoadingJurisdictions,
  handleGenerateWebsites,
  getCharacterCounterColor,
  isLoadingWebsites,
  websiteGenerationProgress,
  websiteGenerationStatus,
  websiteGenerationEstimatedTime,
  saveDraftToStorage,
  hasDraft,
  loadDraftFromStorage,
  restoreDraft,
}: Step1QueryConfigurationProps) {
  // Get state from context instead of props
  const {
    queryConfig,
    validationErrors,
    setOverheidslaag,
    setSelectedEntity,
    setSearchQuery,
    setOnderwerp,
    setTopicSearchQuery,
    setValidationErrors,
    setQueryId,
    state,
    dispatch,
    actions,
    canProceedStep1: contextCanProceedStep1,
  } = useBeleidsscan();

  const {
    overheidslaag,
    selectedEntity,
    searchQuery,
    onderwerp,
    topicSearchQuery,
  } = queryConfig;
  // Get entity list based on selected overheidslaag
  const entities = useMemo(() => getEntityList(overheidslaag, {
    gemeenten,
    waterschappen,
    provincies,
    rijksorganisaties,
  }), [overheidslaag, gemeenten, waterschappen, provincies, rijksorganisaties]);
  
  const filteredEntities = useMemo(() => filterEntities(entities, searchQuery), [entities, searchQuery]);

  // Popular topics
  const popularTopics = useMemo(() => {
    const topics = urbanPlanningTopics as string[];
    return topics.slice(0, 5);
  }, []);

  // Recent searches from localStorage
  const [recentSearches, _setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('beleidsscan_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Debounced topic search
  const [debouncedTopicQuery, setDebouncedTopicQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedTopicQuery(topicSearchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [topicSearchQuery]);

  // Filter topics based on debounced search query
  const filteredTopics = useMemo(() => {
    if (!debouncedTopicQuery) return [];
    return (urbanPlanningTopics as string[]).filter(topic =>
      topic.toLowerCase().includes(debouncedTopicQuery.toLowerCase())
    );
  }, [debouncedTopicQuery]);

  // Handlers
  const handleOverheidslaagSelect = useCallback((laag: WebsiteType) => {
    setOverheidslaag(laag);
    setSelectedEntity('');
    setSearchQuery('');
    // Clear overheidslaag validation error when user makes a selection
    if (validationErrors.overheidslaag) {
      setValidationErrors({ ...validationErrors, overheidslaag: undefined });
    }
  }, [setOverheidslaag, setSelectedEntity, setSearchQuery, validationErrors, setValidationErrors]);

  const handleEntitySelect = useCallback((entity: string) => {
    setSelectedEntity(entity);
    setSearchQuery('');
    // Clear entity validation error when user makes a selection
    if (validationErrors.selectedEntity) {
      setValidationErrors({ ...validationErrors, selectedEntity: undefined });
    }
  }, [setSelectedEntity, setSearchQuery, validationErrors, setValidationErrors]);

  // Use canProceedStep1 from context
  const canProceedStep1 = contextCanProceedStep1;

  // Validate all fields and show errors for missing requirements
  const validateAndShowErrors = useCallback((): boolean => {
    const errors: Step1ValidationErrors = {};
    let isValid = true;

    if (!overheidslaag) {
      errors.overheidslaag = 'Selecteer een overheidslaag';
      isValid = false;
    }

    if (overheidslaag && overheidslaag !== 'kennisinstituut' && !selectedEntity.trim()) {
      errors.selectedEntity = 'Selecteer een instantie';
      isValid = false;
    }

    const trimmedOnderwerp = onderwerp.trim();
    if (!trimmedOnderwerp) {
      errors.onderwerp = 'Onderwerp is verplicht';
      isValid = false;
    } else if (trimmedOnderwerp.length < 3) {
      errors.onderwerp = 'Onderwerp moet minimaal 3 karakters bevatten';
      isValid = false;
    } else if (trimmedOnderwerp.length > 500) {
      errors.onderwerp = 'Onderwerp mag maximaal 500 karakters bevatten';
      isValid = false;
    }

    setValidationErrors(errors);
    return isValid;
  }, [overheidslaag, selectedEntity, onderwerp, setValidationErrors]);

  // Handle generate with validation
  const handleGenerateWithValidation = useCallback(async () => {
    if (!validateAndShowErrors()) {
      // Focus on the first field with an error for accessibility
      if (!overheidslaag) {
        const firstOverheidslaagButton = document.querySelector('[data-overheidslaag]') as HTMLElement;
        firstOverheidslaagButton?.focus();
      } else if (!selectedEntity && overheidslaag !== 'kennisinstituut') {
        const entityInput = document.getElementById('entity-search-input') as HTMLElement;
        entityInput?.focus();
      } else {
        const onderwerpInput = document.getElementById('onderwerp-input') as HTMLElement;
        onderwerpInput?.focus();
      }
      return;
    }
    await handleGenerateWebsites();
  }, [validateAndShowErrors, overheidslaag, selectedEntity, handleGenerateWebsites]);

  // Get missing requirements for tooltip
  const getMissingRequirements = useCallback((): string[] => {
    const missing: string[] = [];
    if (!overheidslaag) {
      missing.push('Selecteer een overheidslaag');
    }
    if (overheidslaag && overheidslaag !== 'kennisinstituut' && !selectedEntity.trim()) {
      missing.push('Selecteer een instantie');
    }
    if (onderwerp.trim().length < 3) {
      missing.push('Voer een onderwerp in (min. 3 karakters)');
    }
    return missing;
  }, [overheidslaag, selectedEntity, onderwerp]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 className="text-3xl mb-3" style={{ color: '#161620', fontFamily: "'Abhaya Libre', serif", fontWeight: 600 }} data-testid="step1-heading">
            Stap 1: Configureer uw zoekopdracht
          </h3>
          <p style={{ color: ACCESSIBLE_COLORS.goldText }}>
            Selecteer overheidslaag, instantie en onderwerp in één keer
          </p>
        </div>
        <Dialog open={showStep1Info} onOpenChange={setShowStep1Info}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              style={{ borderColor: '#002EA3', color: '#002EA3' }}
            >
              <Info className="w-4 h-4" />
              Meer informatie
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle style={{ color: '#161620', fontFamily: "'Abhaya Libre', serif", fontWeight: 600 }}>
                Stap 1: Configureer uw zoekopdracht
              </DialogTitle>
              <DialogDescription style={{ color: ACCESSIBLE_COLORS.goldText }}>
                Alles wat u moet weten over het configureren van uw scan
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4" style={{ color: '#161620' }}>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Building2 className="w-4 h-4" style={{ color: '#002EA3' }} />
                  1. Selecteer overheidslaag
                </h4>
                <p className="text-sm mb-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  Kies het type organisatie waar u naar zoekt. Dit bepaalt welke websites we zullen doorzoeken:
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc" style={{ color: '#161620' }}>
                  <li><strong>Gemeente:</strong> Gemeentelijke beleidsdocumenten en websites</li>
                  <li><strong>Waterschap:</strong> Regionale waterbeheer organisaties</li>
                  <li><strong>Provincie:</strong> Provinciaal beleid en regelgeving</li>
                  <li><strong>Rijksoverheid:</strong> Landelijke beleidsdocumenten</li>
                  <li><strong>Kennisinstituut:</strong> Onderzoeks- en kennisorganisaties</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <MapIcon className="w-4 h-4" style={{ color: '#002EA3' }} />
                  2. Selecteer instantie
                </h4>
                <p className="text-sm" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  Kies een specifieke organisatie (bijv. "Gemeente Amsterdam"). U kunt zoeken door te typen. 
                  Voor kennisinstituten hoeft u geen specifieke instantie te selecteren.
                </p>
              </div>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Search className="w-4 h-4" style={{ color: '#002EA3' }} />
                  3. Voer onderwerp in
                </h4>
                <p className="text-sm mb-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  Beschrijf waar u naar zoekt. Tips voor betere resultaten:
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc" style={{ color: '#161620' }}>
                  <li>Gebruik specifieke termen (bijv. "klimaatadaptatie" in plaats van "klimaat")</li>
                  <li>Combineer onderwerpen (bijv. "arbeidsmigranten huisvesting")</li>
                  <li>Minimaal 3 karakters, maximaal 500 karakters</li>
                  <li>Hoe specifieker, hoe relevantere resultaten</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-background border border-border">
                <p className="text-sm font-medium mb-1" style={{ color: '#161620' }}>
                  Wat gebeurt er daarna?
                </p>
                <p className="text-sm" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  Na het klikken op "Genereer website suggesties" gebruikt onze AI om relevante websites te vinden 
                  op basis van uw criteria. Dit kan enkele seconden duren.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Overheidslaag Selection */}
      <div className="mt-8">
        <div className="flex items-center gap-2 mb-4">
          <Label className="text-lg block" style={{ color: validationErrors.overheidslaag ? '#F37021' : '#161620' }} htmlFor="overheidslaag-selection">
            1. Selecteer overheidslaag
            <span className="ml-1" style={{ color: '#F37021' }} aria-label="verplicht veld">*</span>
          </Label>
          <Tooltip>
            <TooltipTrigger asChild>
              <HelpCircle 
                className="w-4 h-4 cursor-help" 
                style={{ color: '#9C885C' }}
                aria-label="Hulp bij selecteren overheidslaag"
                role="button"
                tabIndex={0}
              />
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                Kies het type overheidsorganisatie waar u naar zoekt. Dit helpt ons relevantere websites te vinden.
              </p>
            </TooltipContent>
          </Tooltip>
        </div>
        <div 
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          role="radiogroup"
          aria-labelledby="overheidslaag-label"
          aria-invalid={!!validationErrors.overheidslaag}
          aria-describedby={validationErrors.overheidslaag ? 'overheidslaag-error' : undefined}
          id="overheidslaag-selection"
        >
          {overheidslagen.map((laag) => (
            <button
              key={laag.id}
              onClick={() => handleOverheidslaagSelect(laag.id)}
              className="p-4 sm:p-6 rounded-xl border-2 hover:shadow-lg transition-all text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#002EA3]"
              style={{
                backgroundColor: 'white',
                borderColor: overheidslaag === laag.id 
                  ? laag.color 
                  : validationErrors.overheidslaag 
                    ? '#F37021' 
                    : '#E5E5E5',
                minHeight: '80px',
                outline: 'none'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleOverheidslaagSelect(laag.id);
                }
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  const currentIndex = overheidslagen.findIndex(l => l.id === laag.id);
                  const nextIndex = (currentIndex + 1) % overheidslagen.length;
                  const nextButton = document.querySelector(`[data-overheidslaag="${overheidslagen[nextIndex].id}"]`) as HTMLElement;
                  nextButton?.focus();
                }
                if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                  e.preventDefault();
                  const currentIndex = overheidslagen.findIndex(l => l.id === laag.id);
                  const prevIndex = (currentIndex - 1 + overheidslagen.length) % overheidslagen.length;
                  const prevButton = document.querySelector(`[data-overheidslaag="${overheidslagen[prevIndex].id}"]`) as HTMLElement;
                  prevButton?.focus();
                }
              }}
              tabIndex={overheidslaag === laag.id ? 0 : -1}
              role="radio"
              aria-checked={overheidslaag === laag.id}
              aria-label={`Selecteer ${laag.label}`}
              data-overheidslaag={laag.id}
              data-testid={`overheidslaag-${laag.id}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: laag.color }}
                  aria-hidden="true"
                >
                  <laag.icon className="w-6 h-6" style={{ color: 'white' }} aria-hidden="true" />
                </div>
                <h4 className="text-lg" style={{ color: '#161620' }}>
                  {laag.label}
                </h4>
              </div>
            </button>
          ))}
        </div>
        {validationErrors.overheidslaag && (
          <p 
            id="overheidslaag-error"
            className="mt-2 text-sm flex items-center gap-1 animate-in fade-in" 
            style={{ color: '#F37021' }}
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle className="w-4 h-4" aria-hidden="true" />
            <span>{validationErrors.overheidslaag}</span>
          </p>
        )}
      </div>
      <span id="overheidslaag-label" className="sr-only">Selecteer overheidslaag</span>

      {/* Entity Selection - only show if overheidslaag is selected and not kennisinstituut */}
      {overheidslaag && overheidslaag !== 'kennisinstituut' && (
        <div className="mt-8" role="group" aria-labelledby="entity-selection-label">
          <div className="flex items-center gap-2 mb-4">
            <Label className="text-lg block" style={{ color: validationErrors.selectedEntity ? '#F37021' : '#161620' }} htmlFor="entity-search-input" id="entity-selection-label">
              2. Selecteer instantie
              <span className="ml-1" style={{ color: '#F37021' }} aria-label="verplicht veld">*</span>
            </Label>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle 
                  className="w-4 h-4 cursor-help" 
                  style={{ color: '#9C885C' }}
                  aria-label="Hulp bij selecteren instantie"
                  role="button"
                  tabIndex={0}
                />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-xs">
                  Selecteer de specifieke organisatie (bijv. "Gemeente Amsterdam" of "Waterschap Rijn en IJssel"). 
                  U kunt ook zoeken door te typen.
                </p>
              </TooltipContent>
            </Tooltip>
          </div>
          <Command 
            className="rounded-lg border-2" 
            style={{ 
              borderColor: selectedEntity 
                ? '#002EA3' 
                : validationErrors.selectedEntity 
                  ? '#F37021' 
                  : '#E5E5E5' 
            }}
            role="combobox"
            aria-expanded={searchQuery.length > 0}
            aria-haspopup="listbox"
            aria-invalid={!!validationErrors.selectedEntity}
            aria-describedby={validationErrors.selectedEntity ? 'entity-error' : undefined}
          >
            <CommandInput
              id="entity-search-input"
              placeholder={`Zoek ${overheidslagen.find(l => l.id === overheidslaag)?.label.toLowerCase() || 'instantie'}...`}
              value={searchQuery}
              onValueChange={setSearchQuery}
              disabled={isLoadingJurisdictions}
              aria-label={`Zoek ${overheidslagen.find(l => l.id === overheidslaag)?.label.toLowerCase() || 'instantie'}`}
              aria-controls="entity-listbox"
              data-testid="entity-search-input"
            />
            <CommandList id="entity-listbox" role="listbox" aria-label="Beschikbare instanties">
              <CommandEmpty role="option" aria-label="Geen resultaten gevonden">Geen resultaten gevonden.</CommandEmpty>
              <CommandGroup role="group" aria-label="Instanties">
                {filteredEntities.map((entity) => (
                  <CommandItem
                    key={entity}
                    value={entity}
                    onSelect={() => handleEntitySelect(entity)}
                    role="option"
                    aria-selected={selectedEntity === entity}
                    aria-label={`Selecteer ${entity}`}
                  >
                    <Check
                      className="mr-2 h-4 w-4"
                      style={{
                        opacity: selectedEntity === entity ? 1 : 0,
                        color: '#002EA3'
                      }}
                      aria-hidden="true"
                    />
                    <span>{entity}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>

          {selectedEntity ? (
            <div 
              className="mt-4 p-4 rounded-lg bg-background border border-border" 
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <p className="text-sm" style={{ color: '#161620' }}>
                <strong>Geselecteerd:</strong> <span id="selected-entity-name">{selectedEntity}</span>
              </p>
            </div>
          ) : validationErrors.selectedEntity && (
            <p 
              id="entity-error"
              className="mt-2 text-sm flex items-center gap-1 animate-in fade-in" 
              style={{ color: '#F37021' }}
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
              <span>{validationErrors.selectedEntity}</span>
            </p>
          )}
        </div>
      )}

      {/* Onderwerp Input */}
      <div className="mt-8" role="group" aria-labelledby="onderwerp-label">
        <div className="flex items-center gap-2 mb-4">
          <Label className="text-lg block" style={{ color: '#161620' }} htmlFor="onderwerp-input" id="onderwerp-label">
            {overheidslaag === 'kennisinstituut' ? '2. ' : '3. '}Voer uw onderwerp in
            <span className="ml-1" style={{ color: '#F37021' }} aria-label="verplicht veld">*</span>
          </Label>
          <Popover>
            <PopoverTrigger asChild>
              <HelpCircle 
                className="w-4 h-4 cursor-help" 
                style={{ color: '#9C885C' }}
                aria-label="Hulp bij invoeren onderwerp"
                role="button"
                tabIndex={0}
              />
            </PopoverTrigger>
            <PopoverContent className="w-80" role="tooltip">
              <div className="space-y-2">
                <h4 className="font-semibold text-sm" style={{ color: '#161620' }}>Onderwerp tips</h4>
                <p className="text-xs mb-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  Kies een suggestie uit de dropdown of typ uw eigen onderwerp. Bijvoorbeeld:
                </p>
                <ul className="text-xs space-y-1 ml-4 list-disc" style={{ color: '#161620' }}>
                  <li>"klimaatadaptatie"</li>
                  <li>"arbeidsmigranten huisvesting"</li>
                  <li>"duurzaamheid beleid"</li>
                </ul>
                <p className="text-xs mt-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  <strong>Hoe specifieker, hoe betere resultaten.</strong> Combineer termen voor gerichtere zoekopdrachten.
                </p>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-2">
          <p className="text-xs mb-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
            <span className="font-medium">Optioneel:</span> Kies een suggestie uit de dropdown of typ uw eigen onderwerp
          </p>
          <Command 
            className="rounded-lg border-2" 
            style={{ 
              borderColor: validationErrors.onderwerp 
                ? '#F37021' 
                : onderwerp 
                  ? '#002EA3' 
                  : '#E5E5E5'
            }}
            role="combobox"
            aria-expanded={topicSearchQuery.length > 0}
            aria-haspopup="listbox"
            aria-invalid={!!validationErrors.onderwerp}
            aria-describedby={validationErrors.onderwerp ? 'onderwerp-error' : 'onderwerp-help'}
          >
            <CommandInput
              id="onderwerp-input"
              data-testid="onderwerp-input"
              placeholder="Kies een onderwerp of typ uw eigen zoekopdracht (bijv. 'klimaatadaptatie beleid')"
              value={topicSearchQuery}
              onValueChange={(value) => {
                setTopicSearchQuery(value);
                setOnderwerp(value);
                if (validationErrors.onderwerp) {
                  setValidationErrors({ ...validationErrors, onderwerp: undefined });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canProceedStep1 && !isLoadingWebsites) {
                  handleGenerateWebsites();
                }
              }}
              className="text-base p-4 sm:p-6"
              style={{ backgroundColor: 'white' }}
              aria-label="Voer uw onderwerp in"
              aria-required="true"
              aria-controls="topic-listbox"
            />
            <CommandList id="topic-listbox" role="listbox" aria-label="Onderwerp suggesties">
              {!topicSearchQuery && (
                <>
                  {popularTopics.length > 0 && (
                    <CommandGroup heading="Populaire onderwerpen" role="group" aria-label="Populaire onderwerpen">
                      {popularTopics.map((topic) => (
                        <CommandItem
                          key={topic}
                          value={topic}
                          onSelect={() => {
                            setOnderwerp(topic);
                            setTopicSearchQuery(topic);
                            if (validationErrors.onderwerp) {
                              setValidationErrors({ ...validationErrors, onderwerp: undefined });
                            }
                          }}
                          role="option"
                          aria-selected={onderwerp === topic}
                          aria-label={`Selecteer ${topic}`}
                        >
                          <Check
                            className="mr-2 h-4 w-4"
                            style={{
                              opacity: onderwerp === topic ? 1 : 0,
                              color: '#002EA3'
                            }}
                            aria-hidden="true"
                          />
                          <span>{topic}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {recentSearches.length > 0 && (
                    <CommandGroup heading="Recente zoekopdrachten" role="group" aria-label="Recente zoekopdrachten">
                      {recentSearches.map((search) => (
                        <CommandItem
                          key={search}
                          value={search}
                          onSelect={() => {
                            setOnderwerp(search);
                            setTopicSearchQuery(search);
                            if (validationErrors.onderwerp) {
                              setValidationErrors({ ...validationErrors, onderwerp: undefined });
                            }
                          }}
                          role="option"
                          aria-selected={onderwerp === search}
                          aria-label={`Selecteer ${search}`}
                        >
                          <Clock className="mr-2 h-4 w-4" style={{ color: ACCESSIBLE_COLORS.goldText }} aria-hidden="true" />
                          <span>{search}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                </>
              )}
              {topicSearchQuery && (
                <>
                  <CommandEmpty role="option" aria-label="Geen suggesties gevonden">Geen suggesties gevonden. U kunt uw eigen onderwerp typen.</CommandEmpty>
                  <CommandGroup role="group" aria-label="Zoekresultaten">
                    {filteredTopics.slice(0, 10).map((topic) => (
                      <CommandItem
                        key={topic}
                        value={topic}
                        onSelect={() => {
                          setOnderwerp(topic);
                          setTopicSearchQuery(topic);
                          if (validationErrors.onderwerp) {
                            setValidationErrors({ ...validationErrors, onderwerp: undefined });
                          }
                        }}
                        role="option"
                        aria-selected={onderwerp === topic}
                        aria-label={`Selecteer ${topic}`}
                      >
                        <Check
                          className="mr-2 h-4 w-4"
                          style={{
                            opacity: onderwerp === topic ? 1 : 0,
                            color: '#002EA3'
                          }}
                          aria-hidden="true"
                        />
                        <span>{topic}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </div>
        <div className="mt-2 flex items-center justify-between">
          {validationErrors.onderwerp ? (
            <p 
              id="onderwerp-error"
              className="text-sm flex items-center gap-1 animate-in fade-in" 
              style={{ color: '#F37021' }}
              role="alert"
              aria-live="assertive"
            >
              <AlertCircle className="w-4 h-4" aria-hidden="true" />
              <span>{validationErrors.onderwerp}</span>
            </p>
          ) : onderwerp ? (
            <p 
              id="onderwerp-help"
              className="text-xs transition-colors" 
              style={{ color: getCharacterCounterColor() }}
              aria-live="polite"
            >
              {onderwerp.length} / 500 karakters
            </p>
          ) : (
            <p id="onderwerp-help" className="text-xs" style={{ color: ACCESSIBLE_COLORS.goldText }}>
              Minimaal 3 karakters vereist
            </p>
          )}
          {onderwerp && !validationErrors.onderwerp && onderwerp.length >= 3 && (
            <Check 
              className="w-4 h-4 animate-in fade-in" 
              style={{ color: '#002EA3' }}
              aria-label="Onderwerp is geldig"
              role="img"
            />
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mt-8">
        {/* Save Draft Button */}
        <Button
          onClick={() => {
            saveDraftToStorage();
            toast.success('Draft opgeslagen', 'Uw voortgang is opgeslagen. U kunt deze later hervatten.');
          }}
          variant="outline"
          size="sm"
          className="flex items-center gap-2"
          style={{ borderColor: '#9C885C', color: '#161620' }}
          title="Sla uw voortgang op om later verder te gaan"
        >
          <Save className="w-4 h-4" />
          Sla op
        </Button>
        {/* Resume Draft Button */}
        {hasDraft && (
          <Button
            onClick={() => {
              const draft = loadDraftFromStorage();
              if (draft) {
                restoreDraft();
              } else {
                toast.info('Geen concept gevonden', 'Er is geen opgeslagen concept om te herstellen.');
              }
            }}
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            style={{ borderColor: '#002EA3', color: '#002EA3' }}
            title="Herstel uw opgeslagen voortgang"
          >
            <Clock className="w-4 h-4" />
            Herstel draft
          </Button>
        )}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="flex items-center gap-2"
              style={{ borderColor: '#9C885C', color: '#161620' }}
              disabled={!canProceedStep1}
            >
              <Info className="w-4 h-4" />
              Wat gebeurt er?
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80">
            <div className="space-y-2">
              <h4 className="font-semibold text-sm" style={{ color: '#161620' }}>Website suggesties genereren</h4>
              <p className="text-xs" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                Wanneer u op "Genereer website suggesties" klikt, gebruikt onze AI om relevante websites te vinden op basis van:
              </p>
              <ul className="text-xs space-y-1 ml-4 list-disc" style={{ color: '#161620' }}>
                <li>Uw geselecteerde overheidslaag</li>
                <li>De gekozen instantie (indien van toepassing)</li>
                <li>Uw onderwerp</li>
              </ul>
              <p className="text-xs mt-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                Dit proces kan enkele seconden duren. In stap 2 kunt u de gevonden websites selecteren om te scrapen.
              </p>
            </div>
          </PopoverContent>
        </Popover>
        {/* Generate button with validation tooltip */}
        {!canProceedStep1 && !isLoadingWebsites ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                data-testid="generate-website-suggestions-button"
                onClick={handleGenerateWithValidation}
                className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                style={{
                  backgroundColor: '#E5E5E5',
                  color: 'white',
                  opacity: 0.5
                }}
                aria-describedby="generate-requirements-tooltip"
              >
                Genereer website suggesties
                <ArrowRight className="w-4 h-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent id="generate-requirements-tooltip" className="max-w-xs">
              <div className="space-y-1">
                <p className="font-medium text-sm">Om door te gaan, vul de volgende velden in:</p>
                <ul className="text-xs space-y-1 list-disc ml-4">
                  {getMissingRequirements().map((req, idx) => (
                    <li key={idx}>{req}</li>
                  ))}
                </ul>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <Button
            data-testid="generate-website-suggestions-button"
            onClick={handleGenerateWithValidation}
            disabled={isLoadingWebsites}
            className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            style={{
              backgroundColor: '#002EA3',
              color: 'white'
            }}
          >
            {isLoadingWebsites ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Websites genereren...
              </>
            ) : (
              <>
                Genereer website suggesties
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </Button>
        )}
        {isLoadingWebsites && (
          <div className="flex-1">
            <Progress value={Math.max(0, Math.min(100, websiteGenerationProgress || 0))} className="h-2" />
            <div className="flex items-center justify-between mt-1">
              <p className="text-xs text-center flex-1" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                {websiteGenerationStatus || 'AI genereert relevante websites...'}
              </p>
              {websiteGenerationEstimatedTime !== undefined && websiteGenerationEstimatedTime > 0 && (
                <p className="text-xs ml-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  {websiteGenerationEstimatedTime < 60 
                    ? `~${Math.round(websiteGenerationEstimatedTime)}s`
                    : `~${Math.ceil(websiteGenerationEstimatedTime / 60)}m`
                  }
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

