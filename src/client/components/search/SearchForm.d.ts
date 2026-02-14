/**
 * Search Form Component
 *
 * Handles the search form with topic input, location autocomplete,
 * jurisdiction selector, and search button.
 */
import React from 'react';
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
export declare function SearchForm({ topic, onTopicChange, location, onLocationChange, locationSearch, onLocationSearchChange, filteredMunicipalities, jurisdiction, onJurisdictionChange, loading, onSubmit, }: SearchFormProps): import("react/jsx-runtime").JSX.Element;
export {};
