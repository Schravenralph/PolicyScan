import { BaseEntity, Relation } from '../../../domain/ontology.js';

export interface ValidationTask {
    id: string;
    type: 'entity' | 'relationship' | 'batch';
    entity?: BaseEntity;
    relation?: Relation;
    priority: 'low' | 'medium' | 'high' | 'critical';
    reason: string;
    suggestedAction: 'approve' | 'reject' | 'modify' | 'review';
    assignedTo?: string;
    status: 'pending' | 'in_progress' | 'approved' | 'rejected' | 'modified';
    createdAt: string;
    updatedAt: string;
}

/**
 * Service for managing human validation tasks.
 * Creates tasks for entities/relationships that need human review.
 */
export class HumanValidationService {
    private tasks: Map<string, ValidationTask> = new Map();
    private taskCounter: number = 0;

    /**
     * Create validation tasks for entities/relationships that need human review
     */
    async createValidationTasks(
        entities: BaseEntity[],
        relations: Relation[]
    ): Promise<ValidationTask[]> {
        const tasks: ValidationTask[] = [];

        // High-priority tasks: duplicates with medium confidence
        // Critical tasks: contradictions or invalid relationships
        // Medium tasks: entities with incomplete data
        // Low tasks: edge cases or anomalies

        // Create tasks for entities
        for (const entity of entities) {
            // Check for incomplete data
            if (!entity.description || entity.description.length < 10) {
                tasks.push(
                    this.createTask({
                        type: 'entity',
                        entity,
                        priority: 'medium',
                        reason: 'Entity has incomplete or missing description',
                        suggestedAction: 'review',
                    })
                );
            }

            // Check for missing metadata in PolicyDocuments
            if (entity.type === 'PolicyDocument' && !(entity as any).jurisdiction) {
                tasks.push(
                    this.createTask({
                        type: 'entity',
                        entity,
                        priority: 'high',
                        reason: 'PolicyDocument missing required jurisdiction field',
                        suggestedAction: 'modify',
                    })
                );
            }
        }

        // Create tasks for relationships
        for (const relation of relations) {
            // Check for missing source metadata
            if (!relation.metadata?.source) {
                tasks.push(
                    this.createTask({
                        type: 'relationship',
                        relation,
                        priority: 'medium',
                        reason: 'Relationship missing source metadata',
                        suggestedAction: 'review',
                    })
                );
            }
        }

        // Store tasks
        for (const task of tasks) {
            this.tasks.set(task.id, task);
        }

        return tasks;
    }

    /**
     * Create a validation task
     */
    private createTask(data: {
        type: 'entity' | 'relationship' | 'batch';
        entity?: BaseEntity;
        relation?: Relation;
        priority: 'low' | 'medium' | 'high' | 'critical';
        reason: string;
        suggestedAction: 'approve' | 'reject' | 'modify' | 'review';
        assignedTo?: string;
    }): ValidationTask {
        const taskId = `task-${++this.taskCounter}-${Date.now()}`;
        const now = new Date().toISOString();

        return {
            id: taskId,
            type: data.type,
            entity: data.entity,
            relation: data.relation,
            priority: data.priority,
            reason: data.reason,
            suggestedAction: data.suggestedAction,
            assignedTo: data.assignedTo,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
        };
    }

    /**
     * Get pending validation tasks
     */
    async getPendingTasks(limit: number = 100): Promise<ValidationTask[]> {
        const pending = Array.from(this.tasks.values())
            .filter((task) => task.status === 'pending')
            .sort((a, b) => {
                // Sort by priority (critical > high > medium > low)
                const priorityOrder: Record<string, number> = {
                    critical: 4,
                    high: 3,
                    medium: 2,
                    low: 1,
                };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            })
            .slice(0, limit);

        return pending;
    }

    /**
     * Get tasks by priority
     */
    async getTasksByPriority(priority: 'low' | 'medium' | 'high' | 'critical'): Promise<ValidationTask[]> {
        return Array.from(this.tasks.values()).filter((task) => task.priority === priority);
    }

    /**
     * Get task by ID
     */
    async getTask(taskId: string): Promise<ValidationTask | undefined> {
        return this.tasks.get(taskId);
    }

    /**
     * Submit validation result
     */
    async submitValidation(
        taskId: string,
        action: 'approve' | 'reject' | 'modify',
        modifiedEntity?: BaseEntity,
        modifiedRelation?: Relation
    ): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        task.status = action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'modified';
        task.updatedAt = new Date().toISOString();

        if (action === 'modify' && modifiedEntity) {
            task.entity = modifiedEntity;
        }

        if (action === 'modify' && modifiedRelation) {
            task.relation = modifiedRelation;
        }

        this.tasks.set(taskId, task);
    }

    /**
     * Assign task to user
     */
    async assignTask(taskId: string, userId: string): Promise<void> {
        const task = this.tasks.get(taskId);
        if (!task) {
            throw new Error(`Task ${taskId} not found`);
        }

        task.assignedTo = userId;
        task.status = 'in_progress';
        task.updatedAt = new Date().toISOString();
        this.tasks.set(taskId, task);
    }

    /**
     * Get task statistics
     */
    async getTaskStatistics(): Promise<{
        total: number;
        pending: number;
        inProgress: number;
        approved: number;
        rejected: number;
        modified: number;
        byPriority: Record<string, number>;
    }> {
        const tasks = Array.from(this.tasks.values());
        const byPriority: Record<string, number> = {
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
        };

        for (const task of tasks) {
            byPriority[task.priority] = (byPriority[task.priority] || 0) + 1;
        }

        return {
            total: tasks.length,
            pending: tasks.filter((t) => t.status === 'pending').length,
            inProgress: tasks.filter((t) => t.status === 'in_progress').length,
            approved: tasks.filter((t) => t.status === 'approved').length,
            rejected: tasks.filter((t) => t.status === 'rejected').length,
            modified: tasks.filter((t) => t.status === 'modified').length,
            byPriority,
        };
    }

    /**
     * Clear all tasks (for testing/reset)
     */
    async clearAllTasks(): Promise<void> {
        this.tasks.clear();
        this.taskCounter = 0;
    }
}
