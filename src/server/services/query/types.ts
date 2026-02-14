/**
 * Query Preset Type Definitions
 * 
 * Type definitions for query presets extracted from various sources
 * (scrapers, IPLO workflows, website data, etc.)
 */

export interface QueryPreset {
  /** Unique identifier (e.g., 'scraper-energietransitie') */
  id: string;
  
  /** Display name (e.g., 'Energietransitie') */
  name: string;
  
  /** Description of the preset */
  description: string;
  
  /** Source type */
  source: 'scraper' | 'iplo' | 'website' | 'manual';
  
  /** Reference to source (scraper ID, etc.) */
  sourceId?: string;
  
  /** Array of query strings */
  queries: string[];
  
  /** Optional keywords for matching */
  keywords?: string[];
  
  /** Optional category (e.g., 'huisvesting', 'klimaat') */
  category?: string;
  
  /** Additional metadata */
  metadata?: Record<string, unknown>;
  
  /** Creation timestamp */
  createdAt?: Date;
  
  /** Last update timestamp */
  updatedAt?: Date;
}

