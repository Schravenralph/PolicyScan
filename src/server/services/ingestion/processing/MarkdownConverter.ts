import TurndownService from 'turndown';
import { ImborService } from '../../external/imborService.js';

export interface PageMetadata {
    title: string;
    description?: string;
    keywords?: string[];
    url?: string;
    last_scraped?: string;
    imbor_keywords?: string[];
    parent_topic?: string;
    // Multi-source metadata (US-012)
    source?: string; // Source type: 'iplo', 'rijksoverheid', 'gemeente', etc.
    authority_level?: 'national' | 'provincial' | 'municipal' | 'unknown';
    municipality_name?: string;
    province_name?: string;
    [key: string]: unknown;
}

export class MarkdownConverter {
    private turndownService: TurndownService;
    private imborService: ImborService;

    constructor(imborService?: ImborService) {
        this.turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced',
            hr: '---',
            bulletListMarker: '-',
        });

        // Remove scripts, styles, and other non-content elements
        const removableTags = ['script', 'style', 'noscript', 'iframe', 'svg'];
        removableTags.forEach(tag => {
            this.turndownService.remove(tag as any);
        });

        // Initialize IMBOR service if not provided (lazy initialization)
        this.imborService = imborService || new ImborService();
    }

    /**
     * Converts HTML string to Markdown.
     * @param html The HTML content to convert.
     * @returns The generated Markdown string.
     */
    public convert(html: string): string {
        try {
            return this.turndownService.turndown(html);
        } catch (error) {
            console.warn(`[MarkdownConverter] Error converting HTML to Markdown: ${error instanceof Error ? error.message : String(error)}`);
            // Fallback: try to extract text content even if HTML is malformed
            try {
                // Remove script and style tags manually as fallback
                const cleaned = html
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                return cleaned || 'Content could not be converted.';
            } catch {
                return 'Content could not be converted.';
            }
        }
    }

    /**
     * Extracts metadata from the HTML content.
     * @param html The HTML content to parse.
     * @param url Optional URL of the page.
     * @returns Extracted metadata object.
     */
    public extractMetadata(html: string, url?: string): PageMetadata {
        const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

        const descriptionMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
        const description = descriptionMatch ? descriptionMatch[1].trim() : undefined;

        const keywordsMatch = html.match(/<meta\s+name=["']keywords["']\s+content=["'](.*?)["']/i);
        const keywords = keywordsMatch ? keywordsMatch[1].split(',').map(k => k.trim()) : undefined;

        // IMBOR keywords will be extracted during convertWithFrontmatter if needed

        return {
            title,
            description,
            keywords,
            url
        };
    }

    /**
     * Generates YAML frontmatter from metadata.
     * @param metadata The page metadata to convert to frontmatter.
     * @returns YAML frontmatter string.
     */
    private generateFrontmatter(metadata: PageMetadata): string {
        const lines = ['---'];
        
        // Required fields
        if (metadata.url) {
            lines.push(`url: ${this.escapeYamlValue(metadata.url)}`);
        }
        if (metadata.title) {
            lines.push(`title: ${this.escapeYamlValue(metadata.title)}`);
        }
        
        // Optional fields
        if (metadata.last_scraped) {
            lines.push(`last_scraped: ${this.escapeYamlValue(metadata.last_scraped)}`);
        }
        if (metadata.imbor_keywords && metadata.imbor_keywords.length > 0) {
            const keywordsStr = metadata.imbor_keywords
                .map(k => this.escapeYamlValue(k))
                .join(', ');
            lines.push(`imbor_keywords: [${keywordsStr}]`);
        }
        if (metadata.parent_topic) {
            lines.push(`parent_topic: ${this.escapeYamlValue(metadata.parent_topic)}`);
        }
        
        // Additional metadata fields
        const standardFields = ['url', 'title', 'last_scraped', 'imbor_keywords', 'parent_topic', 'description', 'keywords'];
        for (const [key, value] of Object.entries(metadata)) {
            if (standardFields.includes(key) || value === undefined) continue;
            if (Array.isArray(value)) {
                const arrayStr = value.map(v => this.escapeYamlValue(String(v))).join(', ');
                lines.push(`${key}: [${arrayStr}]`);
            } else {
                lines.push(`${key}: ${this.escapeYamlValue(String(value))}`);
            }
        }
        
        lines.push('---');
        return lines.join('\n');
    }

    /**
     * Escapes YAML values that contain special characters.
     * @param value The value to escape.
     * @returns Escaped YAML value string.
     */
    private escapeYamlValue(value: string): string {
        // Quote if contains special YAML characters or starts with special characters
        if (value.includes(':') || value.includes('#') || value.includes('&') || 
            value.includes('(') || value.includes(')') || value.includes('[') || 
            value.includes(']') || value.includes('{') || value.includes('}') ||
            value.includes(',') || value.includes('|') || value.includes('>') ||
            value.includes('*') || value.includes('!') || value.includes('@') ||
            value.includes('%') || value.startsWith(' ') || value.endsWith(' ') ||
            value === '' || value.toLowerCase() === 'true' || value.toLowerCase() === 'false' ||
            value.toLowerCase() === 'null' || !isNaN(Number(value))) {
            return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
        }
        return value;
    }

    /**
     * Converts HTML to Markdown with YAML frontmatter.
     * This is the recommended method for generating AI-ready markdown documents.
     * @param html The HTML content to convert.
     * @param metadata The page metadata (will be merged with extracted metadata).
     * @param extractImborKeywords Whether to extract IMBOR keywords from content (default: true).
     * @returns Markdown string with YAML frontmatter.
     */
    public async convertWithFrontmatter(
        html: string, 
        metadata: Partial<PageMetadata> = {},
        extractImborKeywords: boolean = true
    ): Promise<string> {
        // Extract metadata from HTML
        const extractedMetadata = this.extractMetadata(html, metadata.url);
        
        // Merge provided metadata with extracted metadata (provided takes precedence)
        const fullMetadata: PageMetadata = {
            ...extractedMetadata,
            ...metadata,
            // Ensure title is always present
            title: metadata.title || extractedMetadata.title || 'Untitled'
        };
        
        // Add last_scraped if not provided
        if (!fullMetadata.last_scraped) {
            fullMetadata.last_scraped = new Date().toISOString().split('T')[0];
        }
        
        // Convert HTML to Markdown
        const markdown = this.convert(html);
        
        // Extract IMBOR keywords if not already provided and extraction is enabled
        if (extractImborKeywords && !fullMetadata.imbor_keywords) {
            try {
                const extractedKeywords = await this.imborService.extractKeywords(markdown);
                // Only include keywords above confidence threshold (already filtered in extractKeywords)
                // Extract just the canonical terms for the frontmatter
                fullMetadata.imbor_keywords = extractedKeywords.map(kw => kw.term);
                
                if (fullMetadata.imbor_keywords.length > 0) {
                    console.log(`[MarkdownConverter] Extracted ${fullMetadata.imbor_keywords.length} IMBOR keywords`);
                }
            } catch (error) {
                console.warn(`[MarkdownConverter] Failed to extract IMBOR keywords: ${error instanceof Error ? error.message : String(error)}`);
                // Continue without keywords if extraction fails
            }
        }
        
        // Generate frontmatter
        const frontmatter = this.generateFrontmatter(fullMetadata);
        
        return `${frontmatter}\n\n${markdown}`;
    }
}
