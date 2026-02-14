import { BaseEntity } from '../../../domain/ontology.js';

/**
 * Configuration for field similarity calculation
 */
export interface FieldSimilarityConfig {
    /**
     * Weight for each field type (sum should be 1.0)
     */
    fieldWeights?: Record<string, number>;
    /**
     * Default weight for fields not specified in fieldWeights
     */
    defaultFieldWeight?: number;
    /**
     * Minimum similarity threshold for a field to contribute to overall similarity
     */
    minFieldSimilarity?: number;
}

/**
 * Service for calculating field similarity between entities.
 * Implements HERA algorithm's field similarity calculation using value similarity (sim_v).
 * Uses Jaccard similarity for set-based fields and string similarity for text fields.
 */
export class FieldSimilarityCalculator {
    private readonly config: Required<FieldSimilarityConfig>;

    constructor(config: FieldSimilarityConfig = {}) {
        // Default field weights (can be customized)
        const defaultFieldWeights: Record<string, number> = {
            name: 0.3,
            description: 0.2,
            jurisdiction: 0.2,
            date: 0.1,
            documentType: 0.1,
            uri: 0.1,
        };

        this.config = {
            fieldWeights: { ...defaultFieldWeights, ...config.fieldWeights },
            defaultFieldWeight: config.defaultFieldWeight ?? 0.05,
            minFieldSimilarity: config.minFieldSimilarity ?? 0.0,
        };

        // Normalize field weights to sum to 1.0
        this.normalizeWeights();
    }

    /**
     * Normalize field weights so they sum to 1.0
     */
    private normalizeWeights(): void {
        const totalWeight = Object.values(this.config.fieldWeights).reduce((sum, w) => sum + w, 0);
        if (totalWeight > 0) {
            for (const key of Object.keys(this.config.fieldWeights)) {
                this.config.fieldWeights[key] /= totalWeight;
            }
        }
    }

    /**
     * Calculate value similarity (sim_v) between two field values using Jaccard similarity.
     * For strings, tokenizes and compares sets of tokens.
     * For arrays, compares as sets.
     * For primitives, uses exact match or string similarity.
     */
    calculateValueSimilarity(value1: unknown, value2: unknown): number {
        // Handle null/undefined
        if (value1 == null && value2 == null) return 1.0;
        if (value1 == null || value2 == null) return 0.0;

        // Handle arrays
        if (Array.isArray(value1) && Array.isArray(value2)) {
            return this.jaccardSimilarity(value1, value2);
        }

        // Handle strings
        if (typeof value1 === 'string' && typeof value2 === 'string') {
            // Tokenize strings for better comparison
            const tokens1 = this.tokenize(value1);
            const tokens2 = this.tokenize(value2);
            return this.jaccardSimilarity(tokens1, tokens2);
        }

        // Handle numbers
        if (typeof value1 === 'number' && typeof value2 === 'number') {
            // For dates (as timestamps), use proximity
            if (value1 > 1000000000 && value2 > 1000000000) {
                // Likely timestamps, use proximity
                const diff = Math.abs(value1 - value2);
                const maxDiff = 365 * 24 * 60 * 60 * 1000; // 1 year in ms
                return Math.max(0, 1 - diff / maxDiff);
            }
            // Exact match for other numbers
            return value1 === value2 ? 1.0 : 0.0;
        }

        // Handle booleans
        if (typeof value1 === 'boolean' && typeof value2 === 'boolean') {
            return value1 === value2 ? 1.0 : 0.0;
        }

        // Handle objects (compare as JSON strings)
        if (typeof value1 === 'object' && typeof value2 === 'object') {
            try {
                const str1 = JSON.stringify(value1);
                const str2 = JSON.stringify(value2);
                return str1 === str2 ? 1.0 : 0.0;
            } catch {
                return 0.0;
            }
        }

        // Fallback: string comparison
        return String(value1) === String(value2) ? 1.0 : 0.0;
    }

    /**
     * Calculate Jaccard similarity between two sets/arrays
     * Jaccard = |A ∩ B| / |A ∪ B|
     */
    private jaccardSimilarity<T>(set1: T[], set2: T[]): number {
        if (set1.length === 0 && set2.length === 0) return 1.0;
        if (set1.length === 0 || set2.length === 0) return 0.0;

        // Convert to sets for intersection/union
        const set1Set = new Set(set1);
        const set2Set = new Set(set2);

        // Calculate intersection
        let intersection = 0;
        for (const item of set1Set) {
            if (set2Set.has(item)) {
                intersection++;
            }
        }

        // Calculate union
        const union = set1Set.size + set2Set.size - intersection;

        return union > 0 ? intersection / union : 0.0;
    }

