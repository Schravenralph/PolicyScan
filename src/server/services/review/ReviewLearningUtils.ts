/**
 * Utilities for review learning algorithm enhancements
 * Provides fuzzy matching, content similarity, and multi-factor ranking
 */

export interface FuzzyMatchResult {
    similarity: number; // 0-1 score
    matchedPattern: string;
    matchType: 'exact' | 'fuzzy' | 'domain' | 'path';
}

export interface ContentSimilarityResult {
    similarity: number; // 0-1 score
    factors: {
        titleMatch: number;
        snippetMatch: number;
        metadataMatch: number;
    };
}

export interface HistoricalTrend {
    period: string; // e.g., "2025-01"
    acceptanceRate: number;
    count: number;
    trend: 'increasing' | 'decreasing' | 'stable';
}

export interface BoostExplanation {
    factors: Array<{
        type: string;
        value: number;
        contribution: number;
        description: string;
    }>;
    totalBoost: number;
    confidence: number;
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix: number[][] = [];

    // Initialize matrix
    for (let i = 0; i <= len1; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len2; j++) {
        matrix[0][j] = j;
    }

    // Fill matrix
    for (let i = 1; i <= len1; i++) {
        for (let j = 1; j <= len2; j++) {
            const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,      // deletion
                matrix[i][j - 1] + 1,      // insertion
                matrix[i - 1][j - 1] + cost // substitution
            );
        }
    }

    return matrix[len1][len2];
}

/**
 * Calculate fuzzy similarity between two strings (0-1)
 */
function fuzzySimilarity(str1: string, str2: string): number {
    if (str1 === str2) return 1.0;
    if (str1.length === 0 || str2.length === 0) return 0.0;

    const maxLen = Math.max(str1.length, str2.length);
    const distance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
    return 1 - (distance / maxLen);
}

/**
 * Extract URL pattern (normalized hostname + path prefix)
 */
export function extractUrlPattern(url: string): string | null {
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase().replace(/^www\./, '');
        const pathSegments = urlObj.pathname.split('/').filter(p => p);
        const pathPrefix = pathSegments.slice(0, 2).join('/');
        return pathPrefix ? `${hostname}/${pathPrefix}` : hostname;
    } catch {
        return null;
    }
}

/**
 * Fuzzy match URL patterns
 */
export function fuzzyMatchUrl(
    candidateUrl: string,
    patternUrl: string,
    threshold: number = 0.7
): FuzzyMatchResult | null {
    try {
        const candidatePattern = extractUrlPattern(candidateUrl);
        const pattern = extractUrlPattern(patternUrl);
        
        if (!candidatePattern || !pattern) {
            return null;
        }

        // Exact match
        if (candidatePattern === pattern) {
            return {
                similarity: 1.0,
                matchedPattern: pattern,
                matchType: 'exact'
            };
        }

        // Domain and path matching
        const candidateParts = candidatePattern.split('/');
        const patternParts = pattern.split('/');
        
        const candidateDomain = candidateParts[0];
        const patternDomain = patternParts[0];
        
        // Domain match
        const domainMatch = candidateDomain === patternDomain ||
            candidateDomain.endsWith(`.${patternDomain}`) ||
            patternDomain.endsWith(`.${candidateDomain}`);
        
        if (domainMatch) {
            // Path fuzzy matching
            if (candidateParts.length > 1 && patternParts.length > 1) {
                const candidatePath = candidateParts.slice(1).join('/');
                const patternPath = patternParts.slice(1).join('/');
                
                // Path prefix match
                if (candidatePath.startsWith(patternPath) || patternPath.startsWith(candidatePath)) {
                    return {
                        similarity: 0.9,
                        matchedPattern: pattern,
                        matchType: 'path'
                    };
                }
                
                // Fuzzy path match
                const pathSimilarity = fuzzySimilarity(candidatePath, patternPath);
                if (pathSimilarity >= threshold) {
                    return {
                        similarity: pathSimilarity,
                        matchedPattern: pattern,
                        matchType: 'fuzzy'
                    };
                }
            }
            
            // Domain-only match
            return {
                similarity: 0.6,
                matchedPattern: pattern,
                matchType: 'domain'
            };
        }

        // Full fuzzy match
        const fullSimilarity = fuzzySimilarity(candidatePattern, pattern);
        if (fullSimilarity >= threshold) {
            return {
                similarity: fullSimilarity,
                matchedPattern: pattern,
                matchType: 'fuzzy'
            };
        }

        return null;
    } catch {
        return null;
    }
}

/**
 * Calculate content similarity between candidate and historical accepted candidates
 */
export function calculateContentSimilarity(
    candidate: { title: string; snippet?: string; metadata?: Record<string, unknown> },
    historicalTitles: string[],
    historicalSnippets: string[]
): ContentSimilarityResult {
    const titleMatch = historicalTitles.length > 0
        ? Math.max(...historicalTitles.map(ht => fuzzySimilarity(candidate.title.toLowerCase(), ht.toLowerCase())))
        : 0;

    const snippetMatch = candidate.snippet && historicalSnippets.length > 0
        ? Math.max(...historicalSnippets.map(hs => {
            const candidateSnippet = candidate.snippet!.toLowerCase();
            const histSnippet = hs.toLowerCase();
            // Use word overlap for snippets (more lenient)
            const candidateWords = new Set(candidateSnippet.split(/\s+/));
            const histWords = new Set(histSnippet.split(/\s+/));
            const intersection = new Set([...candidateWords].filter(w => histWords.has(w)));
            const union = new Set([...candidateWords, ...histWords]);
            return union.size > 0 ? intersection.size / union.size : 0;
        }))
        : 0;

    // Metadata matching (simple key-value overlap)
    const metadataMatch = candidate.metadata && Object.keys(candidate.metadata).length > 0
        ? 0.3 // Base score for having metadata
        : 0;

    const similarity = (titleMatch * 0.5) + (snippetMatch * 0.3) + (metadataMatch * 0.2);

    return {
        similarity,
        factors: {
            titleMatch,
            snippetMatch,
            metadataMatch
        }
    };
}

