/**
 * WorkflowModuleRegistry
 * 
 * Central registry for workflow modules with marketplace capabilities.
 * Provides module discovery, version management, and metadata tracking.
 * 
 * @module WorkflowModuleRegistry
 */

import { WorkflowModule } from './WorkflowModule.js';
import type { 
    ModuleMetadata, 
    ModuleRegistryEntry, 
    ModuleSearchFilters, 
    ModuleDiscoveryResult,
    ModuleDependency 
} from '../../types/module-metadata.js';
import { logger } from '../../utils/logger.js';

/**
 * Registry for workflow modules
 */
export class WorkflowModuleRegistry {
    private modules: Map<string, ModuleRegistryEntry> = new Map();
    private modulesByCategory: Map<string, Set<string>> = new Map();
    private modulesByTag: Map<string, Set<string>> = new Map();
    private modulesByAuthor: Map<string, Set<string>> = new Map();

    /**
     * Register a module in the registry
     * 
     * @param module The module instance
     * @param metadata Module metadata
     * @param validateDependencies Whether to validate dependencies exist (default: true)
     * @throws Error if module ID already exists with different version
     * @throws Error if circular dependencies are detected
     * @throws Error if required dependencies are missing
     */
    register(module: WorkflowModule, metadata: ModuleMetadata, validateDependencies: boolean = true): void {
        // Validate module instance
        this.validateModule(module);

        // Validate metadata matches module
        if (metadata.id !== module.id) {
            throw new Error(
                `Module registration failed: Metadata ID "${metadata.id}" does not match module ID "${module.id}". ` +
                `Ensure getMetadata() returns the correct ID.`
            );
        }

        if (metadata.name !== module.name) {
            throw new Error(
                `Module registration failed: Metadata name "${metadata.name}" does not match module name "${module.name}". ` +
                `Ensure getMetadata() returns the correct name.`
            );
        }

        // Validate metadata structure
        this.validateMetadata(metadata, module.id);

        // Validate dependencies if requested
        if (validateDependencies && metadata.dependencies.length > 0) {
            this.validateDependencies(metadata.id, metadata.dependencies);
        }

        // Check if module already exists
        const existing = this.modules.get(metadata.id);
        if (existing) {
            // If same version, update registration time
            if (existing.metadata.version === metadata.version) {
                logger.warn(`Module ${metadata.id}@${metadata.version} already registered, updating registration time`);
                existing.registeredAt = new Date();
                return;
            }
            // Different version - allow multiple versions (could be enhanced to support versioning)
            logger.info(`Registering new version of module ${metadata.id}: ${metadata.version} (existing: ${existing.metadata.version})`);
        }

        // Create registry entry
        const entry: ModuleRegistryEntry = {
            metadata: {
                ...metadata,
                updatedAt: new Date().toISOString(),
            },
            module,
            registeredAt: new Date(),
            usageCount: 0,
        };

        // Store module
        this.modules.set(metadata.id, entry);

        // Index by category
        if (!this.modulesByCategory.has(metadata.category)) {
            this.modulesByCategory.set(metadata.category, new Set());
        }
        this.modulesByCategory.get(metadata.category)!.add(metadata.id);

        // Index by tags
        for (const tag of metadata.tags) {
            if (!this.modulesByTag.has(tag)) {
                this.modulesByTag.set(tag, new Set());
            }
            this.modulesByTag.get(tag)!.add(metadata.id);
        }

        // Index by author
        const authorKey = metadata.author.name.toLowerCase();
        if (!this.modulesByAuthor.has(authorKey)) {
            this.modulesByAuthor.set(authorKey, new Set());
        }
        this.modulesByAuthor.get(authorKey)!.add(metadata.id);

        logger.info(`Registered module: ${metadata.id}@${metadata.version} (${metadata.name})`);
    }

    /**
     * Get a module by ID
     * 
     * @param moduleId Module identifier
     * @returns Module registry entry or undefined
     */
    get(moduleId: string): ModuleRegistryEntry | undefined {
        return this.modules.get(moduleId);
    }

