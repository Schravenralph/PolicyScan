import { KnowledgeGraphService } from '../knowledge-graph/core/KnowledgeGraph.js';
import { ConsistencyViolation } from './validators/ConsistencyChecker.js';
import { FactValidationResult } from './validators/FactValidator.js';
import { BaseEntity, Relation } from '../../domain/ontology.js';

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
        console.log('[Periodic Validation] Starting validation check...');
        const result = await this.runValidation();

        console.log('[Periodic Validation] Results:');
        console.log(`  - Duration: ${result.duration}ms`);
        console.log(`  - Consistency violations: ${result.consistency.summary.totalViolations} (${result.consistency.summary.errors} errors, ${result.consistency.summary.warnings} warnings)`);
        console.log(`  - Facts validated: ${result.facts.validated}`);
        console.log(`  - Low confidence facts: ${result.facts.lowConfidence}`);
        console.log(`  - Average confidence: ${result.facts.averageConfidence.toFixed(2)}`);

        // Log critical errors
        const criticalErrors = result.consistency.violations.filter((v) => v.severity === 'error');
        if (criticalErrors.length > 0) {
            console.warn(`[Periodic Validation] ⚠️  ${criticalErrors.length} critical errors found:`);
            criticalErrors.slice(0, 10).forEach((violation) => {
                console.warn(`  - ${violation.type}: ${violation.description}`);
            });
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

