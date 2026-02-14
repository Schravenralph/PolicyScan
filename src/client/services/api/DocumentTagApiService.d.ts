export interface DocumentTag {
    _id?: string;
    id: string;
    label: string;
    category?: 'theme' | 'documentType' | 'jurisdiction' | 'custom';
    color?: string;
    description?: string;
    userId?: string;
    usageCount?: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface DocumentTagCreateInput {
    id: string;
    label: string;
    category?: 'theme' | 'documentType' | 'jurisdiction' | 'custom';
    color?: string;
    description?: string;
}
export interface DocumentTagUpdateInput {
    label?: string;
    color?: string;
    description?: string;
}
declare class DocumentTagApiService {
    private baseUrl;
    /**
     * Get all tags, optionally filtered by category or userId
     */
    getTags(params?: {
        category?: string;
        userId?: string;
    }): Promise<DocumentTag[]>;
    /**
     * Get a specific tag by ID
     */
    getTag(tagId: string): Promise<DocumentTag>;
    /**
     * Create a new tag
     */
    createTag(tagData: DocumentTagCreateInput): Promise<DocumentTag>;
    /**
     * Update a tag
     */
    updateTag(tagId: string, updates: DocumentTagUpdateInput): Promise<DocumentTag>;
    /**
     * Delete a tag
     */
    deleteTag(tagId: string): Promise<void>;
    /**
     * Add a tag to a document
     */
    addTagToDocument(tagId: string, documentId: string): Promise<void>;
    /**
     * Remove a tag from a document
     */
    removeTagFromDocument(tagId: string, documentId: string): Promise<void>;
}
export declare const documentTagApiService: DocumentTagApiService;
export {};