    /**
     * Check if a module is registered
     * 
     * @param moduleId Module identifier
     * @returns True if module is registered, false otherwise
     */
    has(moduleId: string): boolean {
        return this.modules.has(moduleId);
    }

    /**
     * Get all registered module IDs
     * 
     * @returns Array of module IDs
     */
    getModuleIds(): string[] {
        return Array.from(this.modules.keys());
    }

    /**
     * Get all registered modules
     * 
     * @returns Array of all module entries
     */
    getAll(): ModuleRegistryEntry[] {
        return Array.from(this.modules.values());
    }

    /**
     * Search for modules based on filters
     * 
     * @param filters Search filters
     * @returns Discovery result with matching modules
     */
    search(filters: ModuleSearchFilters = {}): ModuleDiscoveryResult {
        let results = Array.from(this.modules.values());

        // Filter by published status
        if (filters.published !== undefined) {
            results = results.filter(entry => entry.metadata.published === filters.published);
        }

        // Filter by category
        if (filters.category) {
            results = results.filter(entry => entry.metadata.category === filters.category);
        }

        // Filter by tags
        if (filters.tags && filters.tags.length > 0) {
            results = results.filter(entry => 
                filters.tags!.some(tag => entry.metadata.tags.includes(tag))
            );
        }

        // Filter by author
        if (filters.author) {
            const authorKey = filters.author.toLowerCase();
            results = results.filter(entry => 
                entry.metadata.author.name.toLowerCase() === authorKey
            );
        }

        // Filter by query (name, description, tags)
        if (filters.query) {
            const queryLower = filters.query.toLowerCase();
            results = results.filter(entry => {
                const metadata = entry.metadata;
                return (
                    metadata.name.toLowerCase().includes(queryLower) ||
                    metadata.description.toLowerCase().includes(queryLower) ||
                    metadata.tags.some(tag => tag.toLowerCase().includes(queryLower)) ||
                    metadata.keywords?.some(keyword => keyword.toLowerCase().includes(queryLower))
                );
            });
        }

        // Filter by minimum version
        if (filters.minVersion) {
            results = results.filter(entry => {
                return this.compareVersions(entry.metadata.version, filters.minVersion!) >= 0;
            });
        }

        // Sort by usage count (most used first), then by name
        results.sort((a, b) => {
            if (b.usageCount !== a.usageCount) {
                return b.usageCount - a.usageCount;
            }
            return a.metadata.name.localeCompare(b.metadata.name);
        });

        return {
            modules: results,
            total: results.length,
            hasMore: false, // Could implement pagination later
        };
    }

    /**
     * Get modules by category
     * 
     * @param category Category name
     * @returns Array of module entries in the category
     */
    getByCategory(category: string): ModuleRegistryEntry[] {
        const moduleIds = this.modulesByCategory.get(category);
        if (!moduleIds) {
            return [];
        }
        return Array.from(moduleIds)
            .map(id => this.modules.get(id))
            .filter((entry): entry is ModuleRegistryEntry => entry !== undefined);
    }

    /**
     * Get modules by tag
     * 
     * @param tag Tag name
     * @returns Array of module entries with the tag
     */
    getByTag(tag: string): ModuleRegistryEntry[] {
        const moduleIds = this.modulesByTag.get(tag);
        if (!moduleIds) {
            return [];
        }
        return Array.from(moduleIds)
            .map(id => this.modules.get(id))
            .filter((entry): entry is ModuleRegistryEntry => entry !== undefined);
    }

    /**
     * Get all available categories
     * 
     * @returns Array of category names
     */
    getCategories(): string[] {
        return Array.from(this.modulesByCategory.keys()).sort();
    }

    /**
     * Get all available tags
     * 
     * @returns Array of tag names
     */
    getTags(): string[] {
        return Array.from(this.modulesByTag.keys()).sort();
    }

    /**
     * Increment usage count for a module
     * 
     * @param moduleId Module identifier
     */
    incrementUsage(moduleId: string): void {
        const entry = this.modules.get(moduleId);
        if (entry) {
            entry.usageCount++;
        }
    }

