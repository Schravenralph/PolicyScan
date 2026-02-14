/**
 * Website Graph Schema
 * 
 * Defines the structure for mapping how websites link together
 * and how to programmatically select elements
 */

export interface WebsiteNode {
    url: string;
    title: string;
    timestamp: string;
    status: 'explored' | 'pending' | 'error';
    metadata: {
        hasJavaScript: boolean;
        requiresPuppeteer: boolean;
        responseTime: number;
        statusCode: number;
    };
    links: LinkGroup[];
    error?: string;
}

export interface LinkGroup {
    type: 'document' | 'pdf' | 'navigation' | 'external' | 'search' | 'other';
    description: string;
    selectors: {
        css: string;
        xpath: string;
    };
    count: number;
    samples: LinkTarget[];
}

export interface LinkTarget {
    url: string;
    text: string;
    attributes?: Record<string, string>;
}

export interface WebsiteGraph {
    rootUrl: string;
    explored: Map<string, WebsiteNode>;
    pending: Set<string>;
    metadata: {
        startTime: string;
        lastUpdate: string;
        totalNodes: number;
        totalLinks: number;
    };
}

/**
 * Helper to convert CSS selector to XPath
 */
export function cssToXPath(css: string): string {
    // Simple conversions for common patterns
    const conversions: Record<string, string> = {
        'a[href*="document"]': '//a[contains(@href, "document")]',
        'a[href*="pdf"]': '//a[contains(@href, "pdf")]',
        'a[href$=".pdf"]': '//a[ends-with(@href, ".pdf")]',
        'a[href*="beleid"]': '//a[contains(@href, "beleid")]',
        'a[href*="publicatie"]': '//a[contains(@href, "publicatie")]',
        '.document-link': '//a[contains(@class, "document-link")]',
        'article a': '//article//a',
        '.content a': '//*[contains(@class, "content")]//a',
        'h1': '//h1',
        'h2': '//h2',
        'h3': '//h3',
    };

    return conversions[css] || `//*[@class="${css}"]`;
}

/**
 * Serialize graph to JSON
 */
export function serializeGraph(graph: WebsiteGraph): string {
    const serialized = {
        rootUrl: graph.rootUrl,
        explored: Array.from(graph.explored.entries()).map(([_, node]) => node),
        pending: Array.from(graph.pending),
        metadata: graph.metadata
    };

    return JSON.stringify(serialized, null, 2);
}

/**
 * Deserialize graph from JSON
 */
export function deserializeGraph(json: string): WebsiteGraph {
    const data = JSON.parse(json);

    return {
        rootUrl: data.rootUrl,
        explored: new Map(data.explored.map((node: WebsiteNode) => [node.url, node])),
        pending: new Set(data.pending),
        metadata: data.metadata
    };
}
