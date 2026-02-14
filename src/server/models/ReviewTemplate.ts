import { getDB } from '../config/database.js';
import { ObjectId, Collection, Filter, UpdateFilter } from 'mongodb';
import { BadRequestError } from '../types/errors.js';

export interface ReviewTemplateDocument {
    _id?: ObjectId;
    name: string;
    description?: string;
    workflowId?: string;
    moduleId?: string;
    createdBy: ObjectId;
    createdAt: Date;
    updatedAt: Date;
    isPublic: boolean;
    // Template pattern: which candidates to accept/reject based on criteria
    pattern: {
        // URL patterns to auto-accept
        acceptUrlPatterns?: string[];
        // URL patterns to auto-reject
        rejectUrlPatterns?: string[];
        // Keywords in title to accept
        acceptTitleKeywords?: string[];
        // Keywords in title to reject
        rejectTitleKeywords?: string[];
        // Minimum relevance score to accept
        minRelevanceScore?: number;
        // Domain whitelist
        allowedDomains?: string[];
        // Domain blacklist
        blockedDomains?: string[];
    };
    // Usage statistics
    usageCount: number;
    lastUsedAt?: Date;
}

export interface ReviewTemplateCreateInput {
    name: string;
    description?: string;
    workflowId?: string;
    moduleId?: string;
    createdBy: string;
    isPublic?: boolean;
    pattern: ReviewTemplateDocument['pattern'];
}

/**
 * Model for managing review templates in MongoDB.
 * 
 * Review templates allow users to save common review patterns and apply them
 * to new reviews, speeding up the review process.
 */
export class ReviewTemplateModel {
    private collection: Collection<ReviewTemplateDocument>;

    constructor() {
        const db = getDB();
        this.collection = db.collection<ReviewTemplateDocument>('reviewTemplates');
        this.ensureIndexes().catch(err => {
            console.warn('Failed to create reviewTemplates indexes:', err);
        });
    }

    private async ensureIndexes(): Promise<void> {
        try {
            await this.collection.createIndex({ createdBy: 1, createdAt: -1 });
            await this.collection.createIndex({ workflowId: 1, moduleId: 1 });
            await this.collection.createIndex({ isPublic: 1, usageCount: -1 });
        } catch (error) {
            if (error instanceof Error && !error.message.includes('already exists')) {
                throw error;
            }
        }
    }

    async createTemplate(input: ReviewTemplateCreateInput): Promise<ReviewTemplateDocument> {
        if (!input.name || typeof input.name !== 'string' || input.name.trim() === '') {
            throw new BadRequestError('Template name is required');
        }
        if (!input.createdBy || typeof input.createdBy !== 'string') {
            throw new BadRequestError('createdBy is required');
        }
        if (!ObjectId.isValid(input.createdBy)) {
            throw new BadRequestError('Invalid createdBy ObjectId format');
        }

        const template: ReviewTemplateDocument = {
            name: input.name.trim(),
            description: input.description?.trim(),
            workflowId: input.workflowId,
            moduleId: input.moduleId,
            createdBy: new ObjectId(input.createdBy),
            createdAt: new Date(),
            updatedAt: new Date(),
            isPublic: input.isPublic ?? false,
            pattern: input.pattern || {},
            usageCount: 0
        };

        const result = await this.collection.insertOne(template);
        return { ...template, _id: result.insertedId };
    }

    async getTemplateById(templateId: string): Promise<ReviewTemplateDocument | null> {
        if (!ObjectId.isValid(templateId)) {
            throw new Error('Invalid templateId format');
        }
        return this.collection.findOne({ _id: new ObjectId(templateId) });
    }

