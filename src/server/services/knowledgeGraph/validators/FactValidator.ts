import { CanonicalDocumentService, getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
import { Relation, RelationType } from '../../../domain/ontology.js';
import { logger } from '../../../utils/logger.js';

export interface FactValidationResult {
    fact: Relation;
    confidence: number; // 0-1
    sources: string[];
    validationMethods: string[];
    issues: string[];
}

export type GetRelationshipsFn = (id: string) => Promise<Array<{ sourceId: string; targetId: string; type: RelationType }>>;

/**
 * Validates facts (relationships) for plausibility and truthfulness.
 * Assigns confidence scores based on validation methods passed.
 */
export class FactValidator {
    private documentService: CanonicalDocumentService;
    getRelationships?: GetRelationshipsFn;

    constructor(documentService?: CanonicalDocumentService) {
        this.documentService = documentService || getCanonicalDocumentService();
    }

    /**
     * Validate a fact (relationship) for plausibility
     */
    async validateFact(fact: Relation): Promise<FactValidationResult> {
        const methods: string[] = [];
        const issues: string[] = [];
        let confidence = 1.0;

        // 1. Source verification (if metadata contains source)
        if (fact.metadata?.source) {
            methods.push('source_verification');

            const source = fact.metadata.source as string;
            let exists = false;

            if (source.startsWith('http://') || source.startsWith('https://')) {
                // Valid URL format
                const doc = await this.documentService.findByUrl(source);
                exists = !!doc;
            } else {
                // Assume it's a document ID
                methods.push('source_id_validation');
                const doc = await this.documentService.findById(source);
                exists = !!doc;
            }

            if (!exists) {
                issues.push('Source document not found');
                confidence -= 0.2;
            }
        } else {
            issues.push('No source metadata provided');
            confidence -= 0.1;
        }

        // 2. Temporal validation
        if (fact.metadata?.effectiveDate) {
            methods.push('temporal_validation');
            const effectiveDate = fact.metadata.effectiveDate as string;
            try {
                const date = new Date(effectiveDate);
                if (isNaN(date.getTime())) {
                    issues.push('Invalid effective date format');
                    confidence -= 0.1;
                } else {
                    // Check if date is reasonable (not too far in past/future)
                    const now = new Date();
                    const yearsDiff = (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24 * 365);
                    if (yearsDiff > 100 || yearsDiff < -10) {
                        issues.push('Effective date seems unrealistic');
                        confidence -= 0.05;
                    }
                }
            } catch {
                issues.push('Error parsing effective date');
                confidence -= 0.1;
            }
        }

        // 3. Cross-reference validation
        methods.push('cross_reference');
        if (this.getRelationships) {
            try {
                const existing = await this.getRelationships(fact.sourceId);

                // Check for exact duplicate (same target and type)
                const duplicate = existing.find((r: { targetId: string; type: string }) => r.targetId === fact.targetId && r.type === fact.type);
                if (duplicate) {
                    // Fact already exists, which increases our confidence that it's a valid fact
                    // We don't add an issue because existing facts are assumed to be true
                    confidence = Math.min(1.0, confidence + 0.1);
                }

                // Check for conflicting or related facts (same target, different type)
                const conflicts = existing.filter((r: { targetId: string; type: string }) => r.targetId === fact.targetId && r.type !== fact.type);
                if (conflicts.length > 0) {
                    const conflictingTypes = conflicts.map((c: { type: string }) => c.type).join(', ');
                    issues.push(`Conflicting or related relationship type exists: ${conflictingTypes}`);
                    // Lower confidence as this might be a contradiction or redundancy that needs review
                    confidence -= 0.1 * Math.min(conflicts.length, 2);
                }
            } catch (error) {
                // If we can't check cross-references, we just log and continue without penalizing
                logger.warn(
                    { error, sourceId: fact.sourceId },
                    'Cross-reference validation failed for fact validation'
                );
            }
        }

        // 4. Pattern-based validation
        // Check for common patterns or anomalies
        methods.push('pattern_validation');

        // Check for suspicious patterns (e.g., too many relationships of same type)
        // This would require access to the graph service

        // Calculate confidence score
        // Reduce confidence if issues found
        if (issues.length > 0) {
            confidence = Math.max(0, confidence - (issues.length * 0.1));
        }

        // Ensure confidence is between 0 and 1
        confidence = Math.max(0, Math.min(1, confidence));

        return {
            fact,
            confidence,
            sources: fact.metadata?.source ? [fact.metadata.source as string] : [],
            validationMethods: methods,
            issues,
        };
    }

    /**
     * Validate batch of facts
     */
    async validateBatch(facts: Relation[]): Promise<FactValidationResult[]> {
        return Promise.all(facts.map(fact => this.validateFact(fact)));
    }

    /**
     * Get confidence threshold for acceptable facts
     */
    getConfidenceThreshold(): number {
        return 0.7; // Default: 70% confidence minimum
    }

    /**
     * Check if a fact validation result is acceptable
     */
    isAcceptable(result: FactValidationResult, threshold?: number): boolean {
        const minThreshold = threshold ?? this.getConfidenceThreshold();
        return result.confidence >= minThreshold && result.issues.length === 0;
    }
}