/**
 * Calculate historical trend analysis
 */
export function calculateHistoricalTrend(
    reviews: Array<{ completedAt?: Date; candidateResults: Array<{ reviewStatus: string }> }>
): HistoricalTrend[] {
    // Group by month
    const monthlyData = new Map<string, { accepted: number; total: number }>();

    for (const review of reviews) {
        if (!review.completedAt) continue;
        
        const month = review.completedAt.toISOString().substring(0, 7); // YYYY-MM
        const stats = monthlyData.get(month) || { accepted: 0, total: 0 };
        
        for (const candidate of review.candidateResults) {
            stats.total++;
            if (candidate.reviewStatus === 'accepted') {
                stats.accepted++;
            }
        }
        
        monthlyData.set(month, stats);
    }

    // Convert to trends
    const trends: HistoricalTrend[] = [];
    const sortedMonths = Array.from(monthlyData.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    
    for (let i = 0; i < sortedMonths.length; i++) {
        const [period, stats] = sortedMonths[i];
        const acceptanceRate = stats.total > 0 ? stats.accepted / stats.total : 0;
        
        let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
        if (i > 0) {
            const prevTrend = trends[i - 1];
            const diff = acceptanceRate - prevTrend.acceptanceRate;
            if (Math.abs(diff) < 0.05) {
                trend = 'stable';
            } else if (diff > 0) {
                trend = 'increasing';
            } else {
                trend = 'decreasing';
            }
        }
        
        trends.push({
            period,
            acceptanceRate,
            count: stats.total,
            trend
        });
    }

    return trends;
}

/**
 * Generate boost explanation for transparency
 */
export function generateBoostExplanation(
    boostScore: number,
    factors: {
        urlPattern?: { pattern: string; acceptanceRate: number; similarity: number };
        contentSimilarity?: number;
        historicalTrend?: { trend: string; acceptanceRate: number };
        metadata?: Record<string, unknown>;
    }
): BoostExplanation {
    const explanationFactors: Array<{
        type: string;
        value: number;
        contribution: number;
        description: string;
    }> = [];

    if (factors.urlPattern) {
        const contribution = factors.urlPattern.acceptanceRate * factors.urlPattern.similarity * 0.4;
        explanationFactors.push({
            type: 'url_pattern',
            value: factors.urlPattern.acceptanceRate,
            contribution,
            description: `URL pattern "${factors.urlPattern.pattern}" has ${(factors.urlPattern.acceptanceRate * 100).toFixed(0)}% acceptance rate (similarity: ${(factors.urlPattern.similarity * 100).toFixed(0)}%)`
        });
    }

    if (factors.contentSimilarity !== undefined) {
        const contribution = factors.contentSimilarity * 0.3;
        explanationFactors.push({
            type: 'content_similarity',
            value: factors.contentSimilarity,
            contribution,
            description: `Content similarity to accepted candidates: ${(factors.contentSimilarity * 100).toFixed(0)}%`
        });
    }

    if (factors.historicalTrend) {
        const contribution = factors.historicalTrend.acceptanceRate * 0.2;
        explanationFactors.push({
            type: 'historical_trend',
            value: factors.historicalTrend.acceptanceRate,
            contribution,
            description: `Historical acceptance rate: ${(factors.historicalTrend.acceptanceRate * 100).toFixed(0)}% (trend: ${factors.historicalTrend.trend})`
        });
    }

    // Calculate confidence based on number of factors and their strength
    const confidence = Math.min(
        explanationFactors.reduce((sum, f) => sum + f.contribution, 0) / boostScore || 0,
        1.0
    );

    return {
        factors: explanationFactors,
        totalBoost: boostScore,
        confidence
    };
}

/**
 * ML Integration Point: Prepare features for future ML model
 */
export interface MLFeatures {
    urlPattern: string;
    urlPatternAcceptanceRate: number;
    contentSimilarity: number;
    historicalAcceptanceRate: number;
    metadata: Record<string, unknown>;
    candidateTitle: string;
    candidateSnippet?: string;
}

export function extractMLFeatures(
    candidate: { title: string; url: string; snippet?: string; metadata?: Record<string, unknown> },
    urlPattern: { pattern: string; acceptanceRate: number } | null,
    contentSimilarity: number,
    historicalAcceptanceRate: number
): MLFeatures {
    return {
        urlPattern: urlPattern?.pattern || '',
        urlPatternAcceptanceRate: urlPattern?.acceptanceRate || 0,
        contentSimilarity,
        historicalAcceptanceRate,
        metadata: candidate.metadata || {},
        candidateTitle: candidate.title,
        candidateSnippet: candidate.snippet
    };
}
















