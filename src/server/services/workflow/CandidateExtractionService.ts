import { logger } from '../../utils/logger.js';

export interface CandidateSource {
    id?: string;
    _id?: { toString(): string };
    title?: string;
    titel?: string;
    name?: string;
    url?: string;
    link?: string;
    snippet?: string;
    samenvatting?: string;
    description?: string;
    summary?: string;
    relevanceScore?: number;
    [key: string]: unknown;
}

export interface ExtractedCandidate {
    id: string;
    title: string;
    url: string;
    snippet?: string;
    metadata?: Record<string, unknown>;
    boostScore?: number;
}

export class CandidateExtractionService {

    /**
     * Extract candidates from step result or context
     */
    public extractCandidates(
        stepResult: Record<string, unknown> | null | undefined,
        context: Record<string, unknown>
    ): ExtractedCandidate[] {
        let candidates: ExtractedCandidate[] = [];

        if (stepResult) {
            // Check for endpoints (common in workflow results)
            if (Array.isArray(stepResult.endpoints)) {
                candidates = (stepResult.endpoints as CandidateSource[]).map((ep, idx: number) => ({
                    id: ep.id || `candidate-${idx}`,
                    title: ep.title || ep.url || 'Untitled',
                    url: ep.url || ep.link || '',
                    snippet: ep.snippet || ep.description || '',
                    metadata: { ...ep, source: 'endpoints', relevanceScore: ep.relevanceScore }
                }));
            }
            // Check for documents
            else if (Array.isArray(stepResult.documents)) {
                candidates = (stepResult.documents as CandidateSource[]).map((doc, idx: number) => ({
                    id: doc.id || `candidate-${idx}`,
                    title: doc.title || doc.titel || doc.url || 'Untitled',
                    url: doc.url || '',
                    snippet: doc.snippet || doc.samenvatting || doc.description || '',
                    metadata: { ...doc, source: 'documents', relevanceScore: doc.relevanceScore }
                }));
            }
            // Check for results
            else if (Array.isArray(stepResult.results)) {
                candidates = (stepResult.results as CandidateSource[]).map((res, idx: number) => ({
                    id: `candidate-${idx}`,
                    title: res.title || res.name || res.url || 'Untitled',
                    url: res.url || res.link || '',
                    snippet: res.snippet || res.description || res.summary || '',
                    metadata: { ...res, source: 'results' }
                }));
            }
            // Check for canonicalDocuments
            else if (Array.isArray(stepResult.canonicalDocuments)) {
                candidates = (stepResult.canonicalDocuments as CandidateSource[]).map((doc, idx: number) => ({
                    id: doc._id?.toString() || doc.id || `candidate-${idx}`,
                    title: doc.title || doc.titel || (doc.canonicalUrl as string) || 'Untitled',
                    url: (doc.canonicalUrl as string) || doc.url || '',
                    snippet: doc.samenvatting || doc.snippet || doc.description || (doc.summary as string) || '',
                    metadata: { ...doc, source: 'canonicalDocuments' }
                }));
            }
        }

        // Also check context for candidate results if none found in stepResult
        if (candidates.length === 0) {
            const contextKeys = Object.keys(context);
            for (const key of contextKeys) {
                const value = context[key];
                if (Array.isArray(value) && value.length > 0) {
                    const firstItem = value[0];
                    if (firstItem && typeof firstItem === 'object' && ('url' in firstItem || 'link' in firstItem)) {
                        candidates = (value as CandidateSource[]).map((item, idx: number) => ({
                            id: `candidate-${idx}`,
                            title: item.title || item.titel || item.name || item.url || item.link || 'Untitled',
                            url: item.url || item.link || '',
                            snippet: item.snippet || item.samenvatting || item.description || item.summary || '',
                            metadata: { ...item, source: key }
                        }));
                        break;
                    }
                }
            }
        }

        // Specific checks for common context arrays if general check failed
        if (candidates.length === 0) {
            if (Array.isArray(context.canonicalDocuments)) {
                candidates = (context.canonicalDocuments as CandidateSource[]).map((doc, idx: number) => ({
                    id: doc._id?.toString() || doc.id || `candidate-${idx}`,
                    title: doc.title || doc.titel || (doc.canonicalUrl as string) || 'Untitled',
                    url: (doc.canonicalUrl as string) || doc.url || '',
                    snippet: doc.samenvatting || doc.snippet || doc.description || (doc.summary as string) || '',
                    metadata: { ...doc, source: 'context.canonicalDocuments', relevanceScore: doc.relevanceScore }
                }));
            }
            // Check for iploDocuments
            else if (Array.isArray(context.iploDocuments)) {
                candidates = (context.iploDocuments as CandidateSource[]).map((doc, idx: number) => ({
                    id: doc.id || doc._id?.toString() || `candidate-${idx}`,
                    title: doc.titel || doc.title || doc.url || 'Untitled',
                    url: doc.url || '',
                    snippet: doc.samenvatting || doc.snippet || doc.description || '',
                    metadata: { ...doc, source: 'context.iploDocuments', relevanceScore: doc.relevanceScore }
                }));
            }
            // Check for documents array in context
            else if (Array.isArray(context.documents)) {
                candidates = (context.documents as CandidateSource[]).map((doc, idx: number) => ({
                    id: doc.id || doc._id?.toString() || `candidate-${idx}`,
                    title: doc.titel || doc.title || doc.url || 'Untitled',
                    url: doc.url || '',
                    snippet: doc.samenvatting || doc.snippet || doc.description || '',
                    metadata: { ...doc, source: 'context.documents', relevanceScore: doc.relevanceScore }
                }));
            }
        }

        // Deduplicate
        const uniqueCandidates = this.deduplicateCandidates(candidates);

        if (candidates.length > uniqueCandidates.length) {
            logger.debug(`Deduplicated ${candidates.length} candidates to ${uniqueCandidates.length} unique candidates`);
        }

        return uniqueCandidates;
    }

    /**
     * Deduplicate candidates by URL
     */
    public deduplicateCandidates(
        candidates: ExtractedCandidate[]
    ): ExtractedCandidate[] {
        const seenUrls = new Set<string>();
        const unique: ExtractedCandidate[] = [];

        for (const candidate of candidates) {
            const normalizedUrl = candidate.url?.toLowerCase().trim() || '';
            if (normalizedUrl && !seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                unique.push(candidate);
            }
        }

        return unique;
    }
}
