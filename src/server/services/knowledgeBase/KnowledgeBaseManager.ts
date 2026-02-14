import fs from 'fs/promises';
import { constants } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { PageMetadata } from '../ingestion/processing/MarkdownConverter.js';
import { KnowledgeBaseFileModel } from '../../models/KnowledgeBaseFile.js';

export interface FileMetadata {
    url: string;
    filePath: string;
    fileSize: number;
    lastModified: Date;
    lastScraped?: Date;
    contentHash: string;
    createdAt: Date;
}

export interface ThemeMapping {
    [key: string]: string;
}

export interface DomainConfig {
    domain: string | RegExp;
    prefixPatterns: string[];
    themeMapping?: ThemeMapping;
    pathStructure?: 'flat' | 'hierarchical' | 'theme-based';
}

export class KnowledgeBaseManager {
    private baseDir: string;
    private domainConfigs: DomainConfig[];

    constructor(baseDir: string) {
        this.baseDir = baseDir;
        this.domainConfigs = this.initializeDomainConfigs();
    }

    /**
     * Initialize domain-specific configurations for better URL parsing
     */
    private initializeDomainConfigs(): DomainConfig[] {
        return [
            {
                domain: /iplo\.nl/i,
                prefixPatterns: ['thema', 'onderwerp', 'topic'],
                themeMapping: {
                    'water': 'water',
                    'milieu': 'milieu',
                    'ruimtelijke-ordening': 'ruimtelijke-ordening',
                    'externe-veiligheid': 'externe-veiligheid',
                    'energie': 'energie',
                    'natuur': 'natuur',
                    'klimaat': 'klimaat',
                    'duurzaamheid': 'klimaat'
                },
                pathStructure: 'theme-based'
            },
            {
                domain: /rijksoverheid\.nl/i,
                prefixPatterns: ['onderwerpen', 'thema'],
                pathStructure: 'hierarchical'
            },
            {
                domain: /omgevingswet\.nl/i,
                prefixPatterns: ['thema', 'onderwerp'],
                pathStructure: 'hierarchical'
            },
            {
                domain: /gemeente/i,
                prefixPatterns: ['beleid', 'onderwerpen', 'thema'],
                pathStructure: 'hierarchical'
            }
        ];
    }

    /**
     * Get domain configuration for a given URL
     */
    private getDomainConfig(url: string): DomainConfig | null {
        try {
            const parsedUrl = new URL(url);
            const hostname = parsedUrl.hostname;
            
            for (const config of this.domainConfigs) {
                if (typeof config.domain === 'string') {
                    if (hostname.includes(config.domain)) {
                        return config;
                    }
                } else if (config.domain instanceof RegExp) {
                    if (config.domain.test(hostname)) {
                        return config;
                    }
                }
            }
        } catch {
            // Invalid URL, return null
        }
        return null;
    }

    /**
     * Extract theme from URL path parts using domain configuration
     */
    private extractTheme(pathParts: string[], domainConfig: DomainConfig | null): string | null {
        if (!domainConfig || !domainConfig.themeMapping) {
            return null;
        }

        // Look for theme in path parts
        for (const part of pathParts) {
            const normalizedPart = part.toLowerCase().replace(/[^a-z0-9]/g, '-');
            if (domainConfig.themeMapping[normalizedPart]) {
                return domainConfig.themeMapping[normalizedPart];
            }
            // Also check direct mapping
            if (domainConfig.themeMapping[part.toLowerCase()]) {
                return domainConfig.themeMapping[part.toLowerCase()];
            }
        }

        return null;
    }

