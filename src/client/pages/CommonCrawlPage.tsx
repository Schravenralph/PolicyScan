import { useState } from 'react';
import { Search, Globe, Calendar, ExternalLink, Loader2, AlertCircle, CheckSquare, Square, History, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';
import { t } from '../utils/i18n';
import { logError } from '../utils/errorHandler';

interface CDXResult {
    urlkey: string;
    timestamp: string;
    url: string;
    mime: string;
    status: string;
    digest: string;
    length: string;
    offset: string;
    filename: string;
}

interface QueryResult {
    results: CDXResult[];
    total: number;
    crawlId: string;
    query: string;
}

export function CommonCrawlPage() {
    const [query, setQuery] = useState<string>('');
    const [domainFilter, setDomainFilter] = useState<string>('*.nl');
    const [crawlId, setCrawlId] = useState<string>('CC-MAIN-2025-47');
    const [results, setResults] = useState<QueryResult | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [errorType, setErrorType] = useState<string | null>(null);
    const [errorSuggestions, setErrorSuggestions] = useState<string[]>([]);
    const [isValidatingCrawl, setIsValidatingCrawl] = useState<boolean>(false);
    const [savedQueryId] = useState<string | null>(null);
    const [selectedResults] = useState<Set<string>>(new Set());
    const [_isSaving] = useState<boolean>(false);
    const [_isApproving] = useState<boolean>(false);
    const [showSavedQueries, setShowSavedQueries] = useState<boolean>(false);
    const [savedQueries, setSavedQueries] = useState<Array<{
        _id: string;
        query: string;
        domainFilter: string;
        crawlId: string;
        status: string;
        resultCount: number;
        createdAt: string;
    }>>([]);

    // Validate crawl ID when it changes
    const validateCrawlId = async (id: string) => {
        if (!id) return;
        
        setIsValidatingCrawl(true);
        try {
            // Use API service validation endpoint
            const data = await api.commonCrawl.validateCrawlId(id);

            if (!data.isValid) {
                setError(`${t('commonCrawl.invalidCrawlIdMessage')} ${id}`);
                setErrorType('invalid_crawl');
                setErrorSuggestions(data.suggestions || []);
            } else {
                // Clear error if validation succeeds
                if (errorType === 'invalid_crawl') {
                    setError(null);
                    setErrorType(null);
                    setErrorSuggestions([]);
                }
            }
        } catch (err) {
            // Don't show error for validation failures, just log in development
            if (process.env.NODE_ENV === 'development') {
                console.warn('Crawl ID validation failed:', err);
            }
        } finally {
            setIsValidatingCrawl(false);
        }
    };

    const handleSearch = async () => {
        if (!query.trim()) {
            setError(t('commonCrawl.pleaseEnterQuery'));
            setErrorType('invalid_pattern');
            setErrorSuggestions([t('commonCrawl.querySuggestion')]);
            return;
        }

        setIsLoading(true);
        setError(null);
        setErrorType(null);
        setErrorSuggestions([]);
        setResults(null);

        try {
            // Use API service instead of direct fetch
            const data = await api.commonCrawl.queryCommonCrawl({
                query: query.trim(),
                domainFilter,
                crawlId,
                limit: 100,
            });

            setResults(data);
            // Clear any previous errors on success
            setError(null);
            setErrorType(null);
            setErrorSuggestions([]);
        } catch (err: unknown) {
            // Handle API service errors
            const errorData = (err as { response?: { data?: unknown; status?: number } })?.response?.data || err;
            const errorMessage = (errorData as { error?: string; message?: string })?.error || 
                                (errorData as { error?: string; message?: string })?.message || 
                                'Unknown error';
            setError(errorMessage);
            setErrorType((errorData as { type?: string })?.type || 'unknown');
            setErrorSuggestions((errorData as { suggestions?: string[] })?.suggestions || []);
            
            // For 404 errors, check if it's "no results" vs "not found"
            const responseStatus = (err as { response?: { status?: number } })?.response?.status;
            if (responseStatus === 404 && (errorData as { type?: string })?.type === 'no_results') {
                // This is a valid response - no results found, not an error
                setResults({ results: [], total: 0, crawlId: crawlId, query: query.trim() });
                setError(null);
                setErrorType(null);
                setErrorSuggestions([]);
            }
            
            // Log error in development only
            if (process.env.NODE_ENV === 'development') {
                logError(err, 'common-crawl-query');
            }
        } finally {
            setIsLoading(false);
        }
    };

    const formatTimestamp = (timestamp: string): string => {
        if (timestamp.length !== 14) return timestamp;
        const year = timestamp.substring(0, 4);
        const month = timestamp.substring(4, 6);
        const day = timestamp.substring(6, 8);
        const hour = timestamp.substring(8, 10);
        const minute = timestamp.substring(10, 12);
        return `${day}-${month}-${year} ${hour}:${minute}`;
    };

    const getArchiveUrl = (result: CDXResult): string => {
        return `https://web.archive.org/web/${result.timestamp}/${result.url}`;
    };

    const loadSavedQueries = async () => {
        try {
            // Use API service instead of direct fetch
            const queries = await api.commonCrawl.getCommonCrawlQueries();
            setSavedQueries(queries);
            setShowSavedQueries(!showSavedQueries);
        } catch (err) {
            logError(err, 'load-saved-queries');
        }
    };

    return (
        <div className="p-8 h-full flex flex-col">
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <h1 className="text-3xl font-bold text-gray-900">{t('commonCrawl.title')}</h1>
                    <button
                        onClick={loadSavedQueries}
                        className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
                    >
                        <History className="w-4 h-4" />
                        {t('commonCrawl.savedQueries')}
                    </button>
                </div>
                <p className="text-gray-600">
                    {t('commonCrawl.description')}
                </p>
            </div>

            {showSavedQueries && (
                <div className="mb-6 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-xl font-semibold text-gray-900">{t('commonCrawl.savedQueries')}</h2>
                        <button
                            onClick={() => setShowSavedQueries(false)}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            ×
                        </button>
                    </div>
                    {savedQueries.length === 0 ? (
                        <p className="text-gray-500 text-sm">{t('commonCrawl.noSavedQueries')}</p>
                    ) : (
                        <div className="space-y-2">
                            {savedQueries.map((savedQuery) => (
                                <div
                                    key={savedQuery._id}
                                    className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                                >
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <p className="font-medium text-gray-900">{savedQuery.query}</p>
                                            <p className="text-sm text-gray-500">
                                                Domain: {savedQuery.domainFilter || 'All'} | 
                                                Crawl: {savedQuery.crawlId} | 
                                                Results: {savedQuery.resultCount}
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`px-2 py-1 rounded text-xs ${
                                                savedQuery.status === 'approved' ? 'bg-green-100 text-green-800' :
                                                savedQuery.status === 'rejected' ? 'bg-red-100 text-red-800' :
                                                'bg-gray-100 text-gray-800'
                                            }`}>
                                                {savedQuery.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
                <div className="space-y-4">
                    <div>
                        <label htmlFor="query" className="block text-sm font-medium text-gray-700 mb-2">
                            {t('commonCrawl.searchQuery')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                id="query"
                                type="text"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                                placeholder="e.g., *antennebeleid*, */beleid/*antennebeleid*"
                                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                            <button
                                onClick={handleSearch}
                                disabled={isLoading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        {t('commonCrawl.searching')}
                                    </>
                                ) : (
                                    <>
                                        <Search className="w-4 h-4" />
                                        {t('commonCrawl.search')}
                                    </>
                                )}
                            </button>
                        </div>
                        <p className="mt-2 text-xs text-gray-500">
                            Use wildcards: <code className="bg-gray-100 px-1 rounded">*</code> matches any characters.
                            Example: <code className="bg-gray-100 px-1 rounded">*.nl/*antennebeleid*</code>
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="domainFilter" className="block text-sm font-medium text-gray-700 mb-2">
                                {t('commonCrawl.domainFilter')}
                            </label>
                            <input
                                id="domainFilter"
                                type="text"
                                value={domainFilter}
                                onChange={(e) => setDomainFilter(e.target.value)}
                                placeholder="*.nl, gemeente.*, etc."
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            />
                        </div>

                        <div>
                            <label htmlFor="crawlId" className="block text-sm font-medium text-gray-700 mb-2">
                                {t('commonCrawl.crawlId')}
                            </label>
                            <select
                                id="crawlId"
                                value={crawlId}
                                onChange={(e) => {
                                    setCrawlId(e.target.value);
                                    // Validate new crawl ID
                                    validateCrawlId(e.target.value);
                                }}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            >
                                <option value="CC-MAIN-2025-47">2025-47 (Latest)</option>
                                <option value="CC-MAIN-2025-43">2025-43</option>
                                <option value="CC-MAIN-2025-38">2025-38</option>
                                <option value="CC-MAIN-2025-33">2025-33</option>
                                <option value="CC-MAIN-2025-30">2025-30</option>
                                <option value="CC-MAIN-2025-26">2025-26</option>
                                <option value="CC-MAIN-2025-21">2025-21</option>
                                <option value="CC-MAIN-2025-18">2025-18</option>
                                <option value="CC-MAIN-2025-13">2025-13</option>
                                <option value="CC-MAIN-2025-08">2025-08</option>
                                <option value="CC-MAIN-2025-05">2025-05</option>
                                <option value="CC-MAIN-2024-51">2024-51</option>
                                <option value="CC-MAIN-2024-46">2024-46</option>
                                <option value="CC-MAIN-2024-42">2024-42</option>
                                <option value="CC-MAIN-2024-38">2024-38</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                        <h3 className="text-sm font-medium text-red-800">
                            {errorType === 'invalid_crawl' && t('commonCrawl.invalidCrawlId')}
                            {errorType === 'no_results' && t('commonCrawl.noResultsFound')}
                            {errorType === 'invalid_pattern' && t('commonCrawl.invalidPattern')}
                            {errorType === 'network_error' && t('commonCrawl.networkError')}
                            {errorType === 'server_error' && t('commonCrawl.serverError')}
                            {!errorType && t('commonCrawl.error')}
                        </h3>
                        <p className="text-sm text-red-700 mt-1">{error}</p>
                        {errorSuggestions.length > 0 && (
                            <div className="mt-3 text-xs text-red-600">
                                <p className="font-medium mb-1">{t('commonCrawl.suggestions')}</p>
                                <ul className="list-disc list-inside space-y-1">
                                    {errorSuggestions.map((suggestion, idx) => (
                                        <li key={idx}>{suggestion}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {errorType === 'invalid_crawl' && (
                            <div className="mt-3 text-xs text-red-600">
                                <p className="font-medium">{t('commonCrawl.currentCrawlId')} <code className="bg-red-100 px-1 rounded">{crawlId}</code></p>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            {isValidatingCrawl && (
                <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center gap-2">
                    <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />
                    <span className="text-sm text-blue-700">{t('commonCrawl.validatingCrawlId')}</span>
                </div>
            )}

            {results && (
                <div className="flex-1 overflow-auto">
                    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-3">
                                <CheckCircle2 className="w-5 h-5 text-green-600" />
                                <h2 className="text-xl font-semibold text-gray-900">
                                    {t('commonCrawl.results')} ({results.total.toLocaleString()} {t('commonCrawl.found')})
                                </h2>
                            </div>
                            <div className="text-sm text-gray-500">
                                Crawl: {results.crawlId}
                            </div>
                        </div>

                        {results.results.length === 0 ? (
                            <div className="text-center py-12 text-gray-500">
                                <Globe className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                                <p>{t('commonCrawl.noResultsForQuery')}</p>
                                <p className="text-sm mt-2">Probeer uw zoekpatroon of domeinfilter aan te passen.</p>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {results.results.map((result) => {
                                    const resultKey = `${result.urlkey}-${result.timestamp}`;
                                    const isSelected = selectedResults.has(resultKey);
                                    return (
                                        <div
                                            key={resultKey}
                                            className={`border rounded-lg p-4 transition-colors ${
                                                isSelected ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:bg-gray-50'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                {savedQueryId && (
                                                    <button
                                                        onClick={() => {
                                                            // TODO: Implement toggleResultSelection
                                                        }}
                                                        className="mt-1 flex-shrink-0"
                                                    >
                                                        {isSelected ? (
                                                            <CheckSquare className="w-5 h-5 text-blue-600" />
                                                        ) : (
                                                            <Square className="w-5 h-5 text-gray-400" />
                                                        )}
                                                    </button>
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <a
                                                        href={getArchiveUrl(result)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-blue-600 hover:text-blue-800 font-medium break-all flex items-center gap-2"
                                                    >
                                                        {result.url}
                                                        <ExternalLink className="w-4 h-4 flex-shrink-0" />
                                                    </a>
                                                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                                        <span className="flex items-center gap-1">
                                                            <Calendar className="w-4 h-4" />
                                                            {formatTimestamp(result.timestamp)}
                                                        </span>
                                                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">
                                                            {result.mime}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded text-xs ${
                                                            result.status === '200' 
                                                                ? 'bg-green-100 text-green-700' 
                                                                : 'bg-yellow-100 text-yellow-700'
                                                        }`}>
                                                            HTTP {result.status}
                                                        </span>
                                                        <span className="text-xs">
                                                            {parseInt(result.length).toLocaleString()} bytes
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {results.total > results.results.length && (
                            <div className="mt-4 text-center text-sm text-gray-500">
                                {t('commonCrawl.showingOf')} {results.results.length} {t('commonCrawl.ofResults')} {results.total.toLocaleString()} {t('commonCrawl.increaseLimit')}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {!results && !isLoading && !error && (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <Globe className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-medium text-gray-900 mb-2">{t('commonCrawl.startExploring')}</h3>
                        <p className="text-gray-600 max-w-md">
                            Voer hierboven een zoekopdracht in om pagina's uit het Common Crawl webarchief te vinden.
                            Gebruik wildcards om te zoeken op alle domeinen die overeenkomen met uw patroon.
                        </p>
                        <div className="mt-6 bg-gray-50 rounded-lg p-4 text-left max-w-md mx-auto">
                            <p className="text-sm font-medium text-gray-900 mb-2">{t('commonCrawl.exampleQueries')}</p>
                            <ul className="text-sm text-gray-600 space-y-1">
                                <li>• <code className="bg-white px-1 rounded">*antennebeleid*</code> - All pages with "antennebeleid"</li>
                                <li>• <code className="bg-white px-1 rounded">*.nl/beleid/*</code> - All Dutch policy pages</li>
                                <li>• <code className="bg-white px-1 rounded">gemeente.nl/*antennebeleid*</code> - Specific domain</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
