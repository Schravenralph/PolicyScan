/**
 * Enhanced Conflict Reporter
 * 
 * Provides detailed, actionable conflict reports with:
 * - Specific property differences with before/after values
 * - Impact analysis (which nodes are affected)
 * - Suggested resolutions
 * - Severity levels
 * - Conflict categorization
 */

import { GraphConflict } from '../scraperGraph/ScraperGraphVersioning.js';
import type { NavigationNode } from '../graphs/navigation/NavigationGraph.js';

export interface PropertyDiff {
    property: string;
    parentValue: unknown;
    childValue: unknown;
    type: 'added' | 'removed' | 'modified' | 'unchanged';
}

export interface EnhancedConflict {
    nodeUrl: string;
    conflictType: 'property' | 'children' | 'both';
    severity: 'low' | 'medium' | 'high' | 'critical';
    category: string;
    propertyDiffs: PropertyDiff[];
    childrenDiff?: {
        added: string[];
        removed: string[];
        common: string[];
    };
    parentNode: NavigationNode;
    childNode: NavigationNode;
    impact: {
        affectedNodes: string[];
        affectedScrapers?: string[];
        description: string;
    };
    suggestedResolutions: Array<{
        strategy: 'parent' | 'child' | 'merge' | 'custom';
        description: string;
        confidence: 'low' | 'medium' | 'high';
        steps: string[];
    }>;
    resolution?: {
        strategy: string;
        resolvedValue: NavigationNode;
        timestamp: string;
    };
}

export interface ConflictReport {
    totalConflicts: number;
    bySeverity: {
        critical: number;
        high: number;
        medium: number;
        low: number;
    };
    byType: {
        property: number;
        children: number;
        both: number;
    };
    byCategory: Map<string, number>;
    conflicts: EnhancedConflict[];
    summary: string;
}

/**
 * Service for generating enhanced conflict reports
 */
export class ConflictReporter {
    /**
     * Enhance a basic conflict with detailed information
     */
    enhanceConflict(conflict: GraphConflict): EnhancedConflict {
        const propertyDiffs = this.computePropertyDiffs(conflict.parentValue, conflict.childValue);
        const childrenDiff = this.computeChildrenDiff(conflict.parentValue, conflict.childValue);
        const severity = this.computeSeverity(conflict, propertyDiffs, childrenDiff);
        const category = this.categorizeConflict(conflict, propertyDiffs);
        const impact = this.analyzeImpact(conflict);
        const suggestedResolutions = this.suggestResolutions(conflict, propertyDiffs, childrenDiff);

        return {
            nodeUrl: conflict.nodeUrl,
            conflictType: conflict.conflictType,
            severity,
            category,
            propertyDiffs,
            childrenDiff,
            parentNode: conflict.parentValue,
            childNode: conflict.childValue,
            impact,
            suggestedResolutions,
            resolution: conflict.resolution ? {
                strategy: conflict.resolution,
                resolvedValue: conflict.resolvedValue!,
                timestamp: new Date().toISOString()
            } : undefined
        };
    }

    /**
     * Generate a comprehensive conflict report
     */
    generateReport(conflicts: GraphConflict[]): ConflictReport {
        const enhanced = conflicts.map(c => this.enhanceConflict(c));

        const bySeverity = {
            critical: enhanced.filter(c => c.severity === 'critical').length,
            high: enhanced.filter(c => c.severity === 'high').length,
            medium: enhanced.filter(c => c.severity === 'medium').length,
            low: enhanced.filter(c => c.severity === 'low').length
        };

        const byType = {
            property: enhanced.filter(c => c.conflictType === 'property').length,
            children: enhanced.filter(c => c.conflictType === 'children').length,
            both: enhanced.filter(c => c.conflictType === 'both').length
        };

        const byCategory = new Map<string, number>();
        for (const conflict of enhanced) {
            const count = byCategory.get(conflict.category) || 0;
            byCategory.set(conflict.category, count + 1);
        }

        const summary = this.generateSummary(enhanced, bySeverity, byType);

        return {
            totalConflicts: conflicts.length,
            bySeverity,
            byType,
            byCategory,
            conflicts: enhanced,
            summary
        };
    }

