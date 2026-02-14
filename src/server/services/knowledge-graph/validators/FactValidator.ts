import { Relation, RelationType } from '../../../domain/ontology.js';
import { CanonicalDocumentService, getCanonicalDocumentService } from '../../canonical/CanonicalDocumentService.js';
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
    constructor(
        private readonly documentService: CanonicalDocumentService = getCanonicalDocumentService(),
        private readonly getRelationships?: GetRelationshipsFn,
        private readonly getIncomingRelationships?: GetRelationshipsFn
    ) {}

    /**
     * Validate a fact (relationship) for plausibility
     */
    async validateFact(fact: Relation): Promise<FactValidationResult> {
        const methods: string[] = [];
        const issues: string[] = [];
        let confidence = 1.0;

        // 1. Source verification (if metadata contains source)
        if (fact.metadata?.source !== undefined && fact.metadata?.source !== null) {
            methods.push('source_verification');

            // Validate source format (must be a string) - check this FIRST before any operations
            const sourceType = typeof fact.metadata.source;
            if (sourceType !== 'string') {
                // Source is not a string - flag as invalid format
                issues.push('Invalid source format');
                confidence -= 0.2;
                // Early return from this validation step - don't proceed with document lookup
                // Skip the else block entirely for non-string sources
            } else {
                // Source is confirmed to be a string - safe to proceed with validation
                const source = fact.metadata.source as string;
                try {
                    let documentExists = false;

                    if (source.startsWith('http://') || source.startsWith('https://')) {
                        // Valid URL format - check if it exists in canonical documents
                        const document = await this.documentService.findByUrl(source);
                        documentExists = !!document;
                    } else {
                        // Assume it's a document ID
                        methods.push('source_id_validation');
                        const document = await this.documentService.findById(source);
                        documentExists = !!document;
                    }

                    if (!documentExists) {
                        issues.push('[i18n:workflowLogs.sourceDocumentNotFound]');
                        confidence -= 0.2;
                    }
                } catch (_error) {
                    // Only add this error if we haven't already flagged invalid format
                    // This catch block should only execute for string sources that fail validation
                    if (!issues.includes('Invalid source format')) {
                        issues.push('Error verifying source document');
                        confidence -= 0.1;
                    }
                }
            }
        } else {
            issues.push('No source metadata provided');
            confidence -= 0.1;
        }

        // 2. Temporal validation
        if (fact.metadata?.effectiveDate) {
            methods.push('temporal_validation');
            const effectiveDate = fact.metadata.effectiveDate;
            
            // Validate effectiveDate is a string before processing
            if (typeof effectiveDate !== 'string') {
                issues.push('Invalid effective date format (must be string)');
                confidence -= 0.1;
            } else {
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
                } catch (_error) {
                    issues.push('Error parsing effective date');
                    confidence -= 0.1;
                }
            }
        }

        // 3. Cross-reference validation
        methods.push('cross_reference');
        if (this.getRelationships) {
            try {
                const existing = await this.getRelationships(fact.sourceId);

                // Check for exact duplicate (same target and type)
                const duplicate = existing.find(r => r.targetId === fact.targetId && r.type === fact.type);
                if (duplicate) {
                    // Fact already exists, which increases our confidence that it's a valid fact
                    // We don't add an issue because existing facts are assumed to be true
                    confidence = Math.min(1.0, confidence + 0.1);
                }

                // Check for conflicting or related facts (same target, different type)
                const conflicts = existing.filter(r => r.targetId === fact.targetId && r.type !== fact.type);
                if (conflicts.length > 0) {
                    const conflictingTypes = conflicts.map(c => c.type).join(', ');
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
        if (this.getRelationships) {
            try {
                const existing = await this.getRelationships(fact.sourceId);
                
                // Count relationships of the same type
                const sameTypeCount = existing.filter(r => r.type === fact.type).length;
                
                // Flag if source has too many relationships of the same type (potential spam or error)
                // Threshold: more than 10 relationships of the same type is suspicious
                if (sameTypeCount > 10) {
                    issues.push(`Source entity has ${sameTypeCount + 1} relationships of type ${fact.type} (suspicious pattern)`);
                    confidence -= 0.05; // Small penalty for suspicious patterns
                }
                
                // Check for unusual relationship patterns (e.g., entity with only one type of relationship)
                const uniqueTypes = new Set(existing.map(r => r.type));
                if (uniqueTypes.size === 1 && existing.length > 5) {
                    issues.push(`Source entity has only one relationship type (${Array.from(uniqueTypes)[0]}) - may indicate incomplete data`);
                    confidence -= 0.03; // Small penalty for incomplete patterns
                }
            } catch (error) {
                // If we can't check patterns, just log and continue without penalizing
                logger.debug(
                    { error, sourceId: fact.sourceId },
                    'Pattern-based validation failed for fact validation'
                );
            }
        }

        // Note: Confidence has already been adjusted for each individual issue above.
        // We don't apply an additional penalty based on issues.length to avoid double-penalization.
        // The individual penalties (0.1, 0.2, etc.) are sufficient.

        // Ensure confidence is between 0 and 1
        confidence = Math.max(0, Math.min(1, confidence));

        return {
            fact,
            confidence,
            sources: fact.metadata?.source && typeof fact.metadata.source === 'string' 
                ? [fact.metadata.source] 
                : [],
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
