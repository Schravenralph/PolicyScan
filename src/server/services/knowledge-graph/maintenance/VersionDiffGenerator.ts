/**
 * Version Diff Generator
 * 
 * Generates diffs between entity versions, showing what changed between versions.
 */

import { BaseEntity } from '../../../domain/ontology.js';
import { EntityVersion } from './EntityVersioningService.js';

export interface VersionDiff {
    added: Array<{ field: string; value: unknown }>;
    removed: Array<{ field: string; value: unknown }>;
    modified: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    unchanged: Array<{ field: string; value: unknown }>;
}

export class VersionDiffGenerator {
    /**
     * Generate diff between two entity versions
     */
    generateDiff(version1: EntityVersion, version2: EntityVersion): VersionDiff {
        const diff: VersionDiff = {
            added: [],
            removed: [],
            modified: [],
            unchanged: []
        };

        const entity1 = version1.entity;
        const entity2 = version2.entity;

        // Compare all fields
        const allFields = new Set([
            ...Object.keys(entity1),
            ...Object.keys(entity2)
        ]);

        for (const field of allFields) {
            const val1 = (entity1 as unknown as Record<string, unknown>)[field];
            const val2 = (entity2 as unknown as Record<string, unknown>)[field];

            if (val1 === undefined && val2 !== undefined) {
                diff.added.push({ field, value: val2 });
            } else if (val1 !== undefined && val2 === undefined) {
                diff.removed.push({ field, value: val1 });
            } else if (JSON.stringify(val1) !== JSON.stringify(val2)) {
                diff.modified.push({ field, oldValue: val1, newValue: val2 });
            } else {
                diff.unchanged.push({ field, value: val1 });
            }
        }

        return diff;
    }

    /**
     * Generate diff between current entity and a version
     */
    generateDiffFromCurrent(currentEntity: BaseEntity, version: EntityVersion): VersionDiff {
        const currentVersion: EntityVersion = {
            versionId: 'current',
            entityId: currentEntity.id,
            versionNumber: 0,
            entity: currentEntity,
            timestamp: new Date().toISOString()
        };

        return this.generateDiff(currentVersion, version);
    }

    /**
     * Generate human-readable diff summary
     */
    generateDiffSummary(diff: VersionDiff): string {
        const lines: string[] = [];

        if (diff.added.length > 0) {
            lines.push(`Added (${diff.added.length}):`);
            diff.added.forEach(change => {
                lines.push(`  + ${change.field}: ${JSON.stringify(change.value)}`);
            });
        }

        if (diff.removed.length > 0) {
            lines.push(`Removed (${diff.removed.length}):`);
            diff.removed.forEach(change => {
                lines.push(`  - ${change.field}: ${JSON.stringify(change.value)}`);
            });
        }

        if (diff.modified.length > 0) {
            lines.push(`Modified (${diff.modified.length}):`);
            diff.modified.forEach(change => {
                lines.push(`  ~ ${change.field}: ${JSON.stringify(change.oldValue)} → ${JSON.stringify(change.newValue)}`);
            });
        }

        if (diff.unchanged.length > 0) {
            lines.push(`Unchanged (${diff.unchanged.length} fields)`);
        }

        return lines.join('\n');
    }

    /**
     * Get diff statistics
     */
    getDiffStats(diff: VersionDiff): {
        totalChanges: number;
        added: number;
        removed: number;
        modified: number;
        unchanged: number;
    } {
        return {
            totalChanges: diff.added.length + diff.removed.length + diff.modified.length,
            added: diff.added.length,
            removed: diff.removed.length,
            modified: diff.modified.length,
            unchanged: diff.unchanged.length
        };
    }
}