    /**
     * Validate module instance
     * 
     * @param module Module instance to validate
     * @throws Error if module is invalid
     */
    private validateModule(module: WorkflowModule): void {
        const errors: string[] = [];

        // Check required properties
        if (!module.id || typeof module.id !== 'string' || module.id.trim() === '') {
            errors.push('Module must have a non-empty string "id" property');
        }

        if (!module.name || typeof module.name !== 'string' || module.name.trim() === '') {
            errors.push('Module must have a non-empty string "name" property');
        }

        if (!module.description || typeof module.description !== 'string' || module.description.trim() === '') {
            errors.push('Module must have a non-empty string "description" property');
        }

        if (!module.category || typeof module.category !== 'string' || module.category.trim() === '') {
            errors.push('Module must have a non-empty string "category" property');
        }

        // Check required methods exist
        if (typeof module.getMetadata !== 'function') {
            errors.push('Module must implement getMetadata() method');
        }

        if (typeof module.execute !== 'function') {
            errors.push('Module must implement execute() method');
        }

        if (typeof module.validate !== 'function') {
            errors.push('Module must implement validate() method');
        }

        if (typeof module.getDefaultParams !== 'function') {
            errors.push('Module must implement getDefaultParams() method');
        }

        if (typeof module.getParameterSchema !== 'function') {
            errors.push('Module must implement getParameterSchema() method');
        }

        // Validate parameter schema
        try {
            const schema = module.getParameterSchema();
            if (!schema || typeof schema !== 'object') {
                errors.push('getParameterSchema() must return an object');
            } else {
                // Validate schema structure
                for (const [key, paramDef] of Object.entries(schema)) {
                    if (!paramDef.type || !['string', 'number', 'boolean', 'array', 'object'].includes(paramDef.type)) {
                        errors.push(`Parameter "${key}" has invalid type: ${paramDef.type}. Must be one of: string, number, boolean, array, object`);
                    }
                    if (!paramDef.label || typeof paramDef.label !== 'string') {
                        errors.push(`Parameter "${key}" must have a string "label" property`);
                    }
                }
            }
        } catch (error) {
            errors.push(`Error calling getParameterSchema(): ${error instanceof Error ? error.message : String(error)}`);
        }

        // Validate default params
        try {
            const defaultParams = module.getDefaultParams();
            if (!defaultParams || typeof defaultParams !== 'object') {
                errors.push('getDefaultParams() must return an object');
            }
        } catch (error) {
            errors.push(`Error calling getDefaultParams(): ${error instanceof Error ? error.message : String(error)}`);
        }

        if (errors.length > 0) {
            throw new Error(
                `Module validation failed for "${module.id || 'unknown'}":\n` +
                errors.map(e => `  - ${e}`).join('\n')
            );
        }
    }

    /**
     * Validate metadata structure
     * 
     * @param metadata Module metadata to validate
     * @param moduleId Module ID for error messages
     * @throws Error if metadata is invalid
     */
    private validateMetadata(metadata: ModuleMetadata, moduleId: string): void {
        const errors: string[] = [];

        // Required fields
        if (!metadata.version || typeof metadata.version !== 'string') {
            errors.push('Metadata must have a "version" string property');
        }

        if (!metadata.author || typeof metadata.author !== 'object') {
            errors.push('Metadata must have an "author" object property');
        } else {
            if (!metadata.author.name || typeof metadata.author.name !== 'string') {
                errors.push('Metadata author must have a "name" string property');
            }
        }

        if (!metadata.license || typeof metadata.license !== 'string') {
            errors.push('Metadata must have a "license" string property');
        }

        if (!Array.isArray(metadata.tags)) {
            errors.push('Metadata must have a "tags" array property');
        }

        if (!Array.isArray(metadata.dependencies)) {
            errors.push('Metadata must have a "dependencies" array property');
        }

        if (typeof metadata.published !== 'boolean') {
            errors.push('Metadata must have a "published" boolean property');
        }

        // Validate version format (semantic versioning)
        if (metadata.version && !/^\d+\.\d+\.\d+/.test(metadata.version)) {
            errors.push(`Metadata version "${metadata.version}" should follow semantic versioning (e.g., "1.0.0")`);
        }

        // Validate category
        const validCategories = ['discovery', 'crawling', 'processing', 'storage', 'analysis', 'ranking', 'scraping'];
        if (metadata.category && !validCategories.includes(metadata.category)) {
            errors.push(
                `Metadata category "${metadata.category}" is not a recognized category. ` +
                `Valid categories: ${validCategories.join(', ')}`
            );
        }

        if (errors.length > 0) {
            throw new Error(
                `Metadata validation failed for module "${moduleId}":\n` +
                errors.map(e => `  - ${e}`).join('\n')
            );
        }
    }

