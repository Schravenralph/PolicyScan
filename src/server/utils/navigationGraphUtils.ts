/**
 * Utility functions for Navigation Graph
 * 
 * Extracted from NavigationGraph.ts for better organization and reusability.
 */

import type { NavigationNode } from '../types/navigationGraph.js';

/**
 * Generates a schema.org compliant URI for a navigation node.
 * 
 * @param node The navigation node
 * @param baseUrl Base URL for schema.org URIs (default: 'https://schema.org')
 * @returns Schema.org compliant URI
 */
export function generateNavigationNodeUri(node: NavigationNode, baseUrl: string = 'https://schema.org'): string {
    // Determine schema type based on node type
    const schemaType = node.schemaType || (node.type === 'document' ? 'DigitalDocument' : 'WebPage');

    // Extract domain from URL for jurisdiction-like grouping
    let domain = 'default';
    try {
        const urlObj = new URL(node.url);
        domain = urlObj.hostname.replace(/\./g, '-');
    } catch (_e) {
        // If URL parsing fails, use a sanitized version of the URL
        domain = node.url.replace(/[^a-z0-9]/gi, '-').substring(0, 50);
    }

    // Create a unique identifier from the URL
    const identifier = Buffer.from(node.url).toString('base64')
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 32);

    return `${baseUrl}/${schemaType}/${domain}/${identifier}`;
}

/**
 * Check if a title is a generic/placeholder pattern that should be rejected
 * 
 * @param title The title to check
 * @returns true if the title is a generic/placeholder pattern
 */
function isGenericTitle(title: string): boolean {
    if (!title || title.trim().length === 0) {
        return true;
    }
    
    const normalized = title.toLowerCase().trim();
    
    // Patterns that indicate generic/placeholder titles
    const genericPatterns = [
        /^document\d+$/i,           // document1, document2, etc.
        /^page\d+$/i,               // page1, page2, etc.
        /^doc\d+$/i,                // doc1, doc2, etc.
        /^untitled$/i,               // untitled
        /^untitled\s+document$/i,   // untitled document
        /^new\s+document$/i,        // new document
        /^document$/i,               // just "document"
        /^page$/i,                   // just "page"
        /^file\d+$/i,               // file1, file2, etc.
        /^item\d+$/i,               // item1, item2, etc.
        /^test\d*$/i,               // test, test1, etc.
        /^temp\d*$/i,               // temp, temp1, etc.
        /^tmp\d*$/i,                // tmp, tmp1, etc.
        /^draft\d*$/i,              // draft, draft1, etc.
    ];
    
    return genericPatterns.some(pattern => pattern.test(normalized));
}

/**
 * Extract title from URL path
 * 
 * @param url The URL to extract title from
 * @returns Extracted title or undefined if extraction fails or title is generic
 */
function extractTitleFromUrl(url: string): string | undefined {
    try {
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/').filter(p => p);
        const lastPart = pathParts[pathParts.length - 1] || '';
        
        if (!lastPart) {
            return undefined;
        }
        
        // Remove file extension and decode URL
        const decoded = decodeURIComponent(lastPart.replace(/\.(pdf|doc|docx|html?|htm)$/i, ''))
            .replace(/[-_]/g, ' ')
            .trim();
        
        if (decoded.length > 0) {
            // Capitalize first letter of each word
            const extractedTitle = decoded.split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
                .join(' ');
            
            // Reject generic/placeholder titles
            if (isGenericTitle(extractedTitle)) {
                return undefined;
            }
            
            return extractedTitle;
        }
    } catch {
        // URL parsing failed
    }
    
    return undefined;
}

/**
 * Extract title for navigation graph node with smart fallback chain
 * Priority: canonicalDoc.title → URL path → sourceId
 * 
 * Throws an error if no title can be determined - "Untitled" is not acceptable.
 * 
 * @param canonicalDoc The canonical document with optional title, canonicalUrl, and sourceId
 * @param url Optional URL override (uses canonicalDoc.canonicalUrl if not provided)
 * @returns A meaningful title for the navigation node
 * @throws Error if no title can be determined from any source
 */
export function extractNavigationNodeTitle(
    canonicalDoc: { title?: string; canonicalUrl?: string; sourceId?: string },
    url?: string
): string {
    // Priority 1: Use canonicalDoc.title if available and non-empty
    // But validate it's not a generic/placeholder title
    if (canonicalDoc.title && canonicalDoc.title.trim().length > 0) {
        const title = canonicalDoc.title.trim();
        if (!isGenericTitle(title)) {
            return title;
        }
        // If title is generic, fall through to other sources
    }
    
    // Priority 2: Extract title from URL
    const urlToUse = url || canonicalDoc.canonicalUrl;
    if (urlToUse) {
        const extractedTitle = extractTitleFromUrl(urlToUse);
        if (extractedTitle && !isGenericTitle(extractedTitle)) {
            return extractedTitle;
        }
    }
    
    // Priority 3: Use sourceId if available
    // But only if it's not a generic identifier
    if (canonicalDoc.sourceId && canonicalDoc.sourceId.trim().length > 0) {
        const sourceId = canonicalDoc.sourceId.trim();
        // Check if sourceId looks like a meaningful title (not just an ID or generic pattern)
        if (!isGenericTitle(sourceId) && 
            !/^[a-f0-9]{8,}$/i.test(sourceId) && // Not a hex ID
            !/^[0-9a-f-]{36}$/i.test(sourceId)) { // Not a UUID
            return sourceId;
        }
    }
    
    // Error: No title can be determined - this is a data quality issue
    const urlForError = urlToUse || 'unknown';
    const titleValue = canonicalDoc.title || 'missing';
    const sourceIdValue = canonicalDoc.sourceId || 'missing';
    
    throw new Error(
        `Cannot determine title for navigation graph node. ` +
        `URL: ${urlForError}, ` +
        `title: ${titleValue}${isGenericTitle(titleValue) ? ' (generic/placeholder)' : ''}, ` +
        `sourceId: ${sourceIdValue}. ` +
        `All navigation graph nodes must have a meaningful title.`
    );
}
