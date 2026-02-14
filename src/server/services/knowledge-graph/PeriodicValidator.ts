import { KnowledgeGraphService } from './core/KnowledgeGraph.js';
import { ConsistencyViolation } from './validators/ConsistencyChecker.js';
import { FactValidationResult } from './validators/FactValidator.js';
import { BaseEntity, Relation } from '../../domain/ontology.js';
import { logger } from '../../utils/logger.js';

export interface PeriodicValidationResult {
    timestamp: string;
    consistency: {
        violations: ConsistencyViolation[];
        summary: {
            totalViolations: number;
            errors: number;
            warnings: number;
            byType: Record<string, number>;
        };
    };
    facts: {
        validated: number;
        lowConfidence: number;
        averageConfidence: number;
    };
    duration: number;
}

/**
 * Service for running periodic validation checks on the knowledge graph.
 * Can be scheduled to run automatically or called on-demand.
 */
export class PeriodicValidator {
    constructor(private kgService: KnowledgeGraphService) {}

    /**
     * Run a full validation check
     */
    async runValidation(): Promise<PeriodicValidationResult> {
        const startTime = Date.now();

        // 1. Consistency check
        const violations = await this.kgService.checkConsistency();
        const summary = await this.kgService.getConsistencySummary();

        // 2. Fact validation (sample relationships)
        // For performance, we validate a sample of relationships
        const snapshot = await this.kgService.getGraphSnapshot(1000); // Limit to 1000 relationships
        const factResults: FactValidationResult[] = [];
        
        for (const edge of snapshot.edges.slice(0, 100)) { // Validate first 100 relationships
            const fact = await this.kgService.validateFact(edge);
            factResults.push(fact);
        }

        const averageConfidence =
            factResults.length > 0
                ? factResults.reduce((sum, r) => sum + r.confidence, 0) / factResults.length
                : 0;
        const lowConfidence = factResults.filter((r) => r.confidence < 0.7).length;

        const duration = Date.now() - startTime;

        return {
            timestamp: new Date().toISOString(),
            consistency: {
                violations,
                summary,
            },
            facts: {
                validated: factResults.length,
                lowConfidence,
                averageConfidence,
            },
            duration,
        };
    }

    /**
     * Run validation and log results
     */
    async runAndLog(): Promise<PeriodicValidationResult> {
        logger.info('Starting periodic validation check');
        const result = await this.runValidation();

        logger.info({
            duration: result.duration,
            consistencyViolations: result.consistency.summary.totalViolations,
            consistencyErrors: result.consistency.summary.errors,
            consistencyWarnings: result.consistency.summary.warnings,
            factsValidated: result.facts.validated,
            lowConfidenceFacts: result.facts.lowConfidence,
            averageConfidence: result.facts.averageConfidence,
        }, 'Periodic validation results');

        // Log critical errors
        const criticalErrors = result.consistency.violations.filter((v) => v.severity === 'error');
        if (criticalErrors.length > 0) {
            logger.warn({
                criticalErrorCount: criticalErrors.length,
                errors: criticalErrors.slice(0, 10).map((v) => ({
                    type: v.type,
                    description: v.description,
                    entities: v.entities,
                })),
            }, 'Critical errors found in periodic validation');
        }

        return result;
    }

    /**
     * Run validation and create human validation tasks for issues found
     */
    async runAndCreateTasks(): Promise<{
        validationResult: PeriodicValidationResult;
        tasksCreated: number;
    }> {
        const result = await this.runValidation();

        // Create tasks for consistency violations
        const entitiesToReview: BaseEntity[] = [];
        const relationsToReview: Relation[] = [];

        // Extract entities from violations
        for (const violation of result.consistency.violations) {
            for (const entityId of violation.entities) {
                const entity = await this.kgService.getNode(entityId);
                if (entity && !entitiesToReview.find((e) => e.id === entity.id)) {
                    entitiesToReview.push(entity);
                }
            }
        }

        // Create validation tasks
        const tasks = await this.kgService.createValidationTasks(entitiesToReview, relationsToReview);

        return {
            validationResult: result,
            tasksCreated: tasks.length,
        };
    }
}

