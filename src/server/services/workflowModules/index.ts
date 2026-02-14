/**
 * Workflow Modules
 * 
 * Exports all workflow module implementations.
 */

export { DiscoverSourcesModule } from './DiscoverSourcesModule.js';
export { CrawlPagesModule } from './CrawlPagesModule.js';
export { ExtractMetadataModule } from './ExtractMetadataModule.js';
export { ConvertToMarkdownModule } from './ConvertToMarkdownModule.js';
export { RankResultsModule } from './RankResultsModule.js';
export { StoreDocumentsModule } from './StoreDocumentsModule.js';

/**
 * Initialize and register all default workflow modules
 * 
 * This function creates instances of all default modules and registers them
 * with the module registry. Call this during application startup.
 */
import { moduleRegistry } from '../workflow/WorkflowModuleRegistry.js';
import { DiscoverSourcesModule } from './DiscoverSourcesModule.js';
import { CrawlPagesModule } from './CrawlPagesModule.js';
import { ExtractMetadataModule } from './ExtractMetadataModule.js';
import { ConvertToMarkdownModule } from './ConvertToMarkdownModule.js';
import { RankResultsModule } from './RankResultsModule.js';
import { StoreDocumentsModule } from './StoreDocumentsModule.js';

export function registerDefaultModules(): void {
    // Create module instances
    const discoverSources = new DiscoverSourcesModule();
    const crawlPages = new CrawlPagesModule();
    const extractMetadata = new ExtractMetadataModule();
    const convertToMarkdown = new ConvertToMarkdownModule();
    const rankResults = new RankResultsModule();
    const storeDocuments = new StoreDocumentsModule();

    // Register all modules
    moduleRegistry.register(discoverSources, discoverSources.getMetadata(), false);
    moduleRegistry.register(crawlPages, crawlPages.getMetadata(), false);
    moduleRegistry.register(extractMetadata, extractMetadata.getMetadata(), false);
    moduleRegistry.register(convertToMarkdown, convertToMarkdown.getMetadata(), false);
    moduleRegistry.register(rankResults, rankResults.getMetadata(), false);
    moduleRegistry.register(storeDocuments, storeDocuments.getMetadata(), false);
}