    /**
     * Validate module dependencies
     * 
     * @param moduleId Module identifier
     * @param dependencies Dependencies to validate
     * @throws Error if circular dependencies are detected
     * @throws Error if required dependencies are missing
     */
    validateDependencies(moduleId: string, dependencies: ModuleDependency[]): void {
        const visited = new Set<string>();
        const path: string[] = [];

        const validate = (dep: ModuleDependency, currentPath: string[]) => {
            // Check for circular dependency
            if (currentPath.includes(dep.moduleId)) {
                const cycle = [...currentPath, dep.moduleId].join(' -> ');
                throw new Error(`Circular dependency detected: ${cycle}`);
            }

            // Check if dependency exists
            const depEntry = this.modules.get(dep.moduleId);
            if (!depEntry) {
                if (dep.required !== false) {
                    throw new Error(`Required dependency ${dep.moduleId} not found for module ${moduleId}`);
                }
                logger.warn(`Optional dependency ${dep.moduleId} not found for module ${moduleId}`);
                return;
            }

            // Check version requirement if specified
            if (dep.version) {
                const versionMatch = this.checkVersionRequirement(depEntry.metadata.version, dep.version);
                if (!versionMatch) {
                    if (dep.required !== false) {
                        throw new Error(
                            `Dependency ${dep.moduleId} version ${depEntry.metadata.version} does not satisfy requirement ${dep.version} for module ${moduleId}`
                        );
                    }
                    logger.warn(
                        `Optional dependency ${dep.moduleId} version ${depEntry.metadata.version} does not satisfy requirement ${dep.version} for module ${moduleId}`
                    );
                    return;
                }
            }

            // Validate dependencies of this dependency (recursive)
            if (!visited.has(dep.moduleId)) {
                visited.add(dep.moduleId);
                const newPath = [...currentPath, dep.moduleId];
                for (const subDep of depEntry.metadata.dependencies) {
                    validate(subDep, newPath);
                }
            }
        };

        // Validate all dependencies
        for (const dep of dependencies) {
            validate(dep, [moduleId]);
        }
    }

    /**
     * Resolve module dependencies
     * 
     * @param moduleId Module identifier
     * @returns Array of resolved dependency modules in dependency order
     * @throws Error if dependencies cannot be resolved
     * @throws Error if circular dependencies are detected
     */
    resolveDependencies(moduleId: string): ModuleRegistryEntry[] {
        const entry = this.modules.get(moduleId);
        if (!entry) {
            throw new Error(`Module ${moduleId} not found`);
        }

        const resolved: ModuleRegistryEntry[] = [];
        const visited = new Set<string>();
        const path: string[] = [];

        const resolve = (dep: ModuleDependency, currentPath: string[]) => {
            // Check for circular dependency
            if (currentPath.includes(dep.moduleId)) {
                const cycle = [...currentPath, dep.moduleId].join(' -> ');
                throw new Error(`Circular dependency detected: ${cycle}`);
            }

            const depEntry = this.modules.get(dep.moduleId);
            
            if (!depEntry) {
                if (dep.required !== false) {
                    throw new Error(`Required dependency ${dep.moduleId} not found for module ${moduleId}`);
                }
                logger.warn(`Optional dependency ${dep.moduleId} not found for module ${moduleId}`);
                return;
            }

            // Check version requirement if specified
            if (dep.version) {
                const versionMatch = this.checkVersionRequirement(depEntry.metadata.version, dep.version);
                if (!versionMatch) {
                    if (dep.required !== false) {
                        throw new Error(
                            `Dependency ${dep.moduleId} version ${depEntry.metadata.version} does not satisfy requirement ${dep.version}`
                        );
                    }
                    logger.warn(
                        `Optional dependency ${dep.moduleId} version ${depEntry.metadata.version} does not satisfy requirement ${dep.version}`
                    );
                    return;
                }
            }

            // Resolve dependencies of this dependency first (topological order)
            if (!visited.has(dep.moduleId)) {
                visited.add(dep.moduleId);
                const newPath = [...currentPath, dep.moduleId];
                for (const subDep of depEntry.metadata.dependencies) {
                    resolve(subDep, newPath);
                }
                resolved.push(depEntry);
            }
        };

        // Resolve all dependencies
        for (const dep of entry.metadata.dependencies) {
            resolve(dep, [moduleId]);
        }

        return resolved;
    }