    /**
     * Extract theme from metadata keywords or title
     */
    private extractThemeFromMetadata(metadata: PageMetadata): string | null {
        // Check keywords first
        if (metadata.keywords && Array.isArray(metadata.keywords)) {
            const themeKeywords = ['water', 'milieu', 'ruimtelijke-ordening', 'externe-veiligheid', 
                                 'energie', 'natuur', 'klimaat', 'duurzaamheid'];
            for (const keyword of metadata.keywords) {
                const normalized = keyword.toLowerCase().replace(/[^a-z0-9]/g, '-');
                if (themeKeywords.includes(normalized)) {
                    return normalized;
                }
            }
        }

        // Check title for theme indicators
        if (metadata.title) {
            const titleLower = metadata.title.toLowerCase();
            // Use word boundary for most, but allow partial matches for compound words
            // e.g., "waterkwaliteit" should match "water"
            const themePatterns: { pattern: RegExp; theme: string }[] = [
                { pattern: /water/i, theme: 'water' }, // Match "water" anywhere (waterkwaliteit, waterbeheer, etc.)
                { pattern: /\bmilieu\b/i, theme: 'milieu' },
                { pattern: /ruimtelijk/i, theme: 'ruimtelijke-ordening' },
                { pattern: /\bveiligheid\b/i, theme: 'externe-veiligheid' },
                { pattern: /\benergie\b/i, theme: 'energie' },
                { pattern: /\bnatuur\b/i, theme: 'natuur' },
                { pattern: /\bklimaat\b/i, theme: 'klimaat' },
                { pattern: /duurzaam/i, theme: 'klimaat' }
            ];

            for (const { pattern, theme } of themePatterns) {
                if (pattern.test(titleLower)) {
                    return theme;
                }
            }
        }

        return null;
    }

    /**
     * Generates YAML frontmatter from metadata.
     */
    public generateFrontmatter(metadata: PageMetadata): string {
        const lines = ['---'];
        for (const [key, value] of Object.entries(metadata)) {
            if (value === undefined) continue;
            if (Array.isArray(value)) {
                // Simple array formatting
                const arrayStr = value.map(v => JSON.stringify(v)).join(', ');
                lines.push(`${key}: [${arrayStr}]`);
            } else {
                // Escape quotes if necessary, simple implementation
                const valStr = String(value);
                // Quote if contains special YAML characters: :, #, &, or parentheses
                if (valStr.includes(':') || valStr.includes('#') || valStr.includes('&') || valStr.includes('(') || valStr.includes(')')) {
                    lines.push(`${key}: "${valStr.replace(/"/g, '\\"')}"`);
                } else {
                    lines.push(`${key}: ${valStr}`);
                }
            }
        }
        lines.push('---');
        return lines.join('\n');
    }

    /**
     * Generates a content hash for duplicate detection
     */
    private generateContentHash(content: string): string {
        return crypto.createHash('sha256').update(content).digest('hex');
    }

    /**
     * Calculate Jaccard similarity between two texts (word-based)
     * Returns a value between 0 and 1, where 1 is identical
     */
    private calculateSimilarity(text1: string, text2: string): number {
        // Normalize and tokenize
        const normalize = (text: string): Set<string> => {
            return new Set(
                text
                    .toLowerCase()
                    .replace(/[^\w\s]/g, ' ')
                    .split(/\s+/)
                    .filter(word => word.length > 2) // Filter out very short words
            );
        };

        const set1 = normalize(text1);
        const set2 = normalize(text2);

        if (set1.size === 0 && set2.size === 0) return 1;
        if (set1.size === 0 || set2.size === 0) return 0;

        // Calculate intersection and union
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        return intersection.size / union.size;
    }

    /**
     * Checks if file exists and compares content with similarity scoring
     */
    private async checkExistingFile(
        filePath: string, 
        newContentHash: string,
        newContent: string
    ): Promise<{ exists: boolean; changed: boolean; oldHash?: string; similarity?: number }> {
        try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
                return { exists: false, changed: false };
            }

            const existingContent = await fs.readFile(filePath, 'utf-8');
            // Extract content without frontmatter for comparison
            const contentMatch = existingContent.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
            const existingBody = contentMatch ? contentMatch[1] : existingContent;
            const existingHash = this.generateContentHash(existingBody);

