/**
 * Entity Selector Component
 * 
 * Command component for searching and selecting a specific entity
 * (municipality, water board, province, etc.) with validation.
 */

import { useMemo, memo } from 'react';
import { Check, HelpCircle, AlertCircle } from 'lucide-react';
import { Label } from '../ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { t } from '../../utils/i18n';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../ui/command';

type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';

interface Overheidslaag {
  id: WebsiteType;
  label: string;
}

interface EntitySelectorProps {
  overheidslaag: WebsiteType | null;
  overheidslagen: Overheidslaag[];
  selectedEntity: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onEntitySelect: (entity: string) => void;
  filteredEntities: string[];
  validationError?: string;
  isLoadingJurisdictions: boolean;
}

function EntitySelectorComponent({
  overheidslaag,
  overheidslagen,
  selectedEntity,
  searchQuery,
  onSearchChange,
  onEntitySelect,
  filteredEntities,
  validationError,
  isLoadingJurisdictions,
}: EntitySelectorProps) {
  // Memoize overheidslaag lookup to avoid find() on every render
  // Must be called before early return to follow Rules of Hooks
  const overheidslaagLabel = useMemo(() => {
    if (!overheidslaag || overheidslaag === 'kennisinstituut') {
      return 'instantie';
    }
    return overheidslagen.find(l => l.id === overheidslaag)?.label.toLowerCase() || 'instantie';
  }, [overheidslagen, overheidslaag]);

  if (!overheidslaag || overheidslaag === 'kennisinstituut') {
    return null;
  }

  return (
    <div className="mt-8" role="group" aria-labelledby="entity-selection-label">
      <div className="flex items-center gap-2 mb-4">
        <Label className={`text-lg block ${validationError ? 'text-destructive' : 'text-foreground'}`} htmlFor="entity-search-input" id="entity-selection-label">
          {t('entitySelector.selectEntity').replace('{{entity}}', 'instantie')}
          <span className="ml-1 text-destructive" aria-label={t('entitySelector.requiredField')}>*</span>
        </Label>
        <Tooltip>
          <TooltipTrigger asChild>
            <HelpCircle
              className="w-4 h-4 cursor-help text-muted-foreground"
              aria-label={t('entitySelector.helpSelectingEntity')}
              role="button"
              tabIndex={0}
            />
          </TooltipTrigger>
          <TooltipContent>
            <p className="max-w-xs">
              {t('entitySelector.helpSelectingEntityDescription')}
            </p>
          </TooltipContent>
        </Tooltip>
      </div>
      <Command
        className={`rounded-lg border-2 ${
          selectedEntity
            ? 'border-primary'
            : validationError
              ? 'border-destructive'
              : 'border-border'
        }`}
        role="combobox"
        aria-expanded={searchQuery.length > 0}
        aria-haspopup="listbox"
        aria-invalid={!!validationError}
        aria-describedby={validationError ? 'entity-error' : undefined}
      >
        <CommandInput
          id="entity-search-input"
          placeholder={`Zoek ${overheidslaagLabel}...`}
          value={searchQuery}
          onValueChange={onSearchChange}
          disabled={isLoadingJurisdictions}
          aria-label={t('entitySelector.searchEntity').replace('{{entityType}}', overheidslaagLabel)}
          aria-controls="entity-listbox"
          data-testid="entity-search-input"
        />
        <CommandList id="entity-listbox" role="listbox" aria-label={t('entitySelector.availableEntities')}>
          <CommandEmpty role="option" aria-label={t('entitySelector.noResultsFound')}>{t('entitySelector.noResultsFound')}</CommandEmpty>
          <CommandGroup role="group" aria-label={t('entitySelector.entities')}>
            {filteredEntities.map((entity) => (
              <CommandItem
                key={entity}
                value={entity}
                onSelect={() => onEntitySelect(entity)}
                role="option"
                aria-selected={selectedEntity === entity}
                aria-label={t('entitySelector.selectEntity').replace('{{entity}}', entity)}
              >
                <Check
                  className={`mr-2 h-4 w-4 ${selectedEntity === entity ? 'opacity-100 text-primary' : 'opacity-0'}`}
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
          className="mt-4 p-4 rounded-lg bg-primary/5"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <p className="text-sm text-foreground">
            <strong>{t('entitySelector.selected')}</strong> <span id="selected-entity-name">{selectedEntity}</span>
          </p>
        </div>
      ) : validationError && (
        <p
          id="entity-error"
          className="mt-2 text-sm flex items-center gap-1 animate-in fade-in text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          <span>{validationError}</span>
        </p>
      )}
    </div>
  );
}

// Memoize EntitySelector to prevent unnecessary re-renders
// Only re-render when props actually change
export const EntitySelector = memo(EntitySelectorComponent, (prevProps, nextProps) => {
  return (
    prevProps.overheidslaag === nextProps.overheidslaag &&
    prevProps.overheidslagen.length === nextProps.overheidslagen.length &&
    prevProps.selectedEntity === nextProps.selectedEntity &&
    prevProps.searchQuery === nextProps.searchQuery &&
    prevProps.filteredEntities.length === nextProps.filteredEntities.length &&
    prevProps.validationError === nextProps.validationError &&
    prevProps.isLoadingJurisdictions === nextProps.isLoadingJurisdictions &&
    prevProps.onSearchChange === nextProps.onSearchChange &&
    prevProps.onEntitySelect === nextProps.onEntitySelect
  );
});
