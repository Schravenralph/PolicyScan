import { WorkflowBlock, BlockType } from './types.js';

/**
 * Block Registry
 * 
 * Central registry for all available workflow blocks.
 * Blocks define reusable components that can be composed into workflows.
 */
export class BlockRegistry {
    private blocks: Map<BlockType, WorkflowBlock> = new Map();

    /**
     * Register a block definition
     */
    register(block: WorkflowBlock): void {
        this.blocks.set(block.type, block);
    }

    /**
     * Get a block by type
     */
    get(type: BlockType): WorkflowBlock | undefined {
        return this.blocks.get(type);
    }

    /**
     * Get all blocks
     */
    getAll(): WorkflowBlock[] {
        return Array.from(this.blocks.values());
    }

    /**
     * Get blocks by category
     */
    getByCategory(category: WorkflowBlock['category']): WorkflowBlock[] {
        return this.getAll().filter(b => b.category === category);
    }

    /**
     * Check if a block type is registered
     */
    has(type: BlockType): boolean {
        return this.blocks.has(type);
    }
}

// Singleton instance
let blockRegistryInstance: BlockRegistry | null = null;

export function getBlockRegistry(): BlockRegistry {
    if (!blockRegistryInstance) {
        blockRegistryInstance = new BlockRegistry();
        initializeDefaultBlocks(blockRegistryInstance);
    }
    return blockRegistryInstance;
}

/**
 * Initialize default blocks
 */