    async getTemplatesByUser(userId: string, includePublic: boolean = true): Promise<ReviewTemplateDocument[]> {
        if (!ObjectId.isValid(userId)) {
            throw new Error('Invalid userId format');
        }

        const query: Filter<ReviewTemplateDocument> = includePublic
            ? {
                $or: [
                    { createdBy: new ObjectId(userId) },
                    { isPublic: true }
                ]
            }
            : { createdBy: new ObjectId(userId) };

        // Limit to prevent memory exhaustion when loading templates
        // Default limit: 1000 templates, configurable via environment variable
        const MAX_REVIEW_TEMPLATES = parseInt(process.env.MAX_REVIEW_TEMPLATES || '1000', 10);
        
        const templates = await this.collection
            .find(query)
            .sort({ updatedAt: -1 })
            .limit(MAX_REVIEW_TEMPLATES)
            .toArray();
        
        if (templates.length === MAX_REVIEW_TEMPLATES) {
            console.warn(
                `[ReviewTemplate] getTemplatesByUser() query may have been truncated at ${MAX_REVIEW_TEMPLATES} entries. ` +
                `Consider increasing MAX_REVIEW_TEMPLATES.`
            );
        }
        
        return templates;
    }

    async getTemplatesByWorkflow(workflowId: string, moduleId?: string): Promise<ReviewTemplateDocument[]> {
        const query: Filter<ReviewTemplateDocument> = moduleId
            ? { workflowId, moduleId }
            : { workflowId };
        
        // Limit to prevent memory exhaustion when loading templates
        // Default limit: 1000 templates, configurable via environment variable
        const MAX_REVIEW_TEMPLATES = parseInt(process.env.MAX_REVIEW_TEMPLATES || '1000', 10);
        
        const templates = await this.collection
            .find(query)
            .sort({ usageCount: -1, updatedAt: -1 })
            .limit(MAX_REVIEW_TEMPLATES)
            .toArray();
        
        if (templates.length === MAX_REVIEW_TEMPLATES) {
            console.warn(
                `[ReviewTemplate] getTemplatesByWorkflow() query may have been truncated at ${MAX_REVIEW_TEMPLATES} entries. ` +
                `Consider increasing MAX_REVIEW_TEMPLATES.`
            );
        }
        
        return templates;
    }

    async getPublicTemplates(limit: number = 20): Promise<ReviewTemplateDocument[]> {
        return this.collection
            .find({ isPublic: true })
            .sort({ usageCount: -1, updatedAt: -1 })
            .limit(limit)
            .toArray();
    }

    async updateTemplate(
        templateId: string,
        updates: Partial<Omit<ReviewTemplateDocument, '_id' | 'createdBy' | 'createdAt' | 'usageCount'>>
    ): Promise<ReviewTemplateDocument | null> {
        if (!ObjectId.isValid(templateId)) {
            throw new Error('Invalid templateId format');
        }

        const updateDoc: UpdateFilter<ReviewTemplateDocument> = {
            $set: {
                ...updates,
                updatedAt: new Date()
            }
        };

        const filter: Filter<ReviewTemplateDocument> = { _id: new ObjectId(templateId) };
        const result = await this.collection.findOneAndUpdate(
            filter,
            updateDoc,
            { returnDocument: 'after' }
        );

        return result || null;
    }

    async incrementUsage(templateId: string): Promise<void> {
        if (!ObjectId.isValid(templateId)) {
            throw new Error('Invalid templateId format');
        }

        const filter: Filter<ReviewTemplateDocument> = { _id: new ObjectId(templateId) };
        const updateFilter: UpdateFilter<ReviewTemplateDocument> = {
            $inc: { usageCount: 1 },
            $set: { lastUsedAt: new Date() }
        };
        await this.collection.updateOne(
            filter,
            updateFilter
        );
    }

    async deleteTemplate(templateId: string): Promise<boolean> {
        if (!ObjectId.isValid(templateId)) {
            throw new Error('Invalid templateId format');
        }

        const result = await this.collection.deleteOne({ _id: new ObjectId(templateId) });
        return result.deletedCount > 0;
    }

