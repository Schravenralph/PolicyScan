/**
 * Date utility functions for parsing and validating dates
 * Supports both ISO 8601 dates and relative date strings (e.g., "30d", "6m", "1y")
 */

/**
 * Parse a relative date string to an ISO date string
 * 
 * @param relativeDate - Relative date string (e.g., "30d", "6m", "1y")
 * @returns ISO 8601 date string
 * @throws Error if format is invalid
 */
export function parseRelativeDate(relativeDate: string): string {
    const trimmed = relativeDate.trim();
    
    // Match patterns like "30d", "6m", "1y"
    const match = trimmed.match(/^(\d+)([dmy])$/i);
    if (!match) {
        throw new Error(`Invalid relative date format: ${relativeDate}. Expected format: "30d", "6m", or "1y"`);
    }
    
    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();
    
    if (value <= 0) {
        throw new Error(`Invalid relative date value: ${value}. Must be positive.`);
    }
    
    const now = new Date();
    let result: Date;
    
    switch (unit) {
        case 'd':
            result = new Date(now);
            result.setDate(result.getDate() - value);
            break;
        case 'm':
            result = new Date(now);
            result.setMonth(result.getMonth() - value);
            break;
        case 'y':
            result = new Date(now);
            result.setFullYear(result.getFullYear() - value);
            break;
        default:
            throw new Error(`Invalid relative date unit: ${unit}. Expected: d, m, or y`);
    }
    
    return result.toISOString();
}

/**
 * Validate an ISO 8601 date string
 * 
 * @param dateString - ISO 8601 date string
 * @returns true if valid, false otherwise
 */
export function validateISODate(dateString: string): boolean {
    if (!dateString || typeof dateString !== 'string') {
        return false;
    }
    
    // Try to parse the date
    const date = new Date(dateString);
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
        return false;
    }
    
    // Check if the string matches ISO 8601 format (basic validation)
    const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
    if (!isoRegex.test(dateString)) {
        // Allow more flexible ISO formats
        return date.toISOString().startsWith(dateString.substring(0, 10));
    }
    
    return true;
}

/**
 * Parse a date string (either ISO 8601 or relative date)
 * 
 * @param dateString - Date string (ISO 8601 or relative like "30d")
 * @returns ISO 8601 date string
 * @throws Error if format is invalid
 */
export function parseDate(dateString: string): string {
    const trimmed = dateString.trim();
    
    // Try relative date first (matches pattern like "30d")
    if (/^\d+[dmy]$/i.test(trimmed)) {
        return parseRelativeDate(trimmed);
    }
    
    // Try ISO 8601 date
    if (validateISODate(trimmed)) {
        return trimmed;
    }
    
    throw new Error(`Invalid date format: ${dateString}. Expected ISO 8601 (e.g., "2024-01-01T00:00:00.000Z") or relative (e.g., "30d", "6m", "1y")`);
}
