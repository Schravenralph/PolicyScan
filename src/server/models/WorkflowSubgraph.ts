import { getDB } from '../config/database.js';
import { ObjectId, type Filter } from 'mongodb';
import { WorkflowSubgraph } from '../services/infrastructure/types.js';

const COLLECTION_NAME = 'workflow_subgraphs';

export interface WorkflowSubgraphDocument extends WorkflowSubgraph {
    _id?: ObjectId;
}

export interface WorkflowSubgraphCreateInput {
    name: string;
    description?: string;
    workflowId?: string;
    runId?: string;
    queryId?: string;
    includedNodes?: string[];
    excludedNodes?: string[];
    rootUrl?: string;
    maxDepth?: number;
}

export class WorkflowSubgraphModel {
    /**
     * Create a new workflow subgraph
     */
    static async create(input: WorkflowSubgraphCreateInput): Promise<WorkflowSubgraphDocument> {
        const db = getDB();
        const now = new Date();
        const _id = new ObjectId();

        const subgraph: WorkflowSubgraphDocument = {
            _id,
            id: _id.toString(), // Ensure id matches _id
            name: input.name,
            description: input.description,
            workflowId: input.workflowId,
            runId: input.runId,
            queryId: input.queryId,
            createdAt: now,
            updatedAt: now,
            status: 'draft',
            includedNodes: input.includedNodes || [],
            excludedNodes: input.excludedNodes || [],
            approvedEndpoints: [],
            rejectedEndpoints: [],
            metadata: {
                totalNodes: input.includedNodes?.length || 0,
                totalEndpoints: 0,
                approvedCount: 0,
                rejectedCount: 0,
                pendingCount: 0,
                rootUrl: input.rootUrl,
                maxDepth: input.maxDepth
            }
        };

        await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).insertOne(subgraph);
        return subgraph;
    }

    /**
     * Find a subgraph by ID
     */
    static async findById(id: string): Promise<WorkflowSubgraphDocument | null> {
        const db = getDB();
        const collection = db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME);

        if (ObjectId.isValid(id)) {
             // Try by _id OR id field to be robust
             const doc = await collection.findOne({
                 $or: [
                     { _id: new ObjectId(id) },
                     { id: id }
                 ]
             });
             if (doc) return doc;
        }

        // Fallback to id field only
        return await collection.findOne({ id });
    }

    /**
     * Find subgraphs by workflow ID
     */
    static async findByWorkflowId(workflowId: string): Promise<WorkflowSubgraphDocument[]> {
        const db = getDB();
        
        // Limit to prevent memory exhaustion when loading subgraphs
        // Default limit: 1000 subgraphs, configurable via environment variable
        const MAX_WORKFLOW_SUBGRAPHS = parseInt(process.env.MAX_WORKFLOW_SUBGRAPHS || '1000', 10);
        
        const subgraphs = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME)
            .find({ workflowId })
            .sort({ createdAt: -1 })
            .limit(MAX_WORKFLOW_SUBGRAPHS)
            .toArray();
        
        if (subgraphs.length === MAX_WORKFLOW_SUBGRAPHS) {
            console.warn(
                `[WorkflowSubgraph] findByWorkflowId() query may have been truncated at ${MAX_WORKFLOW_SUBGRAPHS} entries. ` +
                `Consider increasing MAX_WORKFLOW_SUBGRAPHS.`
            );
        }
        
        return subgraphs;
    }

    /**
     * Find subgraphs by query ID
     */
    static async findByQueryId(queryId: string): Promise<WorkflowSubgraphDocument[]> {
        const db = getDB();
        
        // Limit to prevent memory exhaustion when loading subgraphs
        // Default limit: 1000 subgraphs, configurable via environment variable
        const MAX_WORKFLOW_SUBGRAPHS = parseInt(process.env.MAX_WORKFLOW_SUBGRAPHS || '1000', 10);
        
        const subgraphs = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME)
            .find({ queryId })
            .sort({ createdAt: -1 })
            .limit(MAX_WORKFLOW_SUBGRAPHS)
            .toArray();
        
        if (subgraphs.length === MAX_WORKFLOW_SUBGRAPHS) {
            console.warn(
                `[WorkflowSubgraph] findByQueryId() query may have been truncated at ${MAX_WORKFLOW_SUBGRAPHS} entries. ` +
                `Consider increasing MAX_WORKFLOW_SUBGRAPHS.`
            );
        }
        
        return subgraphs;
    }

    /**
     * Find all active subgraphs
     */
    static async findActive(): Promise<WorkflowSubgraphDocument[]> {
        const db = getDB();
        
        // Limit to prevent memory exhaustion when loading active subgraphs
        // Default limit: 1000 subgraphs, configurable via environment variable
        const MAX_WORKFLOW_SUBGRAPHS = parseInt(process.env.MAX_WORKFLOW_SUBGRAPHS || '1000', 10);
        
        const subgraphs = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME)
            .find({ status: 'active' })
            .sort({ updatedAt: -1 })
            .limit(MAX_WORKFLOW_SUBGRAPHS)
            .toArray();
        
        if (subgraphs.length === MAX_WORKFLOW_SUBGRAPHS) {
            console.warn(
                `[WorkflowSubgraph] findActive() query may have been truncated at ${MAX_WORKFLOW_SUBGRAPHS} entries. ` +
                `Consider increasing MAX_WORKFLOW_SUBGRAPHS.`
            );
        }
        
        return subgraphs;
    }

    /**
     * Get the "current" active subgraph (the most recently updated active one)
     */
    static async getCurrent(): Promise<WorkflowSubgraphDocument | null> {
        const db = getDB();
        return await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME)
            .findOne({ status: 'active' }, { sort: { updatedAt: -1 } });
    }

    /**
     * Update a subgraph
     */
    static async update(id: string, update: Partial<WorkflowSubgraphDocument>): Promise<WorkflowSubgraphDocument | null> {
        const db = getDB();

        // Try to update by _id OR id
        const filter = ObjectId.isValid(id) 
            ? { $or: [{ _id: new ObjectId(id) }, { id: id }] }
            : { id };

        const result = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).findOneAndUpdate(
            filter,
            {
                $set: {
                    ...update,
                    updatedAt: new Date()
                }
            },
            { returnDocument: 'after' }
        );

        return result || null;
    }

    /**
     * Add nodes to the subgraph
     */
    static async addNodes(id: string, urls: string[]): Promise<WorkflowSubgraphDocument | null> {
        const db = getDB();
        const filter = ObjectId.isValid(id) 
            ? { $or: [{ _id: new ObjectId(id) }, { id: id }] }
            : { id };

        const result = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).findOneAndUpdate(
            filter,
            {
                $addToSet: { includedNodes: { $each: urls } },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        );

        // Update metadata
        if (result) {
            await this.updateMetadata(id);
        }

        return result || null;
    }

    /**
     * Remove nodes from the subgraph (add to excluded)
     */
    static async excludeNodes(id: string, urls: string[]): Promise<WorkflowSubgraphDocument | null> {
        const db = getDB();
        const filter = ObjectId.isValid(id) 
            ? { $or: [{ _id: new ObjectId(id) }, { id: id }] }
            : { id };

        const result = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).findOneAndUpdate(
            filter,
            {
                $pull: { includedNodes: { $in: urls } },
                $addToSet: { excludedNodes: { $each: urls } },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        );

        if (result) {
            await this.updateMetadata(id);
        }

        return result || null;
    }

    /**
     * Approve an endpoint
     */
    static async approveEndpoint(
        id: string,
        endpoint: { url: string; title: string; type: string },
        userId?: string
    ): Promise<WorkflowSubgraphDocument | null> {
        const db = getDB();
        const filter = ObjectId.isValid(id) 
            ? { $or: [{ _id: new ObjectId(id) }, { id: id }] }
            : { id };

        // First remove from rejected if present
        await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).updateOne(
            filter,
            { $pull: { rejectedEndpoints: { url: endpoint.url } } }
        );

        const result = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).findOneAndUpdate(
            filter,
            {
                $push: {
                    approvedEndpoints: {
                        url: endpoint.url,
                        title: endpoint.title,
                        type: endpoint.type,
                        approvedAt: new Date(),
                        approvedBy: userId
                    }
                },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        );

        if (result) {
            await this.updateMetadata(id);
        }

        return result || null;
    }

    /**
     * Reject an endpoint
     */
    static async rejectEndpoint(
        id: string,
        endpoint: { url: string; title: string },
        reason?: string,
        userId?: string
    ): Promise<WorkflowSubgraphDocument | null> {
        const db = getDB();
        const filter = ObjectId.isValid(id) 
            ? { $or: [{ _id: new ObjectId(id) }, { id: id }] }
            : { id };

        // First remove from approved if present
        await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).updateOne(
            filter,
            { $pull: { approvedEndpoints: { url: endpoint.url } } }
        );

        const result = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).findOneAndUpdate(
            filter,
            {
                $push: {
                    rejectedEndpoints: {
                        url: endpoint.url,
                        title: endpoint.title,
                        reason,
                        rejectedAt: new Date(),
                        rejectedBy: userId
                    }
                },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        );

        if (result) {
            await this.updateMetadata(id);
        }

        return result || null;
    }

    /**
     * Reset endpoint status (back to pending)
     */
    static async resetEndpoint(id: string, url: string): Promise<WorkflowSubgraphDocument | null> {
        const db = getDB();
        const filter = ObjectId.isValid(id) 
            ? { $or: [{ _id: new ObjectId(id) }, { id: id }] }
            : { id };

        const result = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).findOneAndUpdate(
            filter,
            {
                $pull: {
                    approvedEndpoints: { url },
                    rejectedEndpoints: { url }
                },
                $set: { updatedAt: new Date() }
            },
            { returnDocument: 'after' }
        );

        if (result) {
            await this.updateMetadata(id);
        }

        return result || null;
    }

    /**
     * Set status (activate, archive, etc.)
     */
    static async setStatus(id: string, status: 'active' | 'archived' | 'draft'): Promise<WorkflowSubgraphDocument | null> {
        return await this.update(id, { status });
    }

    /**
     * Update metadata counts
     */
    private static async updateMetadata(id: string): Promise<void> {
        const db = getDB();
        const filter = ObjectId.isValid(id) 
            ? { $or: [{ _id: new ObjectId(id) }, { id: id }] }
            : { id };

        const subgraph = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).findOne(filter);
        if (!subgraph) return;

        const metadata = {
            totalNodes: subgraph.includedNodes.length,
            totalEndpoints: subgraph.approvedEndpoints.length + subgraph.rejectedEndpoints.length,
            approvedCount: subgraph.approvedEndpoints.length,
            rejectedCount: subgraph.rejectedEndpoints.length,
            pendingCount: subgraph.includedNodes.length - subgraph.approvedEndpoints.length - subgraph.rejectedEndpoints.length,
            rootUrl: subgraph.metadata.rootUrl,
            maxDepth: subgraph.metadata.maxDepth
        };

        await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).updateOne(
            filter,
            { $set: { metadata } }
        );
    }

    /**
     * Delete a subgraph
     */
    static async delete(id: string): Promise<boolean> {
        const db = getDB();
        const filter = ObjectId.isValid(id) 
            ? { $or: [{ _id: new ObjectId(id) }, { id: id }] }
            : { id };

        const result = await db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).deleteOne(filter);
        return result.deletedCount > 0;
    }

    /**
     * List all subgraphs with pagination
     */
    static async list(options: { limit?: number; skip?: number; status?: WorkflowSubgraphDocument['status'] } = {}): Promise<{
        subgraphs: WorkflowSubgraphDocument[];
        total: number;
    }> {
        const db = getDB();
        const { limit = 20, skip = 0, status } = options;

        const filter: Filter<WorkflowSubgraphDocument> = {};
        if (status) {
            filter.status = status;
        }

        const [subgraphs, total] = await Promise.all([
            db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME)
                .find(filter)
                .sort({ updatedAt: -1 })
                .skip(skip)
                .limit(limit)
                .toArray(),
            db.collection<WorkflowSubgraphDocument>(COLLECTION_NAME).countDocuments(filter)
        ]);

        return { subgraphs, total };
    }
}