    /**
     * Apply a template pattern to candidate results.
     * Returns decisions (accept/reject) for each candidate based on the template pattern.
     */
    applyTemplateToCandidates(
        template: ReviewTemplateDocument,
        candidates: Array<{ id: string; title: string; url: string; metadata?: Record<string, unknown> }>
    ): Array<{ candidateId: string; status: 'accepted' | 'rejected'; reason?: string }> {
        const decisions: Array<{ candidateId: string; status: 'accepted' | 'rejected'; reason?: string }> = [];
        const pattern = template.pattern;

        for (const candidate of candidates) {
            let decision: 'accepted' | 'rejected' | null = null;
            let reason: string | undefined;

            // Check URL patterns
            if (pattern.rejectUrlPatterns) {
                for (const patternStr of pattern.rejectUrlPatterns) {
                    if (candidate.url.includes(patternStr)) {
                        decision = 'rejected';
                        reason = `URL matches reject pattern: ${patternStr}`;
                        break;
                    }
                }
            }

            if (decision === null && pattern.acceptUrlPatterns) {
                for (const patternStr of pattern.acceptUrlPatterns) {
                    if (candidate.url.includes(patternStr)) {
                        decision = 'accepted';
                        reason = `URL matches accept pattern: ${patternStr}`;
                        break;
                    }
                }
            }

            // Check domain whitelist/blacklist
            if (decision === null) {
                try {
                    const url = new URL(candidate.url);
                    const domain = url.hostname.replace(/^www\./, '');

                    if (pattern.blockedDomains && pattern.blockedDomains.includes(domain)) {
                        decision = 'rejected';
                        reason = `Domain is blocked: ${domain}`;
                    } else if (pattern.allowedDomains && !pattern.allowedDomains.includes(domain)) {
                        decision = 'rejected';
                        reason = `Domain not in whitelist: ${domain}`;
                    } else if (pattern.allowedDomains && pattern.allowedDomains.includes(domain)) {
                        decision = 'accepted';
                        reason = `Domain is allowed: ${domain}`;
                    }
                } catch (_e) {
                    // Invalid URL, skip domain check
                }
            }

            // Check title keywords
            if (decision === null && pattern.rejectTitleKeywords) {
                const titleLower = candidate.title.toLowerCase();
                for (const keyword of pattern.rejectTitleKeywords) {
                    if (titleLower.includes(keyword.toLowerCase())) {
                        decision = 'rejected';
                        reason = `Title contains reject keyword: ${keyword}`;
                        break;
                    }
                }
            }

            if (decision === null && pattern.acceptTitleKeywords) {
                const titleLower = candidate.title.toLowerCase();
                for (const keyword of pattern.acceptTitleKeywords) {
                    if (titleLower.includes(keyword.toLowerCase())) {
                        decision = 'accepted';
                        reason = `Title contains accept keyword: ${keyword}`;
                        break;
                    }
                }
            }

            // Check relevance score
            if (decision === null && pattern.minRelevanceScore !== undefined) {
                const relevanceScore = candidate.metadata?.relevanceScore as number | undefined;
                if (relevanceScore !== undefined) {
                    if (relevanceScore >= pattern.minRelevanceScore) {
                        decision = 'accepted';
                        reason = `Relevance score (${relevanceScore}) meets minimum (${pattern.minRelevanceScore})`;
                    } else {
                        decision = 'rejected';
                        reason = `Relevance score (${relevanceScore}) below minimum (${pattern.minRelevanceScore})`;
                    }
                }
            }

            // If no pattern matched, leave as pending (don't add to decisions)
            if (decision !== null) {
                decisions.push({ candidateId: candidate.id, status: decision, reason });
            }
        }

        return decisions;
    }
}

// Singleton instance
let templateModelInstance: ReviewTemplateModel | null = null;

export function getReviewTemplateModel(): ReviewTemplateModel {
    if (!templateModelInstance) {
        templateModelInstance = new ReviewTemplateModel();
    }
    return templateModelInstance;
}