            const hashChanged = existingHash !== newContentHash;
            
            // Calculate similarity score if content changed
            let similarity: number | undefined;
            if (hashChanged) {
                similarity = this.calculateSimilarity(existingBody, newContent);
            } else {
                similarity = 1.0; // Identical content
            }

            return {
                exists: true,
                changed: hashChanged,
                oldHash: existingHash,
                similarity
            };
        } catch {
            return { exists: false, changed: false };
        }
    }

    /**
     * Enhanced URL parsing with domain-specific handling
     * Strips common URL prefixes and handles query parameters/fragments
     */
    private parseUrlPath(url: string): { pathParts: string[]; theme: string | null; domainConfig: DomainConfig | null } {
        try {
            const parsedUrl = new URL(url);
            const domainConfig = this.getDomainConfig(url);
            
            // Get pathname and remove leading/trailing slashes
            // Decode URL-encoded characters (e.g., %C3%A9 -> é)
            const pathname = decodeURIComponent(parsedUrl.pathname).replace(/^\/+|\/+$/g, '');
            
            // Remove query parameters and fragments from path consideration
            // (they're stored in metadata, not in file path)
            
            // Split into parts
            let pathParts = pathname.split('/').filter(p => p && p.trim() !== '');
            
            // Strip domain-specific prefixes
            if (domainConfig && domainConfig.prefixPatterns) {
                for (const prefix of domainConfig.prefixPatterns) {
                    if (pathParts.length > 0 && pathParts[0].toLowerCase() === prefix.toLowerCase()) {
                        pathParts = pathParts.slice(1);
                        break; // Only strip first matching prefix
                    }
                }
            }
            
            // Extract theme from path or metadata
            const theme = this.extractTheme(pathParts, domainConfig);
            
            return { pathParts, theme, domainConfig };
        } catch {
            return { pathParts: [], theme: null, domainConfig: null };
        }
    }

    /**
     * Ensures the base directory exists and is writable
     * Called before file operations to catch permission issues early
     */
    private async ensureBaseDirectory(): Promise<void> {
        try {
            // Check if base directory exists
            try {
                await fs.access(this.baseDir, constants.F_OK | constants.W_OK);
            } catch {
                // Directory doesn't exist or isn't writable, try to create it
                await fs.mkdir(this.baseDir, { recursive: true, mode: 0o755 });
            }
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if ((error as NodeJS.ErrnoException).code === 'EACCES') {
                throw new Error(
                    `Permission denied: Cannot access or create base directory "${this.baseDir}". ` +
                    `Please ensure the directory exists and has write permissions. ` +
                    `In Docker, ensure /app/data/knowledge_base is created with proper permissions. ` +
                    `Original error: ${errorMsg}`
                );
            }
            throw new Error(`Failed to ensure base directory "${this.baseDir}": ${errorMsg}`);
        }
    }

    /**
     * Saves the markdown content to a file.
     * Determines the path based on metadata or URL.
     * Handles duplicate detection and content comparison.
     */
    public async savePage(metadata: PageMetadata, markdownContent: string): Promise<{ filePath: string; wasUpdated: boolean; wasSkipped: boolean; similarity?: number }> {
        // Ensure base directory exists and is writable before proceeding
        await this.ensureBaseDirectory();
        
        const frontmatter = this.generateFrontmatter(metadata);
        const fileContent = `${frontmatter}\n\n${markdownContent}`;
        const contentHash = this.generateContentHash(markdownContent);

        // Determine file path with enhanced URL parsing and theme detection
        let relativePath = 'uncategorized/untitled.md';

        if (metadata.url) {
            const { pathParts, theme, domainConfig } = this.parseUrlPath(metadata.url);
            
            // Try to extract theme from metadata if not found in URL
            const detectedTheme = theme || this.extractThemeFromMetadata(metadata);
            
            if (pathParts.length > 0) {
                // Sanitize each path part
                let sanitizedParts = pathParts.map(part => this.slugify(part));
                
                // Build directory structure based on domain config
                let dir: string;
                let filename: string;
                
                if (domainConfig?.pathStructure === 'theme-based' && detectedTheme) {
                    // Theme-based: theme/sub-theme/filename
                    // Check if last part is the theme itself (root-level theme page)
                    if (sanitizedParts.length === 1 && sanitizedParts[0] === detectedTheme) {
                        // Root-level theme page: theme/index.md
                        relativePath = `${detectedTheme}/index.md`;
                    } else {
                        // Remove theme from pathParts if it's the first part to avoid duplication
                        if (sanitizedParts.length > 0 && sanitizedParts[0] === detectedTheme) {
                            sanitizedParts = sanitizedParts.slice(1);
                        }
                        filename = sanitizedParts.pop() || 'index';
                        const subTheme = sanitizedParts.length > 0 ? sanitizedParts.join('/') : null;
                        dir = subTheme ? `${detectedTheme}/${subTheme}` : detectedTheme;
                        relativePath = `${dir}/${filename}.md`;
                    }
                } else if (domainConfig?.pathStructure === 'hierarchical') {
                    // Hierarchical: preserve full path structure
                    filename = sanitizedParts.pop() || 'index';
                    dir = sanitizedParts.join('/');
                    relativePath = dir ? `${dir}/${filename}.md` : `${filename}.md`;
                } else {
                    // Flat or default: use path parts as-is
                    filename = sanitizedParts.pop() || 'index';
                    dir = sanitizedParts.join('/');
                    
                    // If we have a detected theme (from metadata), use theme-based structure
                    // This applies even when there's no domain config
                    if (detectedTheme) {
                        relativePath = dir ? `${detectedTheme}/${dir}/${filename}.md` : `${detectedTheme}/${filename}.md`;
                    } else if (!domainConfig) {
                        // No domain config and no theme - use uncategorized
                        relativePath = dir ? `uncategorized/${dir}/${filename}.md` : `uncategorized/${filename}.md`;
                    } else {
                        relativePath = dir ? `${dir}/${filename}.md` : `${filename}.md`;
                    }
                }
            } else {
                // Root path or invalid URL - use theme if available, otherwise fallback to title or index
                if (detectedTheme) {
                    relativePath = `${detectedTheme}/index.md`;
                } else if (metadata.title) {
                    // Invalid URL but we have a title - use uncategorized
                    const slug = this.slugify(metadata.title);
                    relativePath = `uncategorized/${slug}.md`;
                } else {
                    relativePath = 'index.md';
                }
            }
        } else {
            // No URL - try to extract theme from metadata
            const detectedTheme = this.extractThemeFromMetadata(metadata);
            const slug = this.slugify(metadata.title || 'untitled');
            
            if (detectedTheme) {
                relativePath = `${detectedTheme}/${slug}.md`;
            } else {
                relativePath = `uncategorized/${slug}.md`;
            }
        }

        const fullPath = path.join(this.baseDir, relativePath);
        const dirPath = path.dirname(fullPath);

        // Check if file exists and if content changed (with similarity scoring)
        const existing = await this.checkExistingFile(fullPath, contentHash, markdownContent);

        if (existing.exists && !existing.changed) {
            // US-010: Content unchanged, but update last_scraped timestamp to track when we last checked
            // This is required for production mode change detection tracking
            try {
                const existingContent = await fs.readFile(fullPath, 'utf-8');
                // Extract existing frontmatter
                const frontmatterMatch = existingContent.match(/^---\n([\s\S]*?)\n---\n\n([\s\S]*)$/);
                if (frontmatterMatch) {
                    const existingFrontmatter = frontmatterMatch[1];
                    const existingBody = frontmatterMatch[2];
                    
                    // Update last_scraped in frontmatter
                    const updatedFrontmatter = existingFrontmatter.replace(
                        /last_scraped:\s*["']?[^"'\n]+["']?/,
                        `last_scraped: "${new Date().toISOString()}"`
                    );
                    
                    // If last_scraped wasn't in frontmatter, add it
                    const hasLastScraped = /last_scraped:/.test(existingFrontmatter);
                    const finalFrontmatter = hasLastScraped 
                        ? updatedFrontmatter 
                        : `${existingFrontmatter}\nlast_scraped: "${new Date().toISOString()}"`;
                    
                    const updatedContent = `---\n${finalFrontmatter}\n---\n\n${existingBody}`;
                    await fs.writeFile(fullPath, updatedContent, 'utf-8');
                }
            } catch (error) {
                // If updating frontmatter fails, log but don't fail the operation
                console.warn(`[KnowledgeBaseManager] Failed to update last_scraped timestamp for unchanged file: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            return { 
                filePath: fullPath, 
                wasUpdated: false, 
                wasSkipped: true,
                similarity: existing.similarity
            };
        }

        // Create directory if needed with error handling
        try {
            await fs.mkdir(dirPath, { recursive: true });
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if ((error as NodeJS.ErrnoException).code === 'EACCES') {
                throw new Error(
                    `Permission denied: Cannot create directory "${dirPath}". ` +
                    `Please ensure the directory exists and has write permissions. ` +
                    `In Docker, ensure /app/data/knowledge_base is created with proper permissions. ` +
                    `Original error: ${errorMsg}`
                );
            }
            throw new Error(`Failed to create directory "${dirPath}": ${errorMsg}`);
        }
        
        // Update frontmatter with last_scraped if content changed
        if (existing.exists && existing.changed) {
            const updatedMetadata = {
                ...metadata,
                last_scraped: new Date().toISOString()
            };
            const updatedFrontmatter = this.generateFrontmatter(updatedMetadata);
            const updatedContent = `${updatedFrontmatter}\n\n${markdownContent}`;
            try {
                await fs.writeFile(fullPath, updatedContent, 'utf-8');
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                if ((error as NodeJS.ErrnoException).code === 'EACCES') {
                    throw new Error(
                        `Permission denied: Cannot write to file "${fullPath}". ` +
                        `Please ensure the file and parent directory have write permissions. ` +
                        `In Docker, ensure /app/data/knowledge_base has proper permissions. ` +
                        `Original error: ${errorMsg}`
                    );
                }
                throw new Error(`Failed to write file "${fullPath}": ${errorMsg}`);
            }
            
            // Log the update action
            console.log(`[KnowledgeBaseManager] Updated file: ${relativePath} (URL: ${metadata.url})`);
            
            // Update file metadata in MongoDB
            try {
                const fileMetadata = await this.getFileMetadata(fullPath, metadata.url || '');
                if (fileMetadata) {
                    // Pass URL as graphNodeUrl to link file to graph node
                    await KnowledgeBaseFileModel.upsert(fileMetadata, metadata.url);
                }
            } catch (error) {
                // Gracefully handle database errors (e.g., in tests or when DB is unavailable)
                console.warn(`[KnowledgeBaseManager] Failed to update file metadata in database: ${error instanceof Error ? error.message : String(error)}`);
            }
            
            return { 
                filePath: fullPath, 
                wasUpdated: true, 
                wasSkipped: false,
                similarity: existing.similarity
            };
        }

        // New file
        try {
            await fs.writeFile(fullPath, fileContent, 'utf-8');
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            if ((error as NodeJS.ErrnoException).code === 'EACCES') {
                throw new Error(
                    `Permission denied: Cannot write to file "${fullPath}". ` +
                    `Please ensure the file and parent directory have write permissions. ` +
                    `In Docker, ensure /app/data/knowledge_base has proper permissions. ` +
                    `Original error: ${errorMsg}`
                );
            }
            throw new Error(`Failed to write file "${fullPath}": ${errorMsg}`);
        }
        
        // Log the creation action
        console.log(`[KnowledgeBaseManager] Created file: ${relativePath} (URL: ${metadata.url})`);
        
        // Store file metadata in MongoDB
        try {
            const fileMetadata = await this.getFileMetadata(fullPath, metadata.url || '');
            if (fileMetadata) {
                // Pass URL as graphNodeUrl to link file to graph node
                await KnowledgeBaseFileModel.upsert(fileMetadata, metadata.url);
            }
        } catch (error) {
            // Gracefully handle database errors (e.g., in tests or when DB is unavailable)
            console.warn(`[KnowledgeBaseManager] Failed to store file metadata in database: ${error instanceof Error ? error.message : String(error)}`);
        }
        
        return { 
            filePath: fullPath, 
            wasUpdated: false, 
            wasSkipped: false,
            similarity: 1.0 // New file, no similarity to compare
        };
    }

    /**
     * Enhanced slug sanitization - URL-safe and filesystem-safe
     * Handles special characters, Unicode, preserves readability
     * Example: "Water & Waterkwaliteit (2024)" -> "water-waterkwaliteit-2024"
     * Example: "Café & Résumé" -> "cafe-resume"
     * Example: "Plan van Aanpak 2024-2025" -> "plan-van-aanpak-2024-2025"
     */
    private slugify(text: string): string {
        if (!text) return 'untitled';
        
        let slug = text.toLowerCase();
        
        // Handle common Dutch/German special characters FIRST (before normalization)
        // This preserves special mappings like ü -> ue
        const charMap: { [key: string]: string } = {
            'ä': 'ae', 'ö': 'oe', 'ü': 'ue',
            'ß': 'ss', 'æ': 'ae', 'ø': 'oe',
            'ñ': 'n', 'ç': 'c'
        };
        
        for (const [char, replacement] of Object.entries(charMap)) {
            slug = slug.replace(new RegExp(char, 'gi'), replacement);
        }
        
        // Then normalize remaining Unicode characters (é -> e, etc.)
        slug = slug
            .normalize('NFD') // Decompose characters (é -> e + ´)
            .replace(/[\u0300-\u036f]/g, ''); // Remove diacritics
        
        // Remove parentheses but keep their content
        slug = slug.replace(/[()]/g, ' ');
        
        // Replace common separators with spaces (will become hyphens)
        slug = slug.replace(/[&+]/g, ' ');
        
        // Replace common punctuation with spaces
        slug = slug.replace(/[,;:]/g, ' ');
        
        // Replace slashes and backslashes with hyphens (path separators)
        slug = slug.replace(/[/\\]/g, '-');
        
        // Replace all other non-alphanumeric characters with hyphens
        slug = slug.replace(/[^a-z0-9]+/g, '-');
        
        // Remove leading/trailing hyphens
        slug = slug.replace(/^-+|-+$/g, '');
        
        // Collapse multiple consecutive hyphens
        slug = slug.replace(/-+/g, '-');
        
        // Smart truncation: preserve word boundaries, limit to 200 chars
        if (slug.length > 200) {
            // Try to truncate at a word boundary (hyphen)
            const truncated = slug.substring(0, 200);
            const lastHyphen = truncated.lastIndexOf('-');
            if (lastHyphen > 150) {
                // If we can truncate at a reasonable word boundary, do so
                slug = truncated.substring(0, lastHyphen);
            } else {
                // Otherwise just truncate
                slug = truncated;
            }
        }
        
        // Ensure we have something
        if (!slug || slug.length === 0) {
            return 'untitled';
        }
        
        return slug;
    }

    /**
     * Get file metadata
     */
    public async getFileMetadata(filePath: string, url: string): Promise<FileMetadata | null> {
        try {
            const stats = await fs.stat(filePath);
            const content = await fs.readFile(filePath, 'utf-8');
            const contentMatch = content.match(/^---\n[\s\S]*?\n---\n\n([\s\S]*)$/);
            const body = contentMatch ? contentMatch[1] : content;
            const contentHash = this.generateContentHash(body);

            return {
                url,
                filePath,
                fileSize: stats.size,
                lastModified: stats.mtime,
                lastScraped: stats.mtime, // Use mtime as proxy for last scraped
                contentHash,
                createdAt: stats.birthtime
            };
        } catch {
            return null;
        }
    }

    /**
     * Calculate confidence score for orphaned file detection
     * Higher score = more likely to be orphaned
     */
    private calculateOrphanConfidence(filePath: string, url: string | null, knownUrls: Set<string>): number {
        let confidence = 0.5; // Base confidence

        // If URL is missing, higher confidence it's orphaned
        if (!url) {
            confidence += 0.3;
        } else if (!knownUrls.has(url)) {
            // URL exists but not in known set
            confidence += 0.4;
        }

        // Check file age (older files more likely orphaned if not in graph)
        // This would require file stats, simplified for now

        // Check if file is in archive directory (already archived)
        if (filePath.includes('/archive/')) {
            confidence = 1.0; // Definitely orphaned if already archived
        }

        return Math.min(confidence, 1.0);
    }

    /**
     * Detect orphaned files with confidence scoring
     * Returns list of orphaned file paths with confidence scores
     */
    public async detectOrphanedFiles(
        knownUrls: Set<string>,
        archiveDir?: string,
        minConfidence: number = 0.5
    ): Promise<{ orphaned: Array<{ path: string; confidence: number; url: string | null }>; archived: string[] }> {
        const orphaned: Array<{ path: string; confidence: number; url: string | null }> = [];
        const archived: string[] = [];
        const baseDir = this.baseDir;

        const scanDirectory = async (dir: string): Promise<void> => {
            // Check if directory exists before trying to read it
            try {
                await fs.access(dir);
            } catch {
                // Directory doesn't exist, nothing to scan
                return;
            }
            
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);

                if (entry.isDirectory()) {
                    await scanDirectory(fullPath);
                } else if (entry.isFile() && entry.name.endsWith('.md')) {
                    try {
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const urlMatch = content.match(/url:\s*["']?([^"'\n]+)["']?/);
                        const url = urlMatch ? urlMatch[1] : null;

                        // Calculate confidence score
                        const confidence = this.calculateOrphanConfidence(fullPath, url, knownUrls);

                        // Only include if confidence meets threshold
                        if (confidence >= minConfidence && (!url || !knownUrls.has(url))) {
                            orphaned.push({ path: fullPath, confidence, url });

                            if (archiveDir && confidence >= 0.7) {
                                // Only auto-archive high-confidence orphans
                                const relativePath = path.relative(baseDir, fullPath);
                                const archivePath = path.join(baseDir, archiveDir, relativePath);
                                const archiveDirPath = path.dirname(archivePath);

                                await fs.mkdir(archiveDirPath, { recursive: true });
                                await fs.rename(fullPath, archivePath);
                                archived.push(archivePath);
                                console.log(`[KnowledgeBaseManager] Archived orphaned file (confidence: ${confidence.toFixed(2)}): ${relativePath} -> ${path.relative(baseDir, archivePath)}`);
                            } else {
                                console.log(`[KnowledgeBaseManager] Flagged orphaned file (confidence: ${confidence.toFixed(2)}): ${path.relative(baseDir, fullPath)}`);
                            }
                        }
                    } catch (error) {
                        console.warn(`[KnowledgeBaseManager] Error processing file ${fullPath}:`, error);
                    }
                }
            }
        };

        await scanDirectory(this.baseDir);
        
        if (orphaned.length > 0) {
            console.log(`[KnowledgeBaseManager] Detected ${orphaned.length} orphaned file(s) with confidence >= ${minConfidence}`);
        }
        
        return { orphaned, archived };
    }
}
