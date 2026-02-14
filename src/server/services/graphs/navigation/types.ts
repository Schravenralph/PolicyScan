/**
 * PRD-Compliant Navigation Graph Types
 * 
 * These types match the Dual Graph Architecture PRD (PRD-DUAL-GRAPH-001) exactly.
 * See: docs/60-prd/dual-graph-architecture-prd.md
 */

/**
 * Content type for NavigationNode
 */
export type ContentType = 'html' | 'pdf' | 'doc';

/**
 * Edge type for NavigationEdge
 */
export type EdgeType = 'menu' | 'body' | 'breadcrumb' | 'footer' | 'related' | 'sitemap' | 'download';

/**
 * NavigationNode schema as defined in PRD Section 5.4
 * 
 * Represents a node in the Navigation Graph optimized for crawling,
 * traversal, and semantic document discovery.
 */
export interface NavigationNode {
    /** UUID identifier for the node */
    id: string;
    
    /** Original URL of the node */
    url: string;
    
    /** Canonical URL (may differ from url if redirected) */
    canonicalUrl: string;
    
    /** Domain name (e.g., 'iplo.nl') */
    domain: string;
    
    /** Content type: html, pdf, or doc */
    contentType: ContentType;
    
    /** Title of the page/document */
    title: string;
    
    /** Path to the saved file in Knowledge Base (optional) */
    filePath: string | null;
    
    /** Embedding vector for semantic matching */
    embedding: number[];
    
    /** HTTP status code from last fetch */
    httpStatus: number;
    
    /** ISO timestamp of last fetch/retrieval */
    lastFetched: string;
    
    /** Content checksum for deduplication */
    checksum: string;
}

/**
 * NavigationEdge schema as defined in PRD Section 5.4
 * 
 * Represents a directed edge between NavigationNodes.
 */
export interface NavigationEdge {
    /** UUID identifier for the edge */
    id: string;
    
    /** Source node ID (NavigationNode.id) */
    from: string;
    
    /** Target node ID (NavigationNode.id) */
    to: string;
    
    /** Type of edge: menu, body, breadcrumb, footer, related, sitemap, or download */
    edgeType: EdgeType;
    
    /** Anchor text from HTML link */
    anchorText: string;
    
    /** HTML rel attribute (e.g., 'nofollow', 'external') */
    rel: string;
    
    /** ISO timestamp when link was first seen */
    firstSeen: string;
    
    /** ISO timestamp when link was last seen */
    lastSeen: string;
    
    /** Weight for traversal algorithms */
    weight: number;
}

/**
 * Options for creating a NavigationNode
 */
export interface CreateNavigationNodeOptions {
    url: string;
    canonicalUrl?: string;
    domain?: string;
    contentType?: ContentType;
    title?: string;
    filePath?: string | null;
    embedding?: number[];
    httpStatus?: number;
    lastFetched?: string;
    checksum?: string;
}

/**
 * Options for creating a NavigationEdge
 */
export interface CreateNavigationEdgeOptions {
    from: string;
    to: string;
    edgeType: EdgeType;
    anchorText?: string;
    rel?: string;
    firstSeen?: string;
    lastSeen?: string;
    weight?: number;
}

/**
 * Options for updating a NavigationNode
 */
export interface UpdateNavigationNodeOptions {
    url?: string;
    canonicalUrl?: string;
    domain?: string;
    contentType?: ContentType;
    title?: string;
    filePath?: string | null;
    embedding?: number[];
    httpStatus?: number;
    lastFetched?: string;
    checksum?: string;
}
