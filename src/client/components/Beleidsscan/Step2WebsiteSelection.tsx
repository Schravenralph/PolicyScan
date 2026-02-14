import React, { useMemo } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckSquare,
  Square,
  ExternalLink,
  Search,
  Filter,
  X,
  Info,
  RefreshCw,
  Clock,
  AlertCircle,
  Zap,
  FileText,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Progress } from '../ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { t } from '../../utils/i18n';
import type { BronWebsite } from '../../services/api';
import { ACCESSIBLE_COLORS } from '../../constants/colors';
import { useBeleidsscan } from '../../context/BeleidsscanContext';

interface Step2WebsiteSelectionProps {
  // From hooks (not in context)
  suggestedWebsites: BronWebsite[];
  isScrapingWebsites: boolean;
  scrapingProgress: number;
  scrapingStatus: string;
  scrapingDocumentsFound: number;
  scrapingEstimatedTime?: number;
  
  // Handlers (defined in parent)
  handleSelectAllWebsites: () => void;
  handleScrapeWebsites: () => void;
  websiteSuggestionsError?: string | null;
  clearWebsiteSuggestionsError?: () => void;
  handleStepNavigation?: (step: number) => void;
  saveDraftToStorage?: () => void;
}

export const Step2WebsiteSelection: React.FC<Step2WebsiteSelectionProps> = ({
  suggestedWebsites,
  isScrapingWebsites,
  scrapingProgress,
  scrapingStatus,
  scrapingDocumentsFound,
  scrapingEstimatedTime,
  handleSelectAllWebsites,
  handleScrapeWebsites,
}) => {
  // Get state from context instead of props
  const {
    websiteSelection,
    setSelectedWebsites,
    toggleWebsiteSelection,
    setWebsiteSearchQuery,
    setWebsiteSortBy,
    setWebsiteFilterType,
    documentReview,
    queryConfig,
    state,
    dispatch,
    actions,
    canProceedStep2,
  } = useBeleidsscan();

  // Get UI state from reducer
  const showStep2Info = state.showStep2Info;
  const showScrapingInfo = state.showScrapingInfo;
  
  // Setters for UI state
  const setShowStep2Info = (show: boolean) => {
    dispatch(actions.setShowStep2Info(show));
  };
  const setShowScrapingInfo = (show: boolean) => {
    dispatch(actions.setShowScrapingInfo(show));
  };

  const {
    selectedWebsites,
    websiteSearchQuery,
    websiteSortBy,
    websiteFilterType,
  } = websiteSelection;

  const { documents } = documentReview;
  const scrapedDocuments = Array.isArray(documents) ? documents : [];
  const { queryId } = queryConfig;
  const workflowRunId = state.workflowRunId;
  const canProceedStep4 = canProceedStep2; // canProceedStep2 is based on selectedWebsites.length > 0

  // Handler for showing execution log - removed as action doesn't exist
  // const setShowExecutionLog = (show: boolean) => {
  //   dispatch(actions.setShowExecutionLog(show));
  // };

  // Handler for step navigation
  const setStep = (step: number) => {
    dispatch(actions.setStep(step));
  };
  // Filter and sort websites
  const filteredAndSortedWebsites = useMemo(() => {
    // Ensure suggestedWebsites is an array
    if (!Array.isArray(suggestedWebsites)) {
      return [];
    }
    return suggestedWebsites
      .filter(website => {
        // Defensive check: ensure website is valid
        if (!website || typeof website !== 'object') {
          return false;
        }
        // Search filter
        const matchesSearch = !websiteSearchQuery || 
          (website.titel?.toLowerCase().includes(websiteSearchQuery.toLowerCase()) ?? false) ||
          (website.url?.toLowerCase().includes(websiteSearchQuery.toLowerCase()) ?? false) ||
          (website.samenvatting?.toLowerCase().includes(websiteSearchQuery.toLowerCase()) ?? false);
        
        // Type filter
        const matchesType = !websiteFilterType || 
          website.website_types?.includes(websiteFilterType);
        
        return matchesSearch && matchesType;
      })
      .sort((a, b) => {
        if (websiteSortBy === 'name') {
          return (a.titel || '').localeCompare(b.titel || '', 'nl');
        }
        if (websiteSortBy === 'type') {
          const aType = a.website_types?.[0] || '';
          const bType = b.website_types?.[0] || '';
          return aType.localeCompare(bType, 'nl');
        }
        // Default: relevance (keep original order)
        return 0;
      });
  }, [suggestedWebsites, websiteSearchQuery, websiteSortBy, websiteFilterType]);

  // Get unique website types for filter
  const uniqueWebsiteTypes = useMemo(() => {
    if (!Array.isArray(suggestedWebsites)) {
      return [];
    }
    return Array.from(
      new Set(suggestedWebsites.flatMap(w => (w && typeof w === 'object' && Array.isArray(w.website_types)) ? w.website_types : []))
    ).sort();
  }, [suggestedWebsites]);

  return (
    <section className="space-y-6" aria-labelledby="step2-title">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <h3 id="step2-title" className="text-3xl mb-3" style={{ color: '#161620', fontFamily: "'Abhaya Libre', serif", fontWeight: 600 }} data-testid="step2-heading">
            Stap 2: Selecteer websites om te scrapen
          </h3>
          <p style={{ color: ACCESSIBLE_COLORS.goldText }} role="status" aria-live="polite">
            We hebben {Array.isArray(suggestedWebsites) ? suggestedWebsites.length : 0} relevante websites gevonden. Kies welke u wilt doorzoeken.
          </p>
        </div>
        <Dialog open={showStep2Info} onOpenChange={setShowStep2Info}>
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
                Stap 2: Website selectie en scraping
              </DialogTitle>
              <DialogDescription style={{ color: ACCESSIBLE_COLORS.goldText }}>
                Hoe u websites selecteert en wat er gebeurt tijdens het scrapen
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4" style={{ color: '#161620' }}>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Search className="w-4 h-4" style={{ color: '#002EA3' }} />
                  Website selectie
                </h4>
                <p className="text-sm mb-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  U kunt websites selecteren en filteren op verschillende manieren:
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc" style={{ color: '#161620' }}>
                  <li><strong>Zoeken:</strong> Zoek op naam of URL van een website</li>
                  <li><strong>Filteren:</strong> Filter op website type (gemeente, waterschap, etc.)</li>
                  <li><strong>Sorteren:</strong> Sorteer op relevantie, naam of type</li>
                  <li><strong>Selecteer alles:</strong> Selecteer alle gefilterde websites in één keer</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4" style={{ color: '#002EA3' }} />
                  Wat is scraping?
                </h4>
                <p className="text-sm mb-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  Tijdens het scrapen worden de geselecteerde websites doorzocht naar relevante documenten:
                </p>
                <ul className="text-sm space-y-1 ml-6 list-disc" style={{ color: '#161620' }}>
                  <li>We doorzoeken pagina's en documenten op basis van uw onderwerp</li>
                  <li>Relevante documenten worden gevonden en geanalyseerd</li>
                  <li>U kunt de voortgang volgen in real-time via de grafiek visualisatie</li>
                  <li>Het proces kan enkele minuten duren, afhankelijk van het aantal websites</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2 flex items-center gap-2">
                  <FileText className="w-4 h-4" style={{ color: '#002EA3' }} />
                  Grafiek visualisatie
                </h4>
                <p className="text-sm" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  Tijdens het scrapen ziet u een real-time visualisatie van het navigatienetwerk dat wordt opgebouwd. 
                  Dit helpt u begrijpen hoe websites zijn georganiseerd en welke documenten worden gevonden.
                </p>
              </div>
              <div className="p-4 rounded-lg" style={{ backgroundColor: 'rgba(243, 112, 33, 0.05)' }}>
                <p className="text-sm font-medium mb-1 flex items-center gap-2" style={{ color: '#161620' }}>
                  <AlertCircle className="w-4 h-4" style={{ color: '#F37021' }} />
                  Tip
                </p>
                <p className="text-sm" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  Selecteer meerdere websites voor een uitgebreidere scan. U kunt altijd later meer websites toevoegen 
                  door terug te gaan naar deze stap.
                </p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search, Filter, and Bulk Actions Bar */}
      <div className="mt-8 space-y-4" role="search" aria-label="Zoek en filter websites">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search Input */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{ color: '#9C885C' }} aria-hidden="true" />
            <Input
              id="website-search-input"
              placeholder="Zoek websites op naam of URL..."
              value={websiteSearchQuery}
              onChange={(e) => setWebsiteSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                // Standardize Enter key: prevent form submission, just filter
                if (e.key === 'Enter') {
                  e.preventDefault();
                  // Focus first result if available
                  const firstWebsite = document.querySelector('[data-testid="website-suggestions-list"] button') as HTMLElement;
                  firstWebsite?.focus();
                }
              }}
              className="pl-10 pr-10 border-2"
              style={{
                backgroundColor: 'white',
                borderColor: websiteSearchQuery ? '#002EA3' : '#E5E5E5'
              }}
              aria-label="Zoek websites"
              aria-describedby="website-search-help"
            />
            <span id="website-search-help" className="sr-only">Zoek websites op naam, URL of samenvatting</span>
            {websiteSearchQuery && (
              <button
                onClick={() => setWebsiteSearchQuery('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 p-1 hover:bg-gray-100 rounded"
                aria-label="Wis zoekopdracht"
              >
                <X className="w-4 h-4" style={{ color: '#9C885C' }} aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Filter by Type */}
          {uniqueWebsiteTypes.length > 0 && (
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4" style={{ color: '#9C885C' }} aria-hidden="true" />
              <label htmlFor="website-type-filter" className="sr-only">Filter op website type</label>
              <select
                id="website-type-filter"
                value={websiteFilterType || ''}
                onChange={(e) => setWebsiteFilterType(e.target.value || null)}
                className="px-3 py-2 border-2 rounded-lg text-sm"
                style={{
                  backgroundColor: 'white',
                  borderColor: websiteFilterType ? '#002EA3' : '#E5E5E5',
                  color: '#161620'
                }}
                aria-label="Filter websites op type"
              >
                <option value="">Alle types</option>
                {uniqueWebsiteTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>
          )}

          {/* Sort */}
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <button 
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors" 
                  title="Meer informatie over sorteren"
                  aria-label="Meer informatie over sorteren"
                >
                  <Info className="w-4 h-4" style={{ color: '#9C885C' }} aria-hidden="true" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-80" role="tooltip">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm" style={{ color: '#161620' }}>Sorteer opties</h4>
                  <ul className="text-xs space-y-1" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                    <li><strong>Relevantie:</strong> Websites gerangschikt op relevantie voor uw onderwerp</li>
                    <li><strong>Naam:</strong> Alfabetisch gesorteerd op website naam</li>
                    <li><strong>Type:</strong> Gesorteerd op organisatietype (gemeente, waterschap, etc.)</li>
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
            <label htmlFor="website-sort-select" className="sr-only">Sorteer websites</label>
            <select
              id="website-sort-select"
              value={websiteSortBy}
              onChange={(e) => setWebsiteSortBy(e.target.value as 'relevance' | 'name' | 'type')}
              className="px-3 py-2 border-2 rounded-lg text-sm"
              style={{
                backgroundColor: 'white',
                borderColor: '#E5E5E5',
                color: '#161620'
              }}
              aria-label="Sorteer websites op"
            >
              <option value="relevance">Sorteer op relevantie</option>
              <option value="name">Sorteer op naam</option>
              <option value="type">Sorteer op type</option>
            </select>
          </div>
        </div>

        {/* Selection Summary and Bulk Actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-lg" style={{ backgroundColor: 'rgba(0, 46, 163, 0.05)' }} role="region" aria-label="Website selectie samenvatting">
          <div className="flex items-center gap-4">
            <button
              onClick={handleSelectAllWebsites}
              data-testid="select-all-websites-button"
              className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 hover:shadow-sm transition-all"
              style={{
                backgroundColor: 'white',
                borderColor: '#002EA3',
                color: '#002EA3'
              }}
              aria-label={selectedWebsites.length === filteredAndSortedWebsites.length && filteredAndSortedWebsites.length > 0 ? 'Deselecteer alle websites' : 'Selecteer alle websites'}
            >
              {selectedWebsites.length === filteredAndSortedWebsites.length && filteredAndSortedWebsites.length > 0 ? (
                <>
                  <CheckSquare className="w-4 h-4" aria-hidden="true" />
                  <span>Deselecteer alles</span>
                </>
              ) : (
                <>
                  <Square className="w-4 h-4" aria-hidden="true" />
                  <span>Selecteer alles</span>
                </>
              )}
            </button>
            <div className="text-sm" style={{ color: '#161620' }} role="status" aria-live="polite" aria-atomic="true">
              <strong>{selectedWebsites.length}</strong> van <strong>{filteredAndSortedWebsites.length}</strong> websites geselecteerd
              {websiteSearchQuery || websiteFilterType ? (
                <span className="ml-2" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  (van {Array.isArray(suggestedWebsites) ? suggestedWebsites.length : 0} totaal)
                </span>
              ) : null}
            </div>
          </div>
          {websiteSearchQuery || websiteFilterType ? (
            <button
              onClick={() => {
                setWebsiteSearchQuery('');
                setWebsiteFilterType(null);
              }}
              className="flex items-center gap-2 text-sm px-3 py-1 rounded hover:bg-white transition-colors"
              style={{ color: ACCESSIBLE_COLORS.goldText }}
              aria-label="Wis alle filters"
            >
              <X className="w-3 h-3" aria-hidden="true" />
              <span>Filters wissen</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Website Selection List */}
      <div className="mt-4 space-y-4" role="list" aria-label="Beschikbare websites" data-testid="website-suggestions-list">
        {filteredAndSortedWebsites.length > 0 ? (
          filteredAndSortedWebsites.map((website) => (
          <div
            key={website._id}
            data-testid={`website-card-${website._id}`}
            role="listitem"
            className="w-full"
          >
            <button
              onClick={() => toggleWebsiteSelection(website._id!)}
              className="w-full p-6 rounded-xl border-2 hover:shadow-lg transition-all text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#002EA3]"
              style={{
                backgroundColor: 'white',
                borderColor: selectedWebsites.includes(website._id!) ? '#002EA3' : '#E5E5E5'
              }}
              aria-pressed={selectedWebsites.includes(website._id!)}
              aria-label={`${selectedWebsites.includes(website._id!) ? 'Deselecteer' : 'Selecteer'} ${website.titel}`}
            >
              <div className="flex items-start gap-4">
                <div
                  className="w-6 h-6 rounded border-2 flex-shrink-0 flex items-center justify-center mt-1"
                  style={{
                    borderColor: selectedWebsites.includes(website._id!) ? '#002EA3' : '#E5E5E5',
                    backgroundColor: selectedWebsites.includes(website._id!) ? '#002EA3' : 'white'
                  }}
                  role="checkbox"
                  aria-checked={selectedWebsites.includes(website._id!)}
                  aria-hidden="true"
                >
                  {selectedWebsites.includes(website._id!) && (
                    <Check className="w-4 h-4" style={{ color: 'white' }} aria-hidden="true" />
                  )}
                </div>
                <div className="flex-1">
                  <h4 className="text-lg mb-2" style={{ color: '#161620', fontFamily: "'Abhaya Libre', serif", fontWeight: 600 }}>
                    {website.titel}
                  </h4>
                  <a
                    href={website.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="text-sm flex items-center gap-1 hover:opacity-70 transition-opacity mb-2"
                    style={{ color: '#002EA3' }}
                    aria-label={`Open ${website.titel} in nieuw tabblad`}
                  >
                    <ExternalLink className="w-3 h-3" aria-hidden="true" />
                    <span>{website.url}</span>
                  </a>
                <p className="text-sm" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  {website.samenvatting}
                </p>
                {website['relevantie voor zoekopdracht'] && (
                  <p className="text-sm mt-2" style={{ color: '#161620' }}>
                    <strong>Relevantie:</strong> {website['relevantie voor zoekopdracht']}
                  </p>
                )}
                {website.website_types && website.website_types.length > 0 && (
                  <div className="flex gap-2 mt-2">
                    {website.website_types.map((type, idx) => (
                      <span
                        key={idx}
                        className="px-2 py-1 rounded text-xs"
                        style={{
                          backgroundColor: 'rgba(156, 136, 92, 0.1)',
                          color: ACCESSIBLE_COLORS.goldText
                        }}
                      >
                        {type}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            </button>
          </div>
          ))
        ) : (
          <div className="p-8 rounded-xl text-center" style={{ backgroundColor: 'rgba(243, 112, 33, 0.05)' }}>
            <Search className="w-12 h-12 mx-auto mb-4" style={{ color: '#9C885C' }} />
            <h4 className="text-lg mb-2" style={{ color: '#161620', fontFamily: "'Abhaya Libre', serif", fontWeight: 600 }}>
              Geen websites gevonden
            </h4>
            <p className="mb-4 text-sm" style={{ color: '#161620' }}>
              Geen websites gevonden met de huidige filters.
            </p>
            <Button
              onClick={() => {
                setWebsiteSearchQuery('');
                setWebsiteFilterType(null);
              }}
              variant="outline"
              className="mt-2"
              style={{ borderColor: '#002EA3', color: '#002EA3' }}
            >
              Filters wissen
            </Button>
          </div>
        )}
      </div>

      {(!Array.isArray(suggestedWebsites) || suggestedWebsites.length === 0) && (
        <div className="mt-8 p-8 rounded-xl text-center" style={{ backgroundColor: 'rgba(243, 112, 33, 0.05)' }}>
          <Search className="w-16 h-16 mx-auto mb-4" style={{ color: '#9C885C' }} />
          <h4 className="text-xl mb-2" style={{ color: '#161620', fontFamily: "'Abhaya Libre', serif", fontWeight: 600 }}>
            Geen websites gevonden
          </h4>
          <p className="mb-4" style={{ color: '#161620' }}>
            We hebben geen websites gevonden op basis van uw criteria.
          </p>
          <div className="space-y-2 text-sm text-left max-w-md mx-auto" style={{ color: ACCESSIBLE_COLORS.goldText }}>
            <p><strong style={{ color: '#161620' }}>Probeer het volgende:</strong></p>
            <ul className="list-disc list-inside space-y-1">
              <li>Pas uw zoekopdracht aan</li>
              <li>Selecteer een andere overheidslaag</li>
              <li>Kies een andere instantie</li>
              <li>Gebruik meer algemene zoektermen</li>
            </ul>
          </div>
          <Button
            onClick={() => setStep(1)}
            variant="outline"
            className="mt-6"
            style={{ borderColor: '#002EA3', color: '#002EA3' }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Terug naar configuratie
          </Button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-4 mt-8">
        <Button
          onClick={() => setStep(1)}
          variant="outline"
          className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2"
          style={{ borderColor: '#9C885C', color: '#161620' }}
          disabled={isScrapingWebsites}
        >
          <ArrowLeft className="w-4 h-4" />
          Vorige
        </Button>
        {!isScrapingWebsites && scrapedDocuments.length === 0 && (
          <div className="flex items-center gap-2">
            <Dialog open={showScrapingInfo} onOpenChange={setShowScrapingInfo}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  style={{ borderColor: '#9C885C', color: '#161620' }}
                  disabled={!canProceedStep4}
                >
                  <Info className="w-4 h-4" />
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle style={{ color: '#161620', fontFamily: "'Abhaya Libre', serif", fontWeight: 600 }}>
                    Wat gebeurt er tijdens het scrapen?
                  </DialogTitle>
                  <DialogDescription style={{ color: ACCESSIBLE_COLORS.goldText }}>
                    Een overzicht van het scraping proces
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3 mt-4" style={{ color: '#161620' }}>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(0, 46, 163, 0.05)' }}>
                    <p className="text-sm font-medium mb-1">1. Navigatienetwerk opbouwen</p>
                    <p className="text-xs" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                      We verkennen de structuur van de geselecteerde websites
                    </p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(0, 46, 163, 0.05)' }}>
                    <p className="text-sm font-medium mb-1">2. Documenten zoeken</p>
                    <p className="text-xs" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                      Relevante pagina's en documenten worden gevonden op basis van uw onderwerp
                    </p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(0, 46, 163, 0.05)' }}>
                    <p className="text-sm font-medium mb-1">3. Analyse en beoordeling</p>
                    <p className="text-xs" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                      Documenten worden geanalyseerd op relevantie en samengevat
                    </p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'rgba(243, 112, 33, 0.05)' }}>
                    <p className="text-xs" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                      <strong style={{ color: '#161620' }}>Let op:</strong> Het proces kan enkele minuten duren. 
                      U kunt de voortgang volgen via de grafiek visualisatie die automatisch wordt geopend.
                    </p>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
            <Button
              data-testid="scrape-websites-button"
              onClick={handleScrapeWebsites}
              disabled={!canProceedStep4}
              className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                backgroundColor: canProceedStep4 ? '#002EA3' : '#E5E5E5',
                color: 'white',
                opacity: canProceedStep4 ? 1 : 0.5
              }}
            >
              {`${t('beleidsscan.scrape')} ${selectedWebsites.length} website${selectedWebsites.length !== 1 ? 's' : ''}`}
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        )}
        {isScrapingWebsites && (
          <div className="flex-1 space-y-3">
            <Button
              disabled
              className="flex items-center gap-2 w-full"
              style={{
                backgroundColor: '#002EA3',
                color: 'white',
                opacity: 0.7
              }}
            >
              <RefreshCw className="w-4 h-4 animate-spin" />
              {t('beleidsscan.scraping')}
            </Button>
            {/* Enhanced progress visibility - IMPROVED */}
            <div className="space-y-3 p-4 rounded-lg border-2" style={{ 
              backgroundColor: 'rgba(0, 46, 163, 0.05)',
              borderColor: '#002EA3'
            }}>
              {scrapingProgress > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span style={{ color: '#161620', fontWeight: 600 }}>
                      Voortgang: {scrapingProgress}%
                    </span>
                    {scrapingEstimatedTime && (
                      <span className="flex items-center gap-1" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                        <Clock className="w-3 h-3" />
                        ~{scrapingEstimatedTime} min resterend
                      </span>
                    )}
                  </div>
                  <Progress value={scrapingProgress} className="h-3" />
                  {scrapingStatus && (
                    <p className="text-xs" style={{ color: ACCESSIBLE_COLORS.goldText }}>
                      {scrapingStatus}
                    </p>
                  )}
                </div>
              )}
              <div className="flex items-center justify-between text-sm pt-2 border-t" style={{ borderColor: 'rgba(0, 46, 163, 0.2)' }}>
                <span style={{ color: '#161620' }}>
                  <strong style={{ color: '#002EA3' }}>{scrapingDocumentsFound}</strong> documenten gevonden
                </span>
                {workflowRunId && (
                  <button
                    onClick={() => {
                      if (workflowRunId) {
                        dispatch(actions.setScrapingRunId(workflowRunId));
                      }
                      dispatch(actions.setShowGraphVisualizer(true));
                    }}
                    className="flex items-center gap-1 text-xs underline hover:no-underline transition-all"
                    style={{ color: '#002EA3' }}
                    aria-label={t('step2.viewDetailsAria')}
                  >
                    <Info className="w-3 h-3" />
                    {t('step2.viewDetails')}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {!isScrapingWebsites && scrapedDocuments.length > 0 && (
          <Button
            data-testid="go-to-results-button"
            onClick={() => setStep(3)}
            className="flex items-center justify-center gap-2 min-h-[44px] focus:outline-none focus:ring-2 focus:ring-offset-2"
            style={{
              backgroundColor: '#002EA3',
              color: 'white'
            }}
          >
            Naar resultaten ({scrapedDocuments.length})
            <ArrowRight className="w-4 h-4" />
          </Button>
        )}
      </div>

      {/* Summary */}
      {selectedWebsites.length > 0 && (
        <div className="mt-8 p-6 rounded-xl" style={{ backgroundColor: 'rgba(0, 46, 163, 0.05)' }}>
          <h4 className="mb-4" style={{ color: '#161620', fontFamily: "'Abhaya Libre', serif", fontWeight: 600 }}>
            Geselecteerde websites:
          </h4>
          <ul className="space-y-1 text-sm">
            {selectedWebsites.map(id => {
              const website = suggestedWebsites.find(w => w._id === id);
              return website ? (
                <li key={id} style={{ color: ACCESSIBLE_COLORS.goldText }}>
                  • {website.titel}
                </li>
              ) : null;
            })}
          </ul>
        </div>
      )}
    </section>
  );
};