    /**
     * Compute property differences between parent and child nodes
     */
    private computePropertyDiffs(parent: NavigationNode, child: NavigationNode): PropertyDiff[] {
        const diffs: PropertyDiff[] = [];
        const allKeys = new Set([
            ...Object.keys(parent),
            ...Object.keys(child)
        ]);

        for (const key of allKeys) {
            // Skip children array - handled separately
            if (key === 'children') continue;

            const parentVal = (parent as unknown as Record<string, unknown>)[key];
            const childVal = (child as unknown as Record<string, unknown>)[key];

            if (parentVal === undefined && childVal !== undefined) {
                diffs.push({
                    property: key,
                    parentValue: undefined,
                    childValue: childVal,
                    type: 'added'
                });
            } else if (parentVal !== undefined && childVal === undefined) {
                diffs.push({
                    property: key,
                    parentValue: parentVal,
                    childValue: undefined,
                    type: 'removed'
                });
            } else if (parentVal !== childVal) {
                diffs.push({
                    property: key,
                    parentValue: parentVal,
                    childValue: childVal,
                    type: 'modified'
                });
            } else {
                diffs.push({
                    property: key,
                    parentValue: parentVal,
                    childValue: childVal,
                    type: 'unchanged'
                });
            }
        }

        return diffs.filter(d => d.type !== 'unchanged');
    }

    /**
     * Compute children array differences
     */
    private computeChildrenDiff(parent: NavigationNode, child: NavigationNode): {
        added: string[];
        removed: string[];
        common: string[];
    } | undefined {
        const parentChildren = new Set(parent.children || []);
        const childChildren = new Set(child.children || []);

        const added = [...childChildren].filter(c => !parentChildren.has(c));
        const removed = [...parentChildren].filter(c => !childChildren.has(c));
        const common = [...parentChildren].filter(c => childChildren.has(c));

        if (added.length === 0 && removed.length === 0) {
            return undefined;
        }

        return { added, removed, common };
    }

    /**
     * Compute conflict severity
     */
    private computeSeverity(
        conflict: GraphConflict,
        propertyDiffs: PropertyDiff[],
        childrenDiff?: { added: string[]; removed: string[]; common: string[] }
    ): 'low' | 'medium' | 'high' | 'critical' {
        // Critical: URL mismatch (should never happen)
        if (conflict.parentValue.url !== conflict.childValue.url) {
            return 'critical';
        }

        // High: Type mismatch, major structural changes
        const hasTypeChange = propertyDiffs.some(d => d.property === 'type');
        const hasMajorChildrenChange = childrenDiff && 
            (childrenDiff.added.length > 5 || childrenDiff.removed.length > 5);

        if (hasTypeChange || hasMajorChildrenChange) {
            return 'high';
        }

        // Medium: Title or filePath changes, moderate children changes
        const hasTitleChange = propertyDiffs.some(d => d.property === 'title');
        const hasFilePathChange = propertyDiffs.some(d => d.property === 'filePath');
        const hasModerateChildrenChange = childrenDiff && 
            (childrenDiff.added.length > 0 || childrenDiff.removed.length > 0);

        if (hasTitleChange || hasFilePathChange || hasModerateChildrenChange) {
            return 'medium';
        }

        // Low: Metadata changes (xpaths, content, etc.)
        return 'low';
    }

    /**
     * Categorize conflict for easier grouping
     */
    private categorizeConflict(
        conflict: GraphConflict,
        propertyDiffs: PropertyDiff[]
    ): string {
        if (conflict.conflictType === 'children') {
            return 'structure';
        }

        if (propertyDiffs.some(d => d.property === 'type')) {
            return 'type';
        }

        if (propertyDiffs.some(d => d.property === 'title')) {
            return 'content';
        }

        if (propertyDiffs.some(d => d.property === 'filePath')) {
            return 'file';
        }

        if (propertyDiffs.some(d => d.property === 'xpaths')) {
            return 'navigation';
        }

        return 'metadata';
    }

