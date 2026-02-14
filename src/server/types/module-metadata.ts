/**
 * Module Metadata Types
 * 
 * Defines the metadata schema for workflow modules in the marketplace.
 * This includes version information, dependencies, author details, and more.
 * 
 * @module module-metadata
 */

/**
 * Semantic version string (e.g., "1.2.3")
 */
export type Version = string;

/**
 * Module dependency specification
 */
export interface ModuleDependency {
    /** Module ID that this module depends on */
    moduleId: string;
    /** Version requirement (e.g., "^1.0.0", ">=2.0.0 <3.0.0") */
    version?: string;
    /** Whether this dependency is required or optional */
    required?: boolean;
}

/**
 * Module metadata for the marketplace
 */
export interface ModuleMetadata {
    /** Unique identifier for the module (e.g., "discover-sources") */
    id: string;
    
    /** Human-readable name (e.g., "Discover Sources") */
    name: string;
    
    /** Semantic version (e.g., "1.0.0") */
    version: Version;
    
    /** Description of what the module does */
    description: string;
    
    /** Category/group for organization (e.g., "discovery", "processing", "storage") */
    category: string;
    
    /** Author information */
    author: {
        name: string;
        email?: string;
        url?: string;
    };
    
    /** License identifier (e.g., "MIT", "Apache-2.0") */
    license: string;
    
    /** Repository URL (GitHub, GitLab, etc.) */
    repository?: string;
    
    /** Tags for searchability */
    tags: string[];
    
    /** Dependencies on other modules */
    dependencies: ModuleDependency[];
    
    /** Keywords for search */
    keywords?: string[];
    
    /** Homepage URL */
    homepage?: string;
    
    /** Module icon URL or data URI */
    icon?: string;
    
    /** Whether the module is published/available */
    published: boolean;
    
    /** Creation date */
    createdAt: string;
    
    /** Last update date */
    updatedAt: string;
    
    /** Module compatibility information */
    compatibility?: {
        /** Minimum workflow engine version required */
        minEngineVersion?: string;
        /** Maximum workflow engine version supported */
        maxEngineVersion?: string;
    };
}

/**
 * Module registry entry
 * Combines metadata with the actual module instance
 */
export interface ModuleRegistryEntry {
    /** Module metadata */
    metadata: ModuleMetadata;
    
    /** The module instance */
    module: import('../services/workflow/WorkflowModule.js').BaseWorkflowModule;
    
    /** When the module was registered */
    registeredAt: Date;
    
    /** Number of times this module has been used */
    usageCount: number;
}

/**
 * Module search filters
 */
export interface ModuleSearchFilters {
    /** Search by name, description, or tags */
    query?: string;
    
    /** Filter by category */
    category?: string;
    
    /** Filter by tags */
    tags?: string[];
    
    /** Filter by author */
    author?: string;
    
    /** Show only published modules */
    published?: boolean;
    
    /** Minimum version */
    minVersion?: string;
}

/**
 * Module discovery result
 */
export interface ModuleDiscoveryResult {
    /** Found modules */
    modules: ModuleRegistryEntry[];
    
    /** Total count */
    total: number;
    
    /** Whether there are more results */
    hasMore: boolean;
}










