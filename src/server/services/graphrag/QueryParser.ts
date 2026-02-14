/**
 * Query Parser for Fact-First Retrieval
 * Parses natural language queries to identify query type and extract key information
 */

import { EntityType, RelationType } from '../../domain/ontology.js';

export enum QueryType {
    FACT = 'fact',           // Direct factual questions ("What is the building height limit in Amsterdam?")
    ENTITY = 'entity',       // Entity queries ("Find all policy documents about housing in Amsterdam")
    RELATIONSHIP = 'relationship' // Relationship queries ("What regulations relate to this policy document?")
}

export interface ParsedQuery {
    type: QueryType;
    keywords: string[];
    entityTypes?: EntityType[];
    relationTypes?: RelationType[];
    location?: string;
    topic?: string;
    originalQuery: string;
}

/**
 * Query Parser that identifies query type and extracts key information from natural language queries
 */
export class QueryParser {
    // Keywords that indicate fact queries
    private factKeywords = ['what', 'wat', 'hoeveel', 'how much', 'how many', 'when', 'wanneer', 'where', 'waar'];
    
    // Keywords that indicate entity queries
    private entityKeywords = ['find', 'zoek', 'list', 'lijst', 'show', 'toon', 'get', 'haal', 'all', 'alle'];
    
    // Keywords that indicate relationship queries
    private relationshipKeywords = ['relate', 'relateert', 'connect', 'verbind', 'link', 'koppel', 'related', 'gerelateerd', 'associate', 'geassocieerd'];
    
    // Location indicators
    private locationKeywords = ['in', 'van', 'uit', 'voor', 'gemeente', 'provincie', 'municipality', 'province'];
    
    // Entity type patterns
    private entityTypePatterns: Record<string, EntityType[]> = {
        'policy document': ['PolicyDocument'],
        'beleidsdocument': ['PolicyDocument'],
        'regulation': ['Regulation'],
        'regelgeving': ['Regulation'],
        'verordening': ['Regulation'],
        'requirement': ['Requirement'],
        'vereiste': ['Requirement'],
        'spatial unit': ['SpatialUnit'],
        'ruimtelijke eenheid': ['SpatialUnit'],
        'land use': ['LandUse'],
        'bestemming': ['LandUse']
    };

    /**
     * Parse a natural language query
     */
    parse(query: string): ParsedQuery {
        const normalizedQuery = query.toLowerCase().trim();
        const words = normalizedQuery.split(/\s+/);
        
        // Determine query type
        const queryType = this.identifyQueryType(normalizedQuery);
        
        // Extract keywords (remove stop words)
        const keywords = this.extractKeywords(words);
        
        // Extract entity types
        const entityTypes = this.extractEntityTypes(normalizedQuery);
        
        // Extract relation types (if mentioned)
        const relationTypes = this.extractRelationTypes(normalizedQuery);
        
        // Extract location
        const location = this.extractLocation(normalizedQuery, words);
        
        // Extract topic
        const topic = this.extractTopic(normalizedQuery, words);
        
        return {
            type: queryType,
            keywords,
            entityTypes: entityTypes.length > 0 ? entityTypes : undefined,
            relationTypes: relationTypes.length > 0 ? relationTypes : undefined,
            location,
            topic,
            originalQuery: query
        };
    }

    /**
     * Identify the query type based on keywords
     */
    private identifyQueryType(query: string): QueryType {
        // Check for relationship keywords first (most specific)
        if (this.relationshipKeywords.some(keyword => query.includes(keyword))) {
            return QueryType.RELATIONSHIP;
        }
        
        // Check for entity keywords
        if (this.entityKeywords.some(keyword => query.includes(keyword))) {
            return QueryType.ENTITY;
        }
        
        // Check for fact keywords
        if (this.factKeywords.some(keyword => query.includes(keyword))) {
            return QueryType.FACT;
        }
        
        // Default to entity query if no clear indicator
        return QueryType.ENTITY;
    }

    /**
     * Extract keywords from query (remove stop words)
     */
    private extractKeywords(words: string[]): string[] {
        const stopWords = new Set([
            'the', 'de', 'het', 'een', 'a', 'an', 'is', 'zijn', 'are', 'was', 'were',
            'what', 'wat', 'where', 'waar', 'when', 'wanneer', 'how', 'hoe',
            'find', 'zoek', 'get', 'haal', 'show', 'toon', 'all', 'alle',
            'in', 'on', 'at', 'van', 'voor', 'uit', 'met', 'with',
            'and', 'en', 'or', 'of', 'but', 'maar', 'to', 'te', 'naar'
        ]);
        
        return words
            .filter(word => word.length > 2 && !stopWords.has(word))
            .map(word => word.replace(/[^\w\s]/g, ''))
            .filter(word => word.length > 0);
    }

    /**
     * Extract entity types from query
     */
    private extractEntityTypes(query: string): EntityType[] {
        const foundTypes: EntityType[] = [];
        
        for (const [pattern, types] of Object.entries(this.entityTypePatterns)) {
            if (query.includes(pattern)) {
                foundTypes.push(...types);
            }
        }
        
        return [...new Set(foundTypes)]; // Remove duplicates
    }

    /**
     * Extract relation types from query
     */
    private extractRelationTypes(query: string): RelationType[] {
        const foundTypes: RelationType[] = [];
        
        // Map keywords to relation types
        const relationPatterns: Record<string, RelationType> = {
            'applies': RelationType.APPLIES_TO,
            'van toepassing': RelationType.APPLIES_TO,
            'constrains': RelationType.CONSTRAINS,
            'beperkt': RelationType.CONSTRAINS,
            'defined in': RelationType.DEFINED_IN,
            'gedefinieerd in': RelationType.DEFINED_IN,
            'overrides': RelationType.OVERRIDES,
            'overschrijft': RelationType.OVERRIDES,
            'located in': RelationType.LOCATED_IN,
            'gelegen in': RelationType.LOCATED_IN,
            'has requirement': RelationType.HAS_REQUIREMENT,
            'heeft vereiste': RelationType.HAS_REQUIREMENT
        };
        
        for (const [pattern, type] of Object.entries(relationPatterns)) {
            if (query.includes(pattern)) {
                foundTypes.push(type);
            }
        }
        
        return [...new Set(foundTypes)]; // Remove duplicates
    }

    /**
     * Extract location from query
     */
    private extractLocation(query: string, words: string[]): string | undefined {
        // Look for location keywords followed by a capitalized word (likely a location name)
        for (let i = 0; i < words.length - 1; i++) {
            if (this.locationKeywords.includes(words[i])) {
                // Next word might be the location
                const potentialLocation = words[i + 1];
                if (potentialLocation && potentialLocation.length > 2) {
                    return potentialLocation;
                }
            }
        }
        
        // Also check for common Dutch municipality/province patterns
        const municipalityMatch = query.match(/(gemeente|provincie|waterschap)\s+([a-z]+)/i);
        if (municipalityMatch) {
            return municipalityMatch[2];
        }
        
        return undefined;
    }

    /**
     * Extract topic from query
     */
    private extractTopic(_query: string, words: string[]): string | undefined {
        // Common topic keywords
        const topicKeywords = ['about', 'over', 'voor', 'thema', 'theme', 'onderwerp', 'topic'];
        
        for (let i = 0; i < words.length - 1; i++) {
            if (topicKeywords.includes(words[i])) {
                // Next few words might be the topic
                const topicWords = words.slice(i + 1, i + 4).join(' ');
                if (topicWords.length > 2) {
                    return topicWords;
                }
            }
        }
        
        return undefined;
    }
}

