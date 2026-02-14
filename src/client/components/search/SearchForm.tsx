/**
 * Search Form Component
 * 
 * Handles the search form with topic input, location autocomplete,
 * jurisdiction selector, and search button.
 */

import React from 'react';
import { Search, X, MapPin, Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../ui/select';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '../ui/command';
import { Check } from 'lucide-react';
import { t } from '../../utils/i18n';

type JurisdictionLevel = 'all' | 'national' | 'provincial' | 'municipal';

interface SearchFormProps {
    topic: string;
    onTopicChange: (value: string) => void;
    location: string;
    onLocationChange: (value: string) => void;
    locationSearch: string;
    onLocationSearchChange: (value: string) => void;
    filteredMunicipalities: string[];
    jurisdiction: JurisdictionLevel;
    onJurisdictionChange: (value: JurisdictionLevel) => void;
    loading: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

export function SearchForm({
    topic,
    onTopicChange,
    location,
    onLocationChange,
    locationSearch,
    onLocationSearchChange,
    filteredMunicipalities,
    jurisdiction,
    onJurisdictionChange,
    loading,
    onSubmit,
}: SearchFormProps) {
    return (
        <form onSubmit={onSubmit} className="space-y-4 mb-8">
            {/* Topic Input */}
            <div className="space-y-2">
                <Label htmlFor="topic-input" className="text-base font-medium">
                    {t('searchForm.topicLabel')} <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                    <Search className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                    <Input
                        id="topic-input"
                        value={topic}
                        onChange={(e) => onTopicChange(e.target.value)}
                        placeholder={t('searchForm.topicPlaceholder')}
                        className="pl-10 h-12 text-base pr-10"
                        required
                    />
                    {topic && (
                        <button
                            type="button"
                            className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors p-0.5 rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                            onClick={() => {
                                onTopicChange('');
                                document.getElementById('topic-input')?.focus();
                            }}
                            aria-label={t('searchForm.clearTopic')}
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Location Input with Autocomplete */}
            <div className="space-y-2">
                <Label htmlFor="location-input" className="text-base font-medium">
                    {t('searchForm.locationLabel')}
                </Label>
                <Command className="rounded-lg border">
                    <CommandInput
                        id="location-input"
                        placeholder={t('searchForm.locationPlaceholder')}
                        value={locationSearch}
                        onValueChange={onLocationSearchChange}
                    />
                    {locationSearch.length > 0 && filteredMunicipalities.length > 0 && (
                        <CommandList>
                            <CommandEmpty>{t('search.noMunicipalitiesFound')}</CommandEmpty>
                            <CommandGroup>
                                {filteredMunicipalities.map((name) => (
                                    <CommandItem
                                        key={name}
                                        value={name}
                                        onSelect={() => {
                                            onLocationChange(name);
                                            onLocationSearchChange('');
                                        }}
                                    >
                                        <Check
                                            className={`mr-2 h-4 w-4 ${
                                                location === name ? 'opacity-100' : 'opacity-0'
                                            }`}
                                        />
                                        <MapPin className="mr-2 h-4 w-4 text-muted-foreground" />
                                        {name}
                                    </CommandItem>
                                ))}
                            </CommandGroup>
                        </CommandList>
                    )}
                </Command>
                {location && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span>{t('entitySelector.selected')} {location}</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                                onLocationChange('');
                                onLocationSearchChange('');
                            }}
                            className="h-6 px-2"
                            aria-label={t('searchForm.clearLocation')}
                        >
                            {t('common.remove')}
                        </Button>
                    </div>
                )}
            </div>

            {/* Jurisdiction Level Select */}
            <div className="space-y-2">
                <Label htmlFor="jurisdiction-select" className="text-base font-medium">
                    {t('searchForm.jurisdictionLabel')}
                </Label>
                <Select value={jurisdiction} onValueChange={(value: JurisdictionLevel) => onJurisdictionChange(value)}>
                    <SelectTrigger id="jurisdiction-select" className="h-12 text-base">
                        <SelectValue placeholder={t('searchForm.selectJurisdiction')} />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">{t('search.allGovernmentLayers')}</SelectItem>
                        <SelectItem value="national">{t('searchForm.jurisdiction.national')}</SelectItem>
                        <SelectItem value="provincial">{t('common.governmentType.provincie')}</SelectItem>
                        <SelectItem value="municipal">{t('common.governmentType.gemeente')}</SelectItem>
                    </SelectContent>
                </Select>
            </div>

            {/* Search Button */}
            <Button
                type="submit"
                size="lg"
                disabled={loading || !topic.trim()}
                className="h-12 px-8 w-full sm:w-auto"
            >
                {loading ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        {t('searchPage.searching')}
                    </>
                ) : (
                    t('common.search')
                )}
            </Button>
        </form>
    );
}
