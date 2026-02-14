/**
 * Service for classifying documents and entities into semantic domains.
 * Uses keyword-based classification with support for future NLP-based classification.
 * 
 * Based on research: NLP-based classification can use fine-tuned BERT/SBERT models
 * to classify sentences into predefined topics (e.g., environment, spatial planning, water).
 * 
 * Current implementation: Rule-based keyword matching
 * Future enhancement: Integrate BERT/SBERT models for more accurate classification
 */

export type Domain = 
    | 'ruimtelijke ordening'
    | 'milieu'
    | 'water'
    | 'natuur'
    | 'verkeer'
    | 'wonen'
    | 'economie'
    | 'cultuur'
    | 'onderwijs'
    | 'gezondheid'
    | 'energie'
    | 'klimaat'
    | 'bodem'
    | 'geluid'
    | 'lucht'
    | 'afval'
    | 'unknown';

export interface DomainClassificationResult {
    domain: Domain;
    confidence: number;
    keywords: string[];
}

export class DomainClassificationService {
    // Domain keywords mapping - based on common policy document themes
    private domainKeywords: Map<Domain, string[]> = new Map([
        ['ruimtelijke ordening', [
            'ruimtelijke ordening', 'bestemmingsplan', 'structuurvisie', 'omgevingsvisie',
            'bouwplan', 'stedenbouw', 'planologie', 'gebiedsontwikkeling', 'locatie',
            'gebied', 'zone', 'bestemming', 'bouwvlak', 'kavel'
        ]],
        ['milieu', [
            'milieu', 'milieueffect', 'milieueffectrapportage', 'mer', 'milieuzone',
            'milieukwaliteit', 'milieubeleid', 'milieubelasting'
        ]],
        ['water', [
            'water', 'waterbeheer', 'waterkwaliteit', 'wateroverlast', 'riolering',
            'afvalwater', 'oppervlaktewater', 'grondwater', 'waterpeil', 'dijk',
            'kade', 'sloot', 'gracht', 'rivier', 'kanaal'
        ]],
        ['natuur', [
            'natuur', 'natuurbeheer', 'natuurgebied', 'natuurbescherming', 'ecologie',
            'biodiversiteit', 'habitat', 'flora', 'fauna', 'natuurnetwerk'
        ]],
        ['verkeer', [
            'verkeer', 'verkeersveiligheid', 'verkeerscirculatie', 'parkeren', 'parkeerplaats',
            'weg', 'straat', 'fietspad', 'voetpad', 'verkeersmaatregel', 'mobiliteit'
        ]],
        ['wonen', [
            'wonen', 'woonwijk', 'woongebied', 'woningbouw', 'woningcorporatie',
            'sociale woningbouw', 'koopwoning', 'huurwoning', 'woningmarkt'
        ]],
        ['economie', [
            'economie', 'economische ontwikkeling', 'bedrijventerrein', 'werkgelegenheid',
            'ondernemerschap', 'handel', 'industrie', 'commercieel'
        ]],
        ['cultuur', [
            'cultuur', 'cultureel erfgoed', 'monument', 'historisch', 'kunst',
            'musea', 'theater', 'cultuurbeleid'
        ]],
        ['onderwijs', [
            'onderwijs', 'school', 'basisschool', 'middelbare school', 'universiteit',
            'onderwijsvoorziening', 'leerling', 'student'
        ]],
        ['gezondheid', [
            'gezondheid', 'gezondheidszorg', 'ziekenhuis', 'ggd', 'gezondheidsbeleid',
            'preventie', 'zorg'
        ]],
        ['energie', [
            'energie', 'energiebesparing', 'duurzame energie', 'zonne-energie',
            'windenergie', 'energietransitie', 'energievoorziening'
        ]],
        ['klimaat', [
            'klimaat', 'klimaatadaptatie', 'klimaatmitigatie', 'klimaatbeleid',
            'co2', 'broeikasgas', 'klimaatverandering'
        ]],
        ['bodem', [
            'bodem', 'bodemkwaliteit', 'bodemverontreiniging', 'bodemonderzoek',
            'grond', 'bodemgebruik'
        ]],
        ['geluid', [
            'geluid', 'geluidsoverlast', 'geluidsnorm', 'geluidsniveau', 'decibel',
            'lawaai', 'geluidshinder'
        ]],
        ['lucht', [
            'lucht', 'luchtkwaliteit', 'luchtverontreiniging', 'fijnstof', 'stikstof',
            'luchtemissie'
        ]],
        ['afval', [
            'afval', 'afvalverwerking', 'afvalinzameling', 'recycling', 'afvalbeleid',
            'restafval', 'gft', 'pmd'
        ]]
    ]);