    /**
     * Get dependency tree for a module
     * 
     * @param moduleId Module identifier
     * @returns Dependency tree structure
     */
    getDependencyTree(moduleId: string): {
        moduleId: string;
        version: string;
        dependencies: Array<{
            moduleId: string;
            version: string;
            required: boolean;
            satisfied: boolean;
            dependencies?: unknown;
        }>;
    } {
        const entry = this.modules.get(moduleId);
        if (!entry) {
            throw new Error(`Module ${moduleId} not found`);
        }

        const buildTree = (dep: ModuleDependency): {
            moduleId: string;
            version: string;
            required: boolean;
            satisfied: boolean;
            dependencies?: unknown;
        } => {
            const depEntry = this.modules.get(dep.moduleId);
            const satisfied = depEntry !== undefined && 
                (!dep.version || (depEntry && this.checkVersionRequirement(depEntry.metadata.version, dep.version)));

            return {
                moduleId: dep.moduleId,
                version: dep.version || 'any',
                required: dep.required !== false,
                satisfied,
                dependencies: depEntry ? depEntry.metadata.dependencies.map(buildTree) : undefined,
            };
        };

        return {
            moduleId: entry.metadata.id,
            version: entry.metadata.version,
            dependencies: entry.metadata.dependencies.map(buildTree),
        };
    }

    /**
     * Ensure all dependencies are loaded for a module
     * 
     * @param moduleId Module identifier
     * @throws Error if required dependencies are not loaded
     */
    ensureDependenciesLoaded(moduleId: string): void {
        const entry = this.modules.get(moduleId);
        if (!entry) {
            throw new Error(`Module ${moduleId} not found`);
        }

        const missing: string[] = [];
        const checkDependency = (dep: ModuleDependency) => {
            const depEntry = this.modules.get(dep.moduleId);
            if (!depEntry) {
                if (dep.required !== false) {
                    missing.push(dep.moduleId);
                }
                return;
            }

            if (dep.version) {
                const versionMatch = this.checkVersionRequirement(depEntry.metadata.version, dep.version);
                if (!versionMatch && dep.required !== false) {
                    missing.push(`${dep.moduleId}@${dep.version} (found ${depEntry.metadata.version})`);
                }
            }

            // Check sub-dependencies
            for (const subDep of depEntry.metadata.dependencies) {
                checkDependency(subDep);
            }
        };

        for (const dep of entry.metadata.dependencies) {
            checkDependency(dep);
        }

        if (missing.length > 0) {
            throw new Error(
                `Module ${moduleId} has missing or incompatible dependencies: ${missing.join(', ')}`
            );
        }
    }

    /**
     * Unregister a module
     * 
     * @param moduleId Module identifier
     */
    unregister(moduleId: string): void {
        const entry = this.modules.get(moduleId);
        if (!entry) {
            return;
        }

        // Remove from indexes
        const category = entry.metadata.category;
        this.modulesByCategory.get(category)?.delete(moduleId);

        for (const tag of entry.metadata.tags) {
            this.modulesByTag.get(tag)?.delete(moduleId);
        }

        const authorKey = entry.metadata.author.name.toLowerCase();
        this.modulesByAuthor.get(authorKey)?.delete(moduleId);

        // Remove from registry
        this.modules.delete(moduleId);

        logger.info(`Unregistered module: ${moduleId}`);
    }