    /**
     * Analyze impact of conflict
     */
    private analyzeImpact(conflict: GraphConflict): {
        affectedNodes: string[];
        affectedScrapers?: string[];
        description: string;
    } {
        const affectedNodes: string[] = [conflict.nodeUrl];

        // Add children to affected nodes
        if (conflict.parentValue.children) {
            affectedNodes.push(...conflict.parentValue.children);
        }
        if (conflict.childValue.children) {
            affectedNodes.push(...conflict.childValue.children);
        }

        // Remove duplicates
        const uniqueNodes = [...new Set(affectedNodes)];

        let description = '';
        if (conflict.conflictType === 'children') {
            description = `Structural change affects ${uniqueNodes.length} nodes in the graph hierarchy`;
        } else if (conflict.conflictType === 'property') {
            description = `Property change affects node ${conflict.nodeUrl} and potentially its relationships`;
        } else {
            description = `Both property and structural changes affect ${uniqueNodes.length} nodes`;
        }

        return {
            affectedNodes: uniqueNodes,
            description
        };
    }

    /**
     * Suggest resolution strategies
     */
    private suggestResolutions(
        conflict: GraphConflict,
        propertyDiffs: PropertyDiff[],
        childrenDiff?: { added: string[]; removed: string[]; common: string[] }
    ): Array<{
        strategy: 'parent' | 'child' | 'merge' | 'custom';
        description: string;
        confidence: 'low' | 'medium' | 'high';
        steps: string[];
    }> {
        const suggestions: Array<{
            strategy: 'parent' | 'child' | 'merge' | 'custom';
            description: string;
            confidence: 'low' | 'medium' | 'high';
            steps: string[];
        }> = [];

        // Always suggest merge as default
        suggestions.push({
            strategy: 'merge',
            description: 'Intelligently merge both versions, combining properties and children',
            confidence: 'high',
            steps: [
                'Merge children arrays (union of both sets)',
                'Prefer child values for properties when present',
                'Combine xpaths from both versions',
                'Use most recent timestamp'
            ]
        });

        // Suggest parent if child has no significant changes
        if (propertyDiffs.length === 0 && childrenDiff && childrenDiff.added.length === 0) {
            suggestions.push({
                strategy: 'parent',
                description: 'Use parent version (child has no new changes)',
                confidence: 'high',
                steps: [
                    'Discard child changes',
                    'Use parent node as-is'
                ]
            });
        }

        // Suggest child if parent has no significant changes
        if (propertyDiffs.every(d => d.type === 'removed') && 
            childrenDiff && childrenDiff.removed.length === 0) {
            suggestions.push({
                strategy: 'child',
                description: 'Use child version (parent has no new changes)',
                confidence: 'medium',
                steps: [
                    'Discard parent changes',
                    'Use child node as-is'
                ]
            });
        }

        // Suggest custom resolution for complex conflicts
        if (conflict.conflictType === 'both' && propertyDiffs.length > 3) {
            suggestions.push({
                strategy: 'custom',
                description: 'Manual resolution recommended for complex conflicts',
                confidence: 'low',
                steps: [
                    'Review each property difference',
                    'Manually select which values to keep',
                    'Merge children arrays carefully',
                    'Test the resolved node'
                ]
            });
        }

        return suggestions;
    }

    /**
     * Generate human-readable summary
     */
    private generateSummary(
        enhanced: EnhancedConflict[],
        bySeverity: { critical: number; high: number; medium: number; low: number },
        byType: { property: number; children: number; both: number }
    ): string {
        const lines: string[] = [];

        lines.push(`Found ${enhanced.length} conflict(s) requiring attention.`);
        lines.push('');

        if (bySeverity.critical > 0) {
            lines.push(`⚠️  CRITICAL: ${bySeverity.critical} conflict(s) require immediate attention`);
        }
        if (bySeverity.high > 0) {
            lines.push(`🔴 HIGH: ${bySeverity.high} conflict(s) should be resolved soon`);
        }
        if (bySeverity.medium > 0) {
            lines.push(`🟡 MEDIUM: ${bySeverity.medium} conflict(s) may need review`);
        }
        if (bySeverity.low > 0) {
            lines.push(`🟢 LOW: ${bySeverity.low} conflict(s) are minor`);
        }

        lines.push('');
        lines.push('By type:');
        lines.push(`  - Property conflicts: ${byType.property}`);
        lines.push(`  - Children conflicts: ${byType.children}`);
        lines.push(`  - Both: ${byType.both}`);

        const unresolved = enhanced.filter(c => !c.resolution).length;
        if (unresolved > 0) {
            lines.push('');
            lines.push(`⚠️  ${unresolved} conflict(s) remain unresolved`);
        }

        return lines.join('\n');
    }

