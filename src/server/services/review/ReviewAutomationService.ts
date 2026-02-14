import { getReviewTemplateModel, ReviewTemplateDocument } from '../../models/ReviewTemplate.js';
import { RuleEvaluator } from '../evaluation/RuleEvaluator.js';
import type { PolicyRule } from '../parsing/types/PolicyRule.js';

/**
 * Review automation rule interface.
 * Rules are used to automatically accept or reject candidates based on patterns.
 */
export interface ReviewAutomationRule {
    /** Unique identifier for the rule */
    id: string;
    /** Human-readable name */
    name: string;
    /** Optional description */
    description?: string;
    /** Priority order (lower = higher priority, checked first) */
    priority: number;
    /** Whether this rule is enabled */
    enabled: boolean;
    /** Pattern matching criteria */
    pattern: {
        /** URL patterns to auto-accept (contains check) */
        acceptUrlPatterns?: string[];
        /** URL patterns to auto-reject (contains check) */
        rejectUrlPatterns?: string[];
        /** Keywords in title to accept (case-insensitive contains) */
        acceptTitleKeywords?: string[];
        /** Keywords in title to reject (case-insensitive contains) */
        rejectTitleKeywords?: string[];
        /** Minimum relevance score to accept */
        minRelevanceScore?: number;
        /** Maximum relevance score to reject (below this threshold) */
        maxRelevanceScore?: number;
        /** Domain whitelist (exact match) */
        allowedDomains?: string[];
        /** Domain blacklist (exact match) */
        blockedDomains?: string[];
        /** Regex patterns for URL matching */
        acceptUrlRegex?: string[];
        /** Regex patterns for URL rejection */
        rejectUrlRegex?: string[];
    };
}

/**
 * Decision made by automation rule
 */
export interface AutomationDecision {
    /** Candidate ID */
    candidateId: string;
    /** Decision: accepted, rejected, or null if no decision */
    status: 'accepted' | 'rejected';
    /** Rule ID that made this decision */
    ruleId: string;
    /** Reason for the decision */
    reason: string;
}

/**
 * ReviewAutomationService provides automatic review decision-making
 * based on configurable rules and templates.
 * 
 * Features:
 * - Rule-based automation with priority ordering
 * - Integration with ReviewTemplate system
 * - Default/common rules for common patterns
 * - Flexible configuration via environment variables
 * 
 * @example
 * ```typescript
 * const automationService = new ReviewAutomationService();
 * const decisions = await automationService.applyAutomationRules(
 *   workflowId,
 *   moduleId,
 *   candidates
 * );
 * ```
 */
export class ReviewAutomationService {
    private defaultRules: ReviewAutomationRule[] = [];
    private ruleEvaluator?: RuleEvaluator;

    /**
     * @param ruleEvaluator Optional RuleEvaluator for evaluating PolicyRules if candidates have them in metadata.
     *                      Note: ReviewAutomationService primarily evaluates ReviewAutomationRules (workflow automation),
     *                      not PolicyRules (extracted policy rules). RuleEvaluator is provided for potential future use
     *                      if candidates include policy rules that need evaluation.
     */
    constructor(ruleEvaluator?: RuleEvaluator) {
        this.ruleEvaluator = ruleEvaluator;
        this.initializeDefaultRules();
    }

    /**
     * Initialize default/common rules that are always available
     */
    private initializeDefaultRules(): void {
        this.defaultRules = [
            {
                id: 'default-reject-invalid-urls',
                name: 'Reject Invalid URLs',
                description: 'Reject candidates with invalid or missing URLs',
                priority: 1,
                enabled: true,
                pattern: {
                    rejectUrlRegex: ['^$', '^https?://$'],
                }
            },
            {
                id: 'default-reject-spam-keywords',
                name: 'Reject Spam Keywords',
                description: 'Reject candidates with common spam indicators in title',
                priority: 2,
                enabled: true,
                pattern: {
                    rejectTitleKeywords: [
                        'click here',
                        'buy now',
                        'limited offer',
                        'act now',
                        'free money',
                        'winner',
                        'congratulations',
                        'prize',
                        'lottery',
                    ]
                }
            },
            {
                id: 'default-accept-high-relevance',
                name: 'Accept High Relevance',
                description: 'Auto-accept candidates with relevance score above 0.8',
                priority: 5,
                enabled: true,
                pattern: {
                    minRelevanceScore: 0.8
                }
            },
            {
                id: 'default-reject-low-relevance',
                name: 'Reject Low Relevance',
                description: 'Reject candidates with relevance score below 0.3',
                priority: 10,
                enabled: true,
                pattern: {
                    maxRelevanceScore: 0.3
                }
            }
        ];
    }

