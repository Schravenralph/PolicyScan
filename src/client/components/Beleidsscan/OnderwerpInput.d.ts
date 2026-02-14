/**
 * Onderwerp Input Component
 *
 * Command component for entering/searching topics with suggestions,
 * popular topics, recent searches, and validation.
 */
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
export declare function OnderwerpInput({ overheidslaag, onderwerp, topicSearchQuery, onTopicSearchChange, onOnderwerpChange, onClearValidationError, validationError, popularTopics, recentSearches, filteredTopics, getCharacterCounterColor, canProceedStep1, isLoadingWebsites, onGenerateWebsites, }: OnderwerpInputProps): import("react/jsx-runtime").JSX.Element;
export {};