function initializeDefaultBlocks(registry: BlockRegistry): void {
    // 1. Explore IPLO Block
    registry.register({
        id: 'explore_iplo',
        type: 'explore_iplo',
        name: 'Explore IPLO',
        description: 'Explore IPLO website and build navigation graph based on search terms',
        icon: '🌐',
        category: 'discovery',
        inputs: [
            { id: 'searchTerm', name: 'Search Term', type: 'string', required: true, description: 'Topic to explore (e.g., "bodem", "water")' },
            { id: 'maxDepth', name: 'Max Depth', type: 'number', defaultValue: 2, description: 'Maximum crawl depth' },
            { id: 'randomness', name: 'Randomness', type: 'number', defaultValue: 0.3, description: 'Exploration randomness (0-1)' }
        ],
        outputs: [
            { id: 'graph', name: 'Navigation Graph', type: 'object', description: 'Updated navigation graph' },
            { id: 'nodesFound', name: 'Nodes Found', type: 'number', description: 'Number of nodes discovered' }
        ]
    });

    // 2. Scrape Websites Block
    registry.register({
        id: 'scrape_websites',
        type: 'scrape_websites',
        name: 'Scrape Websites',
        description: 'Scrape user-selected websites for policy documents',
        icon: '🕷️',
        category: 'scraping',
        inputs: [
            { id: 'websites', name: 'Websites', type: 'array', required: true, description: 'Array of website URLs to scrape' },
            { id: 'searchTerm', name: 'Search Term', type: 'string', required: true, description: 'Topic to search for' },
            { id: 'maxDepth', name: 'Max Depth', type: 'number', defaultValue: 2, description: 'Maximum crawl depth' }
        ],
        outputs: [
            { id: 'documents', name: 'Documents', type: 'array', description: 'Scraped documents' },
            { id: 'count', name: 'Document Count', type: 'number', description: 'Number of documents found' }
        ]
    });

    // 3. Score Relevance Block
    registry.register({
        id: 'score_relevance',
        type: 'score_relevance',
        name: 'Score Relevance',
        description: 'Score documents for relevance to search term',
        icon: '⭐',
        category: 'analysis',
        inputs: [
            { id: 'documents', name: 'Documents', type: 'array', required: true, description: 'Documents to score' },
            { id: 'searchTerm', name: 'Search Term', type: 'string', required: true, description: 'Topic to score against' }
        ],
        outputs: [
            { id: 'scoredDocuments', name: 'Scored Documents', type: 'array', description: 'Documents with relevance scores' },
            { id: 'averageScore', name: 'Average Score', type: 'number', description: 'Average relevance score' }
        ]
    });

    // 4. Cross Reference Google Block
    registry.register({
        id: 'cross_reference_google',
        type: 'cross_reference_google',
        name: 'Cross Reference Google',
        description: 'Cross-reference findings with Google search results',
        icon: '🔍',
        category: 'analysis',
        inputs: [
            { id: 'documents', name: 'Documents', type: 'array', required: true, description: 'Documents to cross-reference' },
            { id: 'searchTerm', name: 'Search Term', type: 'string', required: true, description: 'Search query' }
        ],
        outputs: [
            { id: 'verifiedDocuments', name: 'Verified Documents', type: 'array', description: 'Documents verified via Google' },
            { id: 'additionalResults', name: 'Additional Results', type: 'array', description: 'New documents found via Google' }
        ]
    });

    // 5. Cross Reference Common Crawl Block
    registry.register({
        id: 'cross_reference_commoncrawl',
        type: 'cross_reference_commoncrawl',
        name: 'Cross Reference Common Crawl',
        description: 'Cross-reference findings with Common Crawl archive',
        icon: '📚',
        category: 'analysis',
        inputs: [
            { id: 'documents', name: 'Documents', type: 'array', required: true, description: 'Documents to cross-reference' },
            { id: 'urlPattern', name: 'URL Pattern', type: 'string', required: true, description: 'Pattern to search (e.g., *beleid*)' },
            { id: 'crawlId', name: 'Crawl ID', type: 'string', description: 'Common Crawl crawl ID' }
        ],
        outputs: [
            { id: 'verifiedDocuments', name: 'Verified Documents', type: 'array', description: 'Documents verified via Common Crawl' },
            { id: 'archiveMatches', name: 'Archive Matches', type: 'array', description: 'Matches found in archive' }
        ]
    });

    // 6. Enhance Query Block
    registry.register({
        id: 'enhance_query',
        type: 'enhance_query',
        name: 'Enhance Query',
        description: 'Enhance search query using IMBOR vocabulary',
        icon: '✨',
        category: 'enhancement',
        inputs: [
            { id: 'query', name: 'Query', type: 'string', required: true, description: 'Original search query' },
            { id: 'thema', name: 'Theme', type: 'string', description: 'Theme context' }
        ],
        outputs: [
            { id: 'enhancedQuery', name: 'Enhanced Query', type: 'string', description: 'Enhanced search query' },
            { id: 'terms', name: 'Enhanced Terms', type: 'array', description: 'List of enhanced terms' }
        ]
    });

    // 7. Filter Documents Block
    registry.register({
        id: 'filter_documents',
        type: 'filter_documents',
        name: 'Filter Documents',
        description: 'Filter documents based on criteria',
        icon: '🔽',
        category: 'filtering',
        inputs: [
            { id: 'documents', name: 'Documents', type: 'array', required: true, description: 'Documents to filter' },
            { id: 'minScore', name: 'Min Score', type: 'number', defaultValue: 0.5, description: 'Minimum relevance score' },
            { id: 'maxResults', name: 'Max Results', type: 'number', description: 'Maximum number of results' }
        ],
        outputs: [
            { id: 'filteredDocuments', name: 'Filtered Documents', type: 'array', description: 'Filtered documents' },
            { id: 'filteredCount', name: 'Filtered Count', type: 'number', description: 'Number of documents after filtering' }
        ]
    });

    // 8. AI Analyze Block (Future - placeholder)
    registry.register({
        id: 'ai_analyze',
        type: 'ai_analyze',
        name: 'AI Analyze',
        description: 'Analyze documents using AI to determine next steps',
        icon: '🤖',
        category: 'analysis',
        inputs: [
            { id: 'documents', name: 'Documents', type: 'array', required: true, description: 'Documents to analyze' },
            { id: 'context', name: 'Context', type: 'object', description: 'Analysis context' }
        ],
        outputs: [
            { id: 'analysis', name: 'Analysis', type: 'object', description: 'AI analysis results' },
            { id: 'recommendations', name: 'Recommendations', type: 'array', description: 'Recommended next steps' }
        ]
    });

    // 9. AI Decide Loop Block (Future - placeholder)
    registry.register({
        id: 'ai_decide_loop',
        type: 'ai_decide_loop',
        name: 'AI Decide Loop',
        description: 'AI decides whether to loop back with updated parameters',
        icon: '🔄',
        category: 'analysis',
        inputs: [
            { id: 'results', name: 'Results', type: 'object', required: true, description: 'Current workflow results' },
            { id: 'maxIterations', name: 'Max Iterations', type: 'number', defaultValue: 3, description: 'Maximum loop iterations' }
        ],
        outputs: [
            { id: 'shouldLoop', name: 'Should Loop', type: 'boolean', description: 'Whether to loop back' },
            { id: 'updatedParams', name: 'Updated Parameters', type: 'object', description: 'Updated parameters for next iteration' },
            { id: 'targetBlock', name: 'Target Block', type: 'string', description: 'Block ID to loop back to' }
        ]
    });
}