    /**
     * Get all default rules
     */
    getDefaultRules(): ReviewAutomationRule[] {
        return [...this.defaultRules];
    }

    /**
     * Apply automation rules to candidates and return decisions.
     * 
     * Rules are applied in priority order (lower priority = checked first).
     * Once a rule matches a candidate, that candidate is not evaluated by subsequent rules.
     * 
     * @param workflowId - Workflow ID (for template lookup)
     * @param moduleId - Module ID (for template lookup)
     * @param candidates - Array of candidates to evaluate
     * @returns Array of automation decisions (only for candidates with matches)
     */
    async applyAutomationRules(
        workflowId: string,
        moduleId: string,
        candidates: Array<{ id: string; title: string; url: string; metadata?: Record<string, unknown> }>
    ): Promise<AutomationDecision[]> {
        const decisions: AutomationDecision[] = [];
        const processedCandidateIds = new Set<string>();

        // Get enabled default rules sorted by priority
        const enabledDefaultRules = this.defaultRules
            .filter(rule => rule.enabled)
            .sort((a, b) => a.priority - b.priority);

        // Try to load templates for this workflow/module
        let templates: ReviewTemplateDocument[] = [];
        try {
            const templateModel = getReviewTemplateModel();
            templates = await templateModel.getTemplatesByWorkflow(workflowId, moduleId);
            // Also get public templates
            const publicTemplates = await templateModel.getPublicTemplates(20);
            templates = [...templates, ...publicTemplates];
        } catch (error) {
            // If template loading fails, continue with default rules only
            console.warn('[ReviewAutomationService] Failed to load templates:', error);
        }

        // Combine default rules with templates (templates get lower priority)
        const allRules: Array<{ rule: ReviewAutomationRule; source: 'default' | 'template'; templateId?: string }> = [
            ...enabledDefaultRules.map(rule => ({ rule, source: 'default' as const })),
            ...templates.map(template => ({
                rule: this.templateToRule(template),
                source: 'template' as const,
                templateId: template._id?.toString()
            }))
        ];

        // Sort all rules by priority
        allRules.sort((a, b) => a.rule.priority - b.rule.priority);

        // Apply rules to each candidate
        for (const candidate of candidates) {
            // Skip if already processed
            if (processedCandidateIds.has(candidate.id)) {
                continue;
            }

            // Try each rule in priority order
            for (const { rule, source, templateId } of allRules) {
                if (!rule.enabled) {
                    continue;
                }

                const decision = this.evaluateRule(rule, candidate);
                if (decision) {
                    decisions.push({
                        candidateId: candidate.id,
                        status: decision.status,
                        ruleId: source === 'template' && templateId ? templateId : rule.id,
                        reason: decision.reason
                    });
                    processedCandidateIds.add(candidate.id);
                    break; // First matching rule wins, don't check other rules
                }
            }
        }

        return decisions;
    }

    /**
     * Convert a ReviewTemplate to a ReviewAutomationRule
     */
    private templateToRule(template: ReviewTemplateDocument): ReviewAutomationRule {
        return {
            id: `template-${template._id?.toString()}`,
            name: template.name,
            description: template.description,
            priority: 100, // Templates have lower priority than default rules
            enabled: true,
            pattern: template.pattern
        };
    }