    /**
     * Format conflict report as markdown
     */
    formatAsMarkdown(report: ConflictReport): string {
        const lines: string[] = [];

        lines.push('# Conflict Report');
        lines.push('');
        lines.push(report.summary);
        lines.push('');

        // Group by severity
        const bySeverity = {
            critical: report.conflicts.filter(c => c.severity === 'critical'),
            high: report.conflicts.filter(c => c.severity === 'high'),
            medium: report.conflicts.filter(c => c.severity === 'medium'),
            low: report.conflicts.filter(c => c.severity === 'low')
        };

        for (const [severity, conflicts] of Object.entries(bySeverity)) {
            if (conflicts.length === 0) continue;

            lines.push(`## ${severity.toUpperCase()} Severity (${conflicts.length})`);
            lines.push('');

            for (const conflict of conflicts) {
                lines.push(`### ${conflict.nodeUrl}`);
                lines.push('');
                lines.push(`**Type:** ${conflict.conflictType} | **Category:** ${conflict.category}`);
                lines.push('');
                lines.push(`**Impact:** ${conflict.impact.description}`);
                lines.push('');

                if (conflict.propertyDiffs.length > 0) {
                    lines.push('**Property Differences:**');
                    lines.push('');
                    for (const diff of conflict.propertyDiffs) {
                        lines.push(`- \`${diff.property}\`:`);
                        lines.push(`  - Parent: ${this.formatValue(diff.parentValue)}`);
                        lines.push(`  - Child: ${this.formatValue(diff.childValue)}`);
                    }
                    lines.push('');
                }

                if (conflict.childrenDiff) {
                    lines.push('**Children Differences:**');
                    lines.push('');
                    if (conflict.childrenDiff.added.length > 0) {
                        lines.push(`- Added: ${conflict.childrenDiff.added.join(', ')}`);
                    }
                    if (conflict.childrenDiff.removed.length > 0) {
                        lines.push(`- Removed: ${conflict.childrenDiff.removed.join(', ')}`);
                    }
                    lines.push('');
                }

                if (conflict.suggestedResolutions.length > 0) {
                    lines.push('**Suggested Resolutions:**');
                    lines.push('');
                    for (const resolution of conflict.suggestedResolutions) {
                        lines.push(`- **${resolution.strategy.toUpperCase()}** (confidence: ${resolution.confidence}):`);
                        lines.push(`  ${resolution.description}`);
                        lines.push('  Steps:');
                        for (const step of resolution.steps) {
                            lines.push(`  - ${step}`);
                        }
                        lines.push('');
                    }
                }

                if (conflict.resolution) {
                    lines.push(`**Resolved:** Using ${conflict.resolution.strategy} strategy`);
                    lines.push('');
                }

                lines.push('---');
                lines.push('');
            }
        }

        return lines.join('\n');
    }

    /**
     * Format a value for display
     */
    private formatValue(value: unknown): string {
        if (value === undefined) return 'undefined';
        if (value === null) return 'null';
        if (typeof value === 'string') {
            if (value.length > 100) {
                return `"${value.substring(0, 100)}..."`;
            }
            return `"${value}"`;
        }
        if (Array.isArray(value)) {
            return `[${value.length} items]`;
        }
        if (typeof value === 'object') {
            return `{${Object.keys(value).length} properties}`;
        }
        return String(value);
    }
}

