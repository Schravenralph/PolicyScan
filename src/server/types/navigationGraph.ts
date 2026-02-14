/**
 * Type definitions for Navigation Graph
 * 
 * Extracted from NavigationGraph.ts for better organization and reusability.
 */

/**
 * A node in the navigation graph representing a page, section, or document
 */
export interface NavigationNode {
    url: string;
    type: 'page' | 'section' | 'document';
    title?: string;
    filePath?: string; // Path to the saved Markdown file (KB pointer)
    xpaths?: {
        [key: string]: string; // e.g., "next_button": "//button[@class='next']"
    };
    children: string[]; // URLs of child nodes
    lastVisited?: string; // ISO timestamp of last visit (deprecated, use lastFetched)
    lastFetched?: string; // ISO timestamp of last fetch/retrieval

    // Semantic search fields
    content?: string; // Text content for semantic analysis
    embedding?: number[]; // Embedding vector (384 dimensions for all-MiniLM-L6-v2)

    // Schema.org fields
    uri?: string; // Schema.org compliant URI
    schemaType?: string; // Schema.org type (e.g., 'WebPage', 'DigitalDocument')
    sourceUrl?: string; // Original web page URL (same as url, but explicit for clarity)
    canonicalUrl?: string; // Canonical URL (may differ from url if redirected)

    // Structure-first metadata (for scraping-native graph)
    contentType?: 'html' | 'pdf' | 'xml' | 'json' | 'other'; // Content type of the resource
    siteId?: string; // Site identifier (e.g., 'iplo', 'horst-aan-de-maas')
    domain?: string; // Domain name (e.g., 'iplo.nl')
    httpStatus?: number; // HTTP status code from last fetch
    hash?: string; // Content hash/checksum (SHA-256) for deduplication
    checksum?: string; // Alternative checksum field (deprecated, use hash)

    // Metadata fields for relationship building
    thema?: string; // Theme/topic for document classification
    onderwerp?: string; // Subject/topic for document classification
    
    // Enhanced metadata fields (Phase 1 & 2)
    summary?: string; // Summary/description (first 500 chars of content)
    documentType?: string; // Document type (e.g., 'PDF', 'Beleidsdocument')
    publishedAt?: string; // Publication date (ISO timestamp)
    publisherAuthority?: string; // Publisher/authority name

    // Cross-linking to Knowledge Graph
    entityId?: string; // Link to Knowledge Graph entity (for bidirectional linking)
}

/**
 * Complete navigation graph data structure
 */
export interface NavigationGraphData {
    nodes: { [url: string]: NavigationNode };
    rootUrl: string;
}

/**
 * Statistics about the navigation graph
 */
export interface GraphStatistics {
    totalNodes: number;
    totalEdges: number;
    maxDepth: number;
    pageTypes: { [type: string]: number };
    lastUpdated: string;
}

/**
 * Change tracking metadata for incremental updates
 */
export interface NodeChangeMetadata {
    changedFields: string[];
    changeType: 'added' | 'updated' | 'unchanged';
    previousValues?: Record<string, unknown>;
    timestamp: string;
    relationshipsCreated?: number;
}

/**
 * Result of node comparison for change detection
 * Internal type used by change detection logic
 */
export interface NodeChangeResult {
    hasChanges: boolean;
    changedFields: string[];
    changedProperties: Record<string, unknown>;
    previousValues?: Record<string, unknown>;
}

/**
 * Batch update result
 */
export interface BatchUpdateResult {
    total: number;
    added: number;
    updated: number;
    unchanged: number;
    errors: number;
    relationshipsCreated: number;
    changeMetadata: NodeChangeMetadata[];
}

/**
 * Edge properties for LINKS_TO relationships
 * 
 * Structure-first metadata for scraping-native graph traversal and ranking
 */
export interface NavigationEdgeProperties {
    /** Type of link: nav/menu/body/footer/breadcrumb/sitemap/related/download */
    edgeType?: 'nav' | 'menu' | 'body' | 'footer' | 'breadcrumb' | 'sitemap' | 'related' | 'download';
    /** Anchor text from the HTML link */
    anchorText?: string;
    /** HTML rel attribute (e.g., 'nofollow', 'external') */
    rel?: string;
    /** ISO timestamp when this link was first seen */
    firstSeen?: string;
    /** ISO timestamp when this link was last seen */
    lastSeen?: string;
    /** CSS selector or DOM region where the link was found (e.g., '#main-nav', '.footer-links') */
    sourceSection?: string;
}