    /**
     * Evaluate a single rule against a candidate.
     * Returns a decision if the rule matches, null otherwise.
     */
    private evaluateRule(
        rule: ReviewAutomationRule,
        candidate: { id: string; title: string; url: string; metadata?: Record<string, unknown> }
    ): { status: 'accepted' | 'rejected'; reason: string } | null {
        const pattern = rule.pattern;

        // Check reject patterns first (rejection takes precedence)
        if (pattern.rejectUrlPatterns) {
            for (const patternStr of pattern.rejectUrlPatterns) {
                if (candidate.url.includes(patternStr)) {
                    return {
                        status: 'rejected',
                        reason: `URL matches reject pattern: ${patternStr}`
                    };
                }
            }
        }

        if (pattern.rejectUrlRegex) {
            for (const regexStr of pattern.rejectUrlRegex) {
                try {
                    const regex = new RegExp(regexStr);
                    if (regex.test(candidate.url)) {
                        return {
                            status: 'rejected',
                            reason: `URL matches reject regex: ${regexStr}`
                        };
                    }
                } catch (error) {
                    console.warn(`[ReviewAutomationService] Invalid regex pattern: ${regexStr}`, error);
                }
            }
        }

        if (pattern.blockedDomains) {
            try {
                const url = new URL(candidate.url);
                const domain = url.hostname.replace(/^www\./, '');
                if (pattern.blockedDomains.includes(domain)) {
                    return {
                        status: 'rejected',
                        reason: `Domain is blocked: ${domain}`
                    };
                }
            } catch (_e) {
                // Invalid URL, skip domain check
            }
        }

        if (pattern.rejectTitleKeywords) {
            const titleLower = candidate.title.toLowerCase();
            for (const keyword of pattern.rejectTitleKeywords) {
                if (titleLower.includes(keyword.toLowerCase())) {
                    return {
                        status: 'rejected',
                        reason: `Title contains reject keyword: ${keyword}`
                    };
                }
            }
        }

        // Check accept patterns
        if (pattern.acceptUrlPatterns) {
            for (const patternStr of pattern.acceptUrlPatterns) {
                if (candidate.url.includes(patternStr)) {
                    return {
                        status: 'accepted',
                        reason: `URL matches accept pattern: ${patternStr}`
                    };
                }
            }
        }

        if (pattern.acceptUrlRegex) {
            for (const regexStr of pattern.acceptUrlRegex) {
                try {
                    const regex = new RegExp(regexStr);
                    if (regex.test(candidate.url)) {
                        return {
                            status: 'accepted',
                            reason: `URL matches accept regex: ${regexStr}`
                        };
                    }
                } catch (error) {
                    console.warn(`[ReviewAutomationService] Invalid regex pattern: ${regexStr}`, error);
                }
            }
        }

        if (pattern.allowedDomains) {
            try {
                const url = new URL(candidate.url);
                const domain = url.hostname.replace(/^www\./, '');
                if (pattern.allowedDomains.includes(domain)) {
                    return {
                        status: 'accepted',
                        reason: `Domain is allowed: ${domain}`
                    };
                }
            } catch (_e) {
                // Invalid URL, skip domain check
            }
        }

        if (pattern.acceptTitleKeywords) {
            const titleLower = candidate.title.toLowerCase();
            for (const keyword of pattern.acceptTitleKeywords) {
                if (titleLower.includes(keyword.toLowerCase())) {
                    return {
                        status: 'accepted',
                        reason: `Title contains accept keyword: ${keyword}`
                    };
                }
            }
        }

        // Check relevance score
        const relevanceScore = candidate.metadata?.relevanceScore as number | undefined;
        if (relevanceScore !== undefined) {
            if (pattern.maxRelevanceScore !== undefined && relevanceScore < pattern.maxRelevanceScore) {
                return {
                    status: 'rejected',
                    reason: `Relevance score (${relevanceScore}) below maximum threshold (${pattern.maxRelevanceScore})`
                };
            }
            if (pattern.minRelevanceScore !== undefined && relevanceScore >= pattern.minRelevanceScore) {
                return {
                    status: 'accepted',
                    reason: `Relevance score (${relevanceScore}) meets minimum (${pattern.minRelevanceScore})`
                };
            }
        }

        // Optional: If candidate has policy rules in metadata and RuleEvaluator is available,
        // we could evaluate them here. For now, this is a placeholder for future functionality.
        // Note: ReviewAutomationService primarily evaluates ReviewAutomationRules (workflow automation),
        // not PolicyRules (extracted policy rules). This section is for potential future use.
        if (this.ruleEvaluator && candidate.metadata?.policyRules) {
            const policyRules = candidate.metadata.policyRules as PolicyRule[];
            // Future: Could use RuleEvaluator to evaluate policy rules if needed
            // For now, we keep the existing ReviewAutomationRule evaluation logic
        }

        return null; // No match
    }
}

// Singleton instance
let automationServiceInstance: ReviewAutomationService | null = null;

/**
 * Get the singleton ReviewAutomationService instance
 */
export function getReviewAutomationService(): ReviewAutomationService {
    if (!automationServiceInstance) {
        automationServiceInstance = new ReviewAutomationService();
    }
    return automationServiceInstance;
}

