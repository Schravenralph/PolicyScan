/**
 * Data Processing Workflow Template
 * 
 * A template for processing and analyzing scraped data.
 * This template focuses on data extraction, transformation, and analysis.
 */

import { Workflow } from '../../services/infrastructure/types.js';

export interface DataProcessingTemplateParams {
  extractMetadata?: boolean;
  extractEntities?: boolean;
  extractRelationships?: boolean;
  generateEmbeddings?: boolean;
  analyzeContent?: boolean;
  maxDocuments?: number;
}

/**
 * Create a data processing workflow from template
 */
export function createDataProcessingWorkflow(
  params: DataProcessingTemplateParams = {}
): Workflow {
  const {
    extractMetadata = true,
    extractEntities = false,
    extractRelationships = false,
    generateEmbeddings = true,
    analyzeContent = true,
    maxDocuments = 1000
  } = params;

  const steps: Workflow['steps'] = [];

  // Step 1: Initialize processing
  steps.push({
    id: 'initialize',
    name: 'Initialize Data Processing',
    action: 'initialize_processing',
    params: {
      maxDocuments
    },
    next: 'extract-metadata'
  });

  // Step 2: Extract metadata (if enabled)
  if (extractMetadata) {
    steps.push({
      id: 'extract-metadata',
      name: 'Extract Document Metadata',
      action: 'extract_metadata',
      next: extractEntities ? 'extract-entities' : generateEmbeddings ? 'generate-embeddings' : analyzeContent ? 'analyze-content' : 'finalize'
    });
  }

  // Step 3: Extract entities (if enabled)
  if (extractEntities) {
    steps.push({
      id: 'extract-entities',
      name: 'Extract Entities',
      action: 'extract_entities',
      next: extractRelationships ? 'extract-relationships' : generateEmbeddings ? 'generate-embeddings' : analyzeContent ? 'analyze-content' : 'finalize'
    });
  }

  // Step 4: Extract relationships (if enabled)
  if (extractRelationships) {
    steps.push({
      id: 'extract-relationships',
      name: 'Extract Relationships',
      action: 'extract_relationships',
      next: generateEmbeddings ? 'generate-embeddings' : analyzeContent ? 'analyze-content' : 'finalize'
    });
  }

  // Step 5: Generate embeddings (if enabled)
  if (generateEmbeddings) {
    steps.push({
      id: 'generate-embeddings',
      name: 'Generate Document Embeddings',
      action: 'generate_embeddings',
      next: analyzeContent ? 'analyze-content' : 'finalize'
    });
  }

  // Step 6: Analyze content (if enabled)
  if (analyzeContent) {
    steps.push({
      id: 'analyze-content',
      name: 'Analyze Content',
      action: 'analyze_content',
      next: 'finalize'
    });
  }

  // Step 7: Finalize processing
  steps.push({
    id: 'finalize',
    name: 'Finalize Data Processing',
    action: 'finalize_processing'
  });

  // Set next pointers
  for (let i = 0; i < steps.length - 1; i++) {
    if (!steps[i].next) {
      steps[i].next = steps[i + 1].id;
    }
  }

  return {
    id: `data-processing-${Date.now()}`,
    name: 'Data Processing Workflow',
    description: 'Data processing and analysis workflow',
    steps
  };
}

/**
 * Default data processing workflow instance
 */
export const defaultDataProcessingWorkflow = createDataProcessingWorkflow();