    /**
     * Tokenize a string into words (normalized, lowercase)
     */
    private tokenize(str: string): string[] {
        return str
            .toLowerCase()
            .replace(/[^\w\s]/g, ' ') // Replace punctuation with spaces
            .split(/\s+/)
            .filter(token => token.length > 0);
    }

    /**
     * Calculate field similarity (sim_f) for a specific field between two entities.
     * sim_f = sim_v (value similarity) for the field
     */
    calculateFieldSimilarity(
        entity1: BaseEntity,
        entity2: BaseEntity,
        fieldName: string
    ): number {
        // Get field values
        const value1 = this.getFieldValue(entity1, fieldName);
        const value2 = this.getFieldValue(entity2, fieldName);

        // If both are missing, return 0 (not similar, but not penalized)
        if (value1 == null && value2 == null) {
            return 0.0; // Neutral for missing fields
        }

        // If one is missing, return lower similarity
        if (value1 == null || value2 == null) {
            return 0.0;
        }

        // Calculate value similarity
        return this.calculateValueSimilarity(value1, value2);
    }

    /**
     * Get field value from entity (supports nested metadata fields)
     */
    private getFieldValue(entity: BaseEntity, fieldName: string): unknown {
        // Direct field access
        if (fieldName in entity) {
            return (entity as any)[fieldName];
        }

        // Metadata field access
        if (entity.metadata && fieldName in entity.metadata) {
            return entity.metadata[fieldName];
        }

        // Nested metadata access (e.g., "metadata.jurisdiction")
        if (fieldName.startsWith('metadata.')) {
            const nestedField = fieldName.substring('metadata.'.length);
            return entity.metadata?.[nestedField];
        }

        return undefined;
    }

    /**
     * Calculate overall similarity between two entities using weighted field similarities.
     * This implements HERA's field similarity calculation:
     * sim_f(entity1, entity2) = Σ(weight_i * sim_v(field_i))
     */
    calculateEntitySimilarity(entity1: BaseEntity, entity2: BaseEntity): number {
        // Get all fields from both entities
        const allFields = new Set<string>();
        
        // Add direct entity fields
        for (const key of Object.keys(entity1)) {
            if (key !== 'id' && key !== 'type') {
                allFields.add(key);
            }
        }
        for (const key of Object.keys(entity2)) {
            if (key !== 'id' && key !== 'type') {
                allFields.add(key);
            }
        }

        // Add metadata fields
        if (entity1.metadata) {
            for (const key of Object.keys(entity1.metadata)) {
                allFields.add(`metadata.${key}`);
            }
        }
        if (entity2.metadata) {
            for (const key of Object.keys(entity2.metadata)) {
                allFields.add(`metadata.${key}`);
            }
        }

        // Calculate weighted similarity
        let totalSimilarity = 0.0;
        let totalWeight = 0.0;

        for (const field of allFields) {
            const fieldWeight = this.config.fieldWeights[field] ?? this.config.defaultFieldWeight;
            const fieldSimilarity = this.calculateFieldSimilarity(entity1, entity2, field);

            // Only include fields above minimum threshold
            if (fieldSimilarity >= this.config.minFieldSimilarity) {
                totalSimilarity += fieldWeight * fieldSimilarity;
                totalWeight += fieldWeight;
            }
        }

        // Normalize by total weight (handles cases where some fields are missing)
        return totalWeight > 0 ? totalSimilarity / totalWeight : 0.0;
    }

    /**
     * Get all fields from an entity (for debugging/analysis)
     */
    getEntityFields(entity: BaseEntity): string[] {
        const fields: string[] = [];
        
        for (const key of Object.keys(entity)) {
            if (key !== 'id' && key !== 'type') {
                fields.push(key);
            }
        }

        if (entity.metadata) {
            for (const key of Object.keys(entity.metadata)) {
                fields.push(`metadata.${key}`);
            }
        }

        return fields;
    }

    /**
     * Update configuration
     */
    updateConfig(config: Partial<FieldSimilarityConfig>): void {
        if (config.fieldWeights) {
            this.config.fieldWeights = { ...this.config.fieldWeights, ...config.fieldWeights };
            this.normalizeWeights();
        }
        if (config.defaultFieldWeight !== undefined) {
            this.config.defaultFieldWeight = config.defaultFieldWeight;
        }
        if (config.minFieldSimilarity !== undefined) {
            this.config.minFieldSimilarity = config.minFieldSimilarity;
        }
    }

    /**
     * Get current configuration
     */
    getConfig(): FieldSimilarityConfig {
        return { ...this.config };
    }
}











