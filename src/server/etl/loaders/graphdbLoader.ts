/**
 * GraphDB RDF Loader
 * 
 * Handles loading RDF data into GraphDB with proper named graph assignment
 * and batch processing for performance.
 * 
 * Supports named graph strategy:
 * - `doc:{documentId}` for document facts
 * - `prov:{runId}` for provenance
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/12-etl-graphdb.md
 */

import { getGraphDBClient } from '../../config/graphdb.js';
import { logger } from '../../utils/logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface LoadOptions {
  graphUri?: string;
  batchSize?: number;
  repository?: string;
}

/**
 * Named graph URI generators
 */
export function getDocumentGraphUri(documentId: string): string {
  return `http://data.example.org/graph/doc/${documentId}`;
}

export function getProvenanceGraphUri(runId: string): string {
  return `http://data.example.org/graph/prov/${runId}`;
}

/**
 * Load RDF triples (Turtle format) into GraphDB
 */
export async function loadRDFTriples(
  turtleContent: string,
  options: LoadOptions = {}
): Promise<void> {
  const client = getGraphDBClient();
  await client.loadRDF(
    turtleContent,
    'text/turtle',
    options.graphUri,
    options.repository
  );
}

/**
 * Load RDF triples from file into GraphDB
 */
export async function loadRDFFromFile(
  filePath: string,
  options: LoadOptions = {}
): Promise<void> {
  const content = await fs.readFile(filePath, 'utf-8');
  await loadRDFTriples(content, options);
}

/**
 * Load RDF triples from multiple sources in batches
 */
export async function loadRDFBatch(
  turtleContents: string[],
  graphUri: string,
  options: { batchSize?: number; repository?: string } = {}
): Promise<void> {
  const batchSize = options.batchSize || 10;
  const client = getGraphDBClient();

  for (let i = 0; i < turtleContents.length; i += batchSize) {
    const batch = turtleContents.slice(i, i + batchSize);
    const combinedTurtle = batch.join('\n\n');

    await client.loadRDF(
      combinedTurtle,
      'text/turtle',
      graphUri,
      options.repository
    );

    logger.debug({
      batch: Math.floor(i / batchSize) + 1,
      totalBatches: Math.ceil(turtleContents.length / batchSize),
    }, 'Loaded RDF batch');
  }
}

/**
 * Load ETL run output into GraphDB with named graphs
 * 
 * Loads document Turtle files into `doc:{documentId}` graphs
 * and provenance file into `prov:{runId}` graph.
 */
export async function loadETLRunOutput(
  runId: string,
  turtleFiles: string[],
  _manifestPath?: string
): Promise<{
  documentsLoaded: number;
  provenanceLoaded: boolean;
}> {
  const _client = getGraphDBClient();
  let documentsLoaded = 0;
  let provenanceLoaded = false;

  for (const filePath of turtleFiles) {
    const fileName = path.basename(filePath);
    
    // Check if this is a provenance file
    if (fileName === 'provenance.ttl' || fileName.includes('provenance')) {
      const provGraphUri = getProvenanceGraphUri(runId);
      await loadRDFFromFile(filePath, { graphUri: provGraphUri });
      provenanceLoaded = true;
      logger.debug({ runId, filePath }, 'Loaded provenance graph');
    } else if (fileName.startsWith('doc_')) {
      // Extract document ID from filename (doc_{documentId}.ttl)
      const docIdMatch = fileName.match(/^doc_(.+)\.ttl$/);
      if (docIdMatch) {
        const documentId = docIdMatch[1];
        const docGraphUri = getDocumentGraphUri(documentId);
        await loadRDFFromFile(filePath, { graphUri: docGraphUri });
        documentsLoaded++;
        logger.debug({ runId, documentId, filePath }, 'Loaded document graph');
      }
    } else {
      // Unknown file type - load into default graph
      await loadRDFFromFile(filePath);
      logger.debug({ runId, filePath }, 'Loaded into default graph');
    }
  }

  return { documentsLoaded, provenanceLoaded };
}

/**
 * Load triples using SPARQL INSERT (for programmatic insertion)
 */
export async function insertTriples(
  triples: Array<{ subject: string; predicate: string; object: string }>,
  graphUri?: string
): Promise<void> {
  const client = getGraphDBClient();

  // Build SPARQL INSERT query
  const triplePatterns = triples
    .map((t) => `<${t.subject}> <${t.predicate}> <${t.object}> .`)
    .join('\n    ');

  const graphClause = graphUri ? `GRAPH <${graphUri}> {` : '';
  const graphClose = graphUri ? '}' : '';

  const insertQuery = `
    INSERT DATA {
      ${graphClause}
      ${triplePatterns}
      ${graphClose}
    }
  `;

  await client.update(insertQuery);
}

/**
 * Check if a named graph exists in GraphDB
 */
export async function graphExists(graphUri: string): Promise<boolean> {
  const client = getGraphDBClient();
  
  // Query for any triples in the graph
  const query = `
    ASK {
      GRAPH <${graphUri}> {
        ?s ?p ?o .
      }
    }
  `;
  
  try {
    const result = await client.query(query);
    // Result format depends on GraphDB client - adjust as needed
    // GraphDB query result may have different structures
    if (result && typeof result === 'object') {
      const resultObj = result as unknown as Record<string, unknown>;
      if ('boolean' in resultObj && typeof resultObj.boolean === 'boolean') {
        return resultObj.boolean;
      }
      // Try other common result formats
      if ('results' in resultObj && Array.isArray(resultObj.results)) {
        return (resultObj.results as unknown[]).length > 0;
      }
    }
    return false;
  } catch (error) {
    logger.error({ error, graphUri }, 'Failed to check graph existence');
    return false;
  }
}

/**
 * Delete a named graph from GraphDB
 */
export async function deleteGraph(graphUri: string): Promise<void> {
  const client = getGraphDBClient();
  
  const update = `
    DROP GRAPH <${graphUri}>
  `;
  
  await client.update(update);
  logger.debug({ graphUri }, 'Deleted graph');
}