    /**
     * Clear all registered modules
     */
    clear(): void {
        this.modules.clear();
        this.modulesByCategory.clear();
        this.modulesByTag.clear();
        this.modulesByAuthor.clear();
        logger.info('Cleared module registry');
    }

    /**
     * Get load order for modules (topological sort)
     * Returns modules in dependency order, so dependencies are loaded before dependents
     * 
     * @param moduleIds Optional list of module IDs to get load order for. If not provided, returns order for all modules.
     * @returns Array of module IDs in load order
     * @throws Error if circular dependencies are detected
     */
    getLoadOrder(moduleIds?: string[]): string[] {
        const modulesToSort = moduleIds || Array.from(this.modules.keys());
        const visited = new Set<string>();
        const visiting = new Set<string>();
        const result: string[] = [];

        const visit = (moduleId: string, path: string[]) => {
            if (visiting.has(moduleId)) {
                const cycle = [...path, moduleId].join(' -> ');
                throw new Error(`Circular dependency detected in load order: ${cycle}`);
            }

            if (visited.has(moduleId)) {
                return;
            }

            visiting.add(moduleId);
            const entry = this.modules.get(moduleId);
            
            if (entry) {
                // Visit all dependencies first
                for (const dep of entry.metadata.dependencies) {
                    if (dep.required !== false && this.modules.has(dep.moduleId)) {
                        visit(dep.moduleId, [...path, moduleId]);
                    }
                }
            }

            visiting.delete(moduleId);
            visited.add(moduleId);
            result.push(moduleId);
        };

        for (const moduleId of modulesToSort) {
            if (!visited.has(moduleId)) {
                visit(moduleId, []);
            }
        }

        return result;
    }

    /**
     * Get registry statistics
     * 
     * @returns Statistics about the registry
     */
    getStatistics() {
        const allModules = Array.from(this.modules.values());
        return {
            totalModules: allModules.length,
            publishedModules: allModules.filter(m => m.metadata.published).length,
            categories: this.modulesByCategory.size,
            tags: this.modulesByTag.size,
            authors: this.modulesByAuthor.size,
            totalUsage: allModules.reduce((sum, m) => sum + m.usageCount, 0),
        };
    }

    /**
     * Compare two version strings
     * Simple comparison (could be enhanced with semver library)
     * 
     * @param v1 First version
     * @param v2 Second version
     * @returns Negative if v1 < v2, 0 if equal, positive if v1 > v2
     */
    private compareVersions(v1: string, v2: string): number {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        const maxLength = Math.max(parts1.length, parts2.length);

        for (let i = 0; i < maxLength; i++) {
            const part1 = parts1[i] || 0;
            const part2 = parts2[i] || 0;
            if (part1 < part2) return -1;
            if (part1 > part2) return 1;
        }

        return 0;
    }

    /**
     * Check if a version satisfies a requirement
     * Simple check (could be enhanced with semver parsing)
     * 
     * @param version Version to check
     * @param requirement Version requirement (e.g., "^1.0.0", ">=2.0.0")
     * @returns Whether the version satisfies the requirement
     */
    private checkVersionRequirement(version: string, requirement: string): boolean {
        // Simple implementation - just check if version starts with requirement prefix
        // For production, use a semver library like semver
        if (requirement.startsWith('^')) {
            const reqVersion = requirement.slice(1);
            const versionParts = version.split('.');
            const reqParts = reqVersion.split('.');
            return versionParts[0] === reqParts[0] && this.compareVersions(version, reqVersion) >= 0;
        }
        if (requirement.startsWith('>=')) {
            const reqVersion = requirement.slice(2);
            return this.compareVersions(version, reqVersion) >= 0;
        }
        if (requirement.startsWith('>')) {
            const reqVersion = requirement.slice(1);
            return this.compareVersions(version, reqVersion) > 0;
        }
        // Exact match
        return version === requirement;
    }
}

/**
 * Global module registry instance
 */
export const moduleRegistry = new WorkflowModuleRegistry();

/**
 * Get the global module registry instance (singleton)
 * 
 * @returns The global WorkflowModuleRegistry instance
 */
export function getWorkflowModuleRegistry(): WorkflowModuleRegistry {
    return moduleRegistry;
}
