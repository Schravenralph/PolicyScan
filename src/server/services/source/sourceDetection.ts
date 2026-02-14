/**
 * Source Detection Utility
 * 
 * Detects source type and authority level from URLs and domains
 * for multi-source scraping support (US-012)
 */

export type AuthorityLevel = 'national' | 'provincial' | 'municipal' | 'unknown';
export type SourceType = 'iplo' | 'rijksoverheid' | 'gemeente' | 'provincie' | 'other';

export interface SourceMetadata {
    sourceType: SourceType;
    authorityLevel: AuthorityLevel;
    domain: string;
    municipalityName?: string;
    provinceName?: string;
}

/**
 * Detects authority level from URL or domain
 */
export function detectAuthorityLevel(url: string): AuthorityLevel {
    const urlLower = url.toLowerCase();
    
    // National level indicators
    if (urlLower.includes('rijksoverheid.nl') ||
        urlLower.includes('iplo.nl') ||
        urlLower.includes('omgevingswet.nl') ||
        urlLower.includes('pbl.nl') ||
        urlLower.includes('rvo.nl') ||
        urlLower.includes('rws.nl')) {
        return 'national';
    }
    
    // Provincial level indicators
    if (urlLower.includes('provincie') ||
        urlLower.includes('provinciale') ||
        urlLower.match(/provincie-[\w-]+\.nl/) ||
        urlLower.match(/[\w-]+\.provincie\.nl/)) {
        return 'provincial';
    }
    
    // Municipal level indicators
    if (urlLower.includes('gemeente') ||
        urlLower.includes('gemeentelijke') ||
        urlLower.match(/gemeente-[\w-]+\.nl/) ||
        urlLower.match(/[\w-]+\.gemeente\.nl/)) {
        return 'municipal';
    }
    
    // Try to detect from domain pattern
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        // Check for known municipal domains (e.g., amsterdam.nl, rotterdam.nl)
        // These are typically municipal sites
        if (hostname.match(/^[\w-]+\.nl$/) && 
            !hostname.includes('rijksoverheid') &&
            !hostname.includes('provincie')) {
            // Common municipal domain pattern
            return 'municipal';
        }
    } catch {
        // Invalid URL, can't determine
    }
    
    return 'unknown';
}

/**
 * Detects source type from URL
 */
export function detectSourceType(url: string): SourceType {
    const urlLower = url.toLowerCase();
    
    if (urlLower.includes('iplo.nl')) {
        return 'iplo';
    }
    
    if (urlLower.includes('rijksoverheid.nl')) {
        return 'rijksoverheid';
    }
    
    if (urlLower.includes('provincie') || urlLower.includes('provinciale')) {
        return 'provincie';
    }
    
    if (urlLower.includes('gemeente') || urlLower.includes('gemeentelijke')) {
        return 'gemeente';
    }
    
    // Try to detect municipality from domain
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        
        // Common municipal domain patterns
        if (hostname.match(/^[\w-]+\.nl$/) && 
            !hostname.includes('rijksoverheid') &&
            !hostname.includes('provincie')) {
            return 'gemeente';
        }
    } catch {
        // Invalid URL
    }
    
    return 'other';
}

/**
 * Extracts municipality name from URL or website title
 */
export function extractMunicipalityName(url: string, websiteTitle?: string): string | undefined {
    // Try to extract from URL first
    const urlLower = url.toLowerCase();
    
    // Pattern: gemeente-[name].nl or [name].nl
    const gemeenteMatch = urlLower.match(/gemeente-([\w-]+)/);
    if (gemeenteMatch) {
        return capitalizeWords(gemeenteMatch[1].replace(/-/g, ' '));
    }
    
    // Pattern: [name].nl (common for municipalities)
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const domainMatch = hostname.match(/^([\w-]+)\.nl$/);
        if (domainMatch && !hostname.includes('rijksoverheid') && !hostname.includes('provincie')) {
            const name = domainMatch[1].replace(/-/g, ' ');
            // Filter out common non-municipal domains
            if (!['www', 'www2', 'www3', 'mail', 'webmail'].includes(name)) {
                return capitalizeWords(name);
            }
        }
    } catch {
        // Invalid URL
    }
    
    // Try to extract from website title
    if (websiteTitle) {
        const titleLower = websiteTitle.toLowerCase();
        const gemeenteTitleMatch = titleLower.match(/gemeente\s+([\w\s]+)/i);
        if (gemeenteTitleMatch) {
            return capitalizeWords(gemeenteTitleMatch[1].trim());
        }
    }
    
    return undefined;
}

/**
 * Extracts province name from URL
 */
export function extractProvinceName(url: string): string | undefined {
    const urlLower = url.toLowerCase();
    
    // Pattern: provincie-[name].nl
    const provincieMatch = urlLower.match(/provincie-([\w-]+)/);
    if (provincieMatch) {
        return capitalizeWords(provincieMatch[1].replace(/-/g, ' '));
    }
    
    // Pattern: [name].provincie.nl
    try {
        const urlObj = new URL(url);
        const hostname = urlObj.hostname.toLowerCase();
        const domainMatch = hostname.match(/^([\w-]+)\.provincie\.nl$/);
        if (domainMatch) {
            return capitalizeWords(domainMatch[1].replace(/-/g, ' '));
        }
    } catch {
        // Invalid URL
    }
    
    return undefined;
}

/**
 * Gets complete source metadata from URL and optional website title
 */
export function getSourceMetadata(url: string, websiteTitle?: string): SourceMetadata {
    const authorityLevel = detectAuthorityLevel(url);
    const sourceType = detectSourceType(url);
    
    let domain = '';
    try {
        const urlObj = new URL(url);
        domain = urlObj.hostname.toLowerCase();
    } catch {
        domain = url;
    }
    
    const municipalityName = authorityLevel === 'municipal' 
        ? extractMunicipalityName(url, websiteTitle)
        : undefined;
    
    const provinceName = authorityLevel === 'provincial'
        ? extractProvinceName(url)
        : undefined;
    
    return {
        sourceType,
        authorityLevel,
        domain,
        municipalityName,
        provinceName
    };
}

/**
 * Capitalizes words in a string (e.g., "horst aan de maas" -> "Horst Aan De Maas")
 */
function capitalizeWords(text: string): string {
    return text
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
}