    /**
     * Classify a document or entity into a semantic domain based on text content.
     * 
     * @param text The text to classify (title, summary, or content)
     * @param url Optional URL for additional context
     * @returns Domain classification result with confidence score
     */
    classify(text: string, url?: string): DomainClassificationResult {
        if (!text || text.trim().length === 0) {
            return {
                domain: 'unknown',
                confidence: 0,
                keywords: []
            };
        }

        const normalizedText = text.toLowerCase();
        const normalizedUrl = url?.toLowerCase() || '';
        const combinedText = `${normalizedText} ${normalizedUrl}`;

        // Score each domain based on keyword matches
        const domainScores = new Map<Domain, { count: number; keywords: string[] }>();

        for (const [domain, keywords] of this.domainKeywords.entries()) {
            const matchedKeywords: string[] = [];
            let matchCount = 0;

            for (const keyword of keywords) {
                // Check for keyword in text (word boundary matching)
                const regex = new RegExp(`\\b${keyword}\\b`, 'i');
                if (regex.test(combinedText)) {
                    matchedKeywords.push(keyword);
                    matchCount++;
                }
            }

            if (matchCount > 0) {
                domainScores.set(domain, { count: matchCount, keywords: matchedKeywords });
            }
        }

        // Find domain with highest score
        if (domainScores.size === 0) {
            return {
                domain: 'unknown',
                confidence: 0,
                keywords: []
            };
        }

        let bestDomain: Domain = 'unknown';
        let bestScore = 0;
        let bestKeywords: string[] = [];

        for (const [domain, score] of domainScores.entries()) {
            if (score.count > bestScore) {
                bestScore = score.count;
                bestDomain = domain;
                bestKeywords = score.keywords;
            }
        }

        // Calculate confidence (normalized to 0-1)
        // Higher score = higher confidence, but cap at reasonable max
        const maxPossibleScore = this.domainKeywords.get(bestDomain)?.length || 1;
        const confidence = Math.min(bestScore / maxPossibleScore, 1.0);

        return {
            domain: bestDomain,
            confidence,
            keywords: bestKeywords
        };
    }

    /**
     * Classify multiple texts and return the most common domain.
     * Useful for documents with multiple sections.
     */
    classifyMultiple(texts: string[], url?: string): DomainClassificationResult {
        if (texts.length === 0) {
            return this.classify('', url);
        }

        const results = texts.map(text => this.classify(text, url));
        
        // Count domain occurrences
        const domainCounts = new Map<Domain, number>();
        const domainKeywords = new Map<Domain, Set<string>>();

        for (const result of results) {
            if (result.domain !== 'unknown') {
                domainCounts.set(result.domain, (domainCounts.get(result.domain) || 0) + 1);
                if (!domainKeywords.has(result.domain)) {
                    domainKeywords.set(result.domain, new Set());
                }
                result.keywords.forEach(kw => domainKeywords.get(result.domain)!.add(kw));
            }
        }

        if (domainCounts.size === 0) {
            return {
                domain: 'unknown',
                confidence: 0,
                keywords: []
            };
        }

        // Find most common domain
        let bestDomain: Domain = 'unknown';
        let bestCount = 0;

        for (const [domain, count] of domainCounts.entries()) {
            if (count > bestCount) {
                bestCount = count;
                bestDomain = domain;
            }
        }

        const confidence = bestCount / texts.length;
        const keywords = Array.from(domainKeywords.get(bestDomain) || []);

        return {
            domain: bestDomain,
            confidence,
            keywords
        };
    }

    /**
     * Get all available domains
     */
    getAvailableDomains(): Domain[] {
        return Array.from(this.domainKeywords.keys());
    }
}

