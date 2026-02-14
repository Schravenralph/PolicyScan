/**
 * Onderwerp Input Component
 * 
 * Command component for entering/searching topics with suggestions,
 * popular topics, recent searches, and validation.
 */

import React from 'react';
import { Check, Clock, AlertCircle } from 'lucide-react';
import { Label } from '../ui/label';
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

interface OnderwerpInputProps {
  overheidslaag: WebsiteType | null;
  onderwerp: string;
  topicSearchQuery: string;
  onTopicSearchChange: (query: string) => void;
  onOnderwerpChange: (onderwerp: string) => void;
  onClearValidationError: () => void;
  validationError?: string;
  popularTopics: string[];
  recentSearches: string[];
  filteredTopics: string[];
  getCharacterCounterColor: () => string;
  canProceedStep1: boolean;
  isLoadingWebsites: boolean;
  onGenerateWebsites: () => Promise<void>;
}

export function OnderwerpInput({
  overheidslaag,
  onderwerp,
  topicSearchQuery,
  onTopicSearchChange,
  onOnderwerpChange,
  onClearValidationError,
  validationError,
  popularTopics,
  recentSearches,
  filteredTopics,
  getCharacterCounterColor,
  canProceedStep1,
  isLoadingWebsites,
  onGenerateWebsites,
}: OnderwerpInputProps) {
  const handleTopicSelect = (topic: string) => {
    onOnderwerpChange(topic);
    onTopicSearchChange(topic);
    if (validationError) {
      onClearValidationError();
    }
  };

  const handleInputChange = (value: string) => {
    onTopicSearchChange(value);
    onOnderwerpChange(value);
    if (validationError) {
      onClearValidationError();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canProceedStep1 && !isLoadingWebsites) {
      onGenerateWebsites();
    }
  };

  return (
    <div className="mt-8" role="group" aria-labelledby="onderwerp-label">
      <div className="flex items-center gap-2 mb-4">
        <Label className="text-lg block text-foreground" htmlFor="onderwerp-input" id="onderwerp-label">
          {overheidslaag === 'kennisinstituut' ? '2. ' : '3. '}{t('onderwerpInput.enterSubject')}
          <span className="ml-1 text-destructive" aria-label={t('onderwerpInput.requiredField')}>*</span>
        </Label>
      </div>
      <div className="space-y-2">
        <p className="text-xs mb-2 text-muted-foreground">
          <span className="font-medium">{t('onderwerpInput.optional')}</span> {t('onderwerpInput.chooseSuggestionOrType')}
        </p>
        <Command
          className={`rounded-lg border-2 ${
            validationError
              ? 'border-destructive'
              : onderwerp
                ? 'border-primary'
                : 'border-border'
          }`}
          role="combobox"
          aria-expanded={topicSearchQuery.length > 0}
          aria-haspopup="listbox"
          aria-invalid={!!validationError}
          aria-describedby={validationError ? 'onderwerp-error' : 'onderwerp-help'}
        >
          <CommandInput
            id="onderwerp-input"
            data-testid="onderwerp-input"
            placeholder={t('onderwerpInput.placeholder')}
            value={topicSearchQuery}
            onValueChange={handleInputChange}
            onKeyDown={handleKeyDown}
            className="text-base p-4 sm:p-6"
            style={{ backgroundColor: 'white' }}
            aria-label={t('onderwerpInput.enterSubjectAria')}
            aria-required="true"
            aria-controls="topic-listbox"
          />
          <CommandList id="topic-listbox" role="listbox" aria-label={t('onderwerpInput.topicSuggestions')}>
            {!topicSearchQuery && (
              <>
                {popularTopics.length > 0 && (
                  <CommandGroup heading={t('onderwerpInput.popularTopics')} role="group" aria-label={t('onderwerpInput.popularTopics')}>
                    {popularTopics.map((topic) => (
                      <CommandItem
                        key={topic}
                        value={topic}
                        onSelect={() => handleTopicSelect(topic)}
                        role="option"
                        aria-selected={onderwerp === topic}
                        aria-label={t('onderwerpInput.selectTopic').replace('{{topic}}', topic)}
                      >
                        <Check
                          className={`mr-2 h-4 w-4 ${onderwerp === topic ? 'opacity-100 text-primary' : 'opacity-0'}`}
                          aria-hidden="true"
                        />
                        <span>{topic}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {recentSearches.length > 0 && (
                  <CommandGroup heading={t('onderwerpInput.recentSearches')} role="group" aria-label={t('onderwerpInput.recentSearches')}>
                    {recentSearches.map((search) => (
                      <CommandItem
                        key={search}
                        value={search}
                        onSelect={() => handleTopicSelect(search)}
                        role="option"
                        aria-selected={onderwerp === search}
                        aria-label={t('onderwerpInput.selectTopic').replace('{{topic}}', search)}
                      >
                        <Clock className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                        <span>{search}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
            {topicSearchQuery && (
              <>
                <CommandEmpty role="option" aria-label={t('onderwerpInput.noSuggestionsFound')}>{t('onderwerpInput.noSuggestionsFoundMessage')}</CommandEmpty>
                <CommandGroup role="group" aria-label={t('onderwerpInput.searchResults')}>
                  {filteredTopics.slice(0, 10).map((topic) => (
                    <CommandItem
                      key={topic}
                      value={topic}
                      onSelect={() => handleTopicSelect(topic)}
                      role="option"
                      aria-selected={onderwerp === topic}
                        aria-label={t('onderwerpInput.selectTopic').replace('{{topic}}', topic)}
                    >
                      <Check
                        className={`mr-2 h-4 w-4 ${onderwerp === topic ? 'opacity-100 text-primary' : 'opacity-0'}`}
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
        {validationError ? (
          <p
            id="onderwerp-error"
            className="text-sm flex items-center gap-1 animate-in fade-in text-destructive"
            role="alert"
            aria-live="assertive"
          >
            <AlertCircle className="w-4 h-4" aria-hidden="true" />
            <span>{validationError}</span>
          </p>
        ) : onderwerp ? (
          <p
            id="onderwerp-help"
            className="text-xs transition-colors"
            style={{ color: getCharacterCounterColor() }}
            aria-live="polite"
          >
            {t('onderwerpInput.characterCount').replace('{{count}}', onderwerp.length.toString())}
          </p>
        ) : (
          <p id="onderwerp-help" className="text-xs text-muted-foreground">
            {t('onderwerpInput.minimumCharactersRequired')}
          </p>
        )}
        {onderwerp && !validationError && onderwerp.length >= 3 && (
          <Check
            className="w-4 h-4 animate-in fade-in text-primary"
            aria-label={t('onderwerpInput.subjectValid')}
            role="img"
          />
        )}
      </div>
    </div>
  );
}
