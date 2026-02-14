import { useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { ChevronDown, ChevronUp, X, Filter } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './ui/collapsible';

export interface MetadataFilters {
  documentTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  themes?: string[];
  issuingAuthorities?: string[];
  documentStatuses?: string[];
}

export interface MetadataFilterPanelProps {
  filters: MetadataFilters;
  onFiltersChange: (filters: MetadataFilters) => void;
  availableOptions?: {
    documentTypes?: string[];
    themes?: string[];
    issuingAuthorities?: string[];
    documentStatuses?: string[];
  };
  className?: string;
}

// Common document types
const DEFAULT_DOCUMENT_TYPES = [
  'Beleidsdocument',
  'Beleidsnota',
  'Beleidsregel',
  'Bestemmingsplan',
  'Omgevingsplan',
  'Omgevingsvisie',
  'Structuurvisie',
  'Verordening',
  'Besluit',
  'Rapport',
  'Visiedocument',
  'Webpagina',
  'PDF'
];

// Common document statuses
const DEFAULT_DOCUMENT_STATUSES = [
  'Concept',
  'Definitief',
  'Vastgesteld',
  'Gearchiveerd',
  'Ingetrokken'
];

export function MetadataFilterPanel({
  filters,
  onFiltersChange,
  availableOptions,
  className = ''
}: MetadataFilterPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [themeSearch, setThemeSearch] = useState('');

  const documentTypes = availableOptions?.documentTypes || DEFAULT_DOCUMENT_TYPES;
  const themes = availableOptions?.themes || [];
  const issuingAuthorities = availableOptions?.issuingAuthorities || [];
  const documentStatuses = availableOptions?.documentStatuses || DEFAULT_DOCUMENT_STATUSES;

  const activeFilterCount =
    (filters.documentTypes?.length || 0) +
    (filters.dateFrom ? 1 : 0) +
    (filters.dateTo ? 1 : 0) +
    (filters.themes?.length || 0) +
    (filters.issuingAuthorities?.length || 0) +
    (filters.documentStatuses?.length || 0);

  const handleDocumentTypeToggle = (type: string) => {
    const current = filters.documentTypes || [];
    const updated = current.includes(type)
      ? current.filter(t => t !== type)
      : [...current, type];
    onFiltersChange({ ...filters, documentTypes: updated.length > 0 ? updated : undefined });
  };

  const handleThemeToggle = (theme: string) => {
    const current = filters.themes || [];
    const updated = current.includes(theme)
      ? current.filter(t => t !== theme)
      : [...current, theme];
    onFiltersChange({ ...filters, themes: updated.length > 0 ? updated : undefined });
  };

  const handleAuthorityToggle = (authority: string) => {
    const current = filters.issuingAuthorities || [];
    const updated = current.includes(authority)
      ? current.filter(a => a !== authority)
      : [...current, authority];
    onFiltersChange({ ...filters, issuingAuthorities: updated.length > 0 ? updated : undefined });
  };

  const handleStatusToggle = (status: string) => {
    const current = filters.documentStatuses || [];
    const updated = current.includes(status)
      ? current.filter(s => s !== status)
      : [...current, status];
    onFiltersChange({ ...filters, documentStatuses: updated.length > 0 ? updated : undefined });
  };

  const handleClearAll = () => {
    onFiltersChange({});
  };

  const filteredThemes = themes.filter(theme =>
    theme.toLowerCase().includes(themeSearch.toLowerCase())
  );

  return (
    <Card className={`p-4 ${className} bg-card border-border`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <CollapsibleTrigger asChild>
          <div className="flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-foreground" />
              <h3 className="text-lg font-serif font-semibold text-foreground">
                Filters
              </h3>
              {activeFilterCount > 0 && (
                <Badge variant="default" className="text-xs bg-primary text-primary-foreground hover:bg-primary/90">
                  {activeFilterCount}
                </Badge>
              )}
            </div>
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-foreground" />
            )}
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent className="mt-4 space-y-4">
          {/* Active Filters Summary */}
          {activeFilterCount > 0 && (
            <div className="flex items-center gap-2 flex-wrap pb-3 border-b border-border">
              <span className="text-sm text-muted-foreground">Actieve filters:</span>
              {filters.documentTypes?.map(type => (
                <Badge key={type} variant="outline" className="text-xs flex items-center gap-1">
                  Type: {type}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => handleDocumentTypeToggle(type)}
                  />
                </Badge>
              ))}
              {filters.themes?.map(theme => (
                <Badge key={theme} variant="outline" className="text-xs flex items-center gap-1">
                  Thema: {theme}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => handleThemeToggle(theme)}
                  />
                </Badge>
              ))}
              {filters.issuingAuthorities?.map(authority => (
                <Badge key={authority} variant="outline" className="text-xs flex items-center gap-1">
                  Autoriteit: {authority}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => handleAuthorityToggle(authority)}
                  />
                </Badge>
              ))}
              {filters.documentStatuses?.map(status => (
                <Badge key={status} variant="outline" className="text-xs flex items-center gap-1">
                  Status: {status}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => handleStatusToggle(status)}
                  />
                </Badge>
              ))}
              {(filters.dateFrom || filters.dateTo) && (
                <Badge variant="outline" className="text-xs flex items-center gap-1">
                  Datum: {filters.dateFrom || '...'} - {filters.dateTo || '...'}
                  <X
                    className="w-3 h-3 cursor-pointer"
                    onClick={() => onFiltersChange({ ...filters, dateFrom: undefined, dateTo: undefined })}
                  />
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearAll}
                className="text-xs text-destructive hover:text-destructive/90 hover:bg-destructive/10"
              >
                Wis alles
              </Button>
            </div>
          )}

          {/* Document Type Filter */}
          <div>
            <Label className="mb-2 block text-foreground">
              Documenttype
            </Label>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {documentTypes.map(type => (
                <div key={type} className="flex items-center gap-2">
                  <Checkbox
                    checked={filters.documentTypes?.includes(type) || false}
                    onCheckedChange={() => handleDocumentTypeToggle(type)}
                  />
                  <Label className="text-sm cursor-pointer text-foreground">
                    {type}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Date Range Filter */}
          <div>
            <Label className="mb-2 block text-foreground">
              Publicatiedatum
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs mb-1 block text-muted-foreground">
                  Van
                </Label>
                <Input
                  type="date"
                  value={filters.dateFrom || ''}
                  onChange={(e) => onFiltersChange({ ...filters, dateFrom: e.target.value || undefined })}
                  className="text-sm"
                />
              </div>
              <div>
                <Label className="text-xs mb-1 block text-muted-foreground">
                  Tot
                </Label>
                <Input
                  type="date"
                  value={filters.dateTo || ''}
                  onChange={(e) => onFiltersChange({ ...filters, dateTo: e.target.value || undefined })}
                  className="text-sm"
                />
              </div>
            </div>
          </div>

          {/* Themes Filter */}
          {themes.length > 0 && (
            <div>
              <Label className="mb-2 block text-foreground">
                Thema's
              </Label>
              <Input
                placeholder="Zoek thema's..."
                value={themeSearch}
                onChange={(e) => setThemeSearch(e.target.value)}
                className="mb-2 text-sm"
              />
              <div className="max-h-40 overflow-y-auto space-y-2">
                {filteredThemes.map(theme => (
                  <div key={theme} className="flex items-center gap-2">
                    <Checkbox
                      checked={filters.themes?.includes(theme) || false}
                      onCheckedChange={() => handleThemeToggle(theme)}
                    />
                    <Label className="text-sm cursor-pointer text-foreground">
                      {theme}
                    </Label>
                  </div>
                ))}
                {filteredThemes.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Geen thema's gevonden
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Issuing Authority Filter */}
          {issuingAuthorities.length > 0 && (
            <div>
              <Label className="mb-2 block text-foreground">
                Uitgevende instantie
              </Label>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {issuingAuthorities.map(authority => (
                  <div key={authority} className="flex items-center gap-2">
                    <Checkbox
                      checked={filters.issuingAuthorities?.includes(authority) || false}
                      onCheckedChange={() => handleAuthorityToggle(authority)}
                    />
                    <Label className="text-sm cursor-pointer text-foreground">
                      {authority}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Document Status Filter */}
          {documentStatuses.length > 0 && (
            <div>
              <Label className="mb-2 block text-foreground">
                Documentstatus
              </Label>
              <div className="max-h-40 overflow-y-auto space-y-2">
                {documentStatuses.map(status => (
                  <div key={status} className="flex items-center gap-2">
                    <Checkbox
                      checked={filters.documentStatuses?.includes(status) || false}
                      onCheckedChange={() => handleStatusToggle(status)}
                    />
                    <Label className="text-sm cursor-pointer text-foreground">
                      {status}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

