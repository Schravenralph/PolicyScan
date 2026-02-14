/**
 * API routes for GPT-enhanced SPARQL queries on ontologies
 * 
 * Provides endpoints for:
 * - Generating explanations for ontology classes
 * - Generating explanations for ontology properties
 * - Executing custom GPT-enhanced SPARQL queries
 */

import express from 'express';
import { getOntologyGPTService } from '../services/external/OntologyGPTService.js';
import { connectGraphDB } from '../config/graphdb.js';
import { asyncHandler } from '../utils/errorHandling.js';
import { BadRequestError } from '../types/errors.js';

const router = express.Router();

// Ensure GraphDB is connected
router.use(asyncHandler(async (_req, _res, next) => {
  await connectGraphDB();
  next();
}));

/**
 * GET /api/ontology/explain/classes
 * Generate GPT-powered explanations for ontology classes
 * 
 * Query parameters:
 * - graph: Named graph URI (default: http://data.ruimtemeesters.nl/ontologies/base)
 * - limit: Maximum number of classes to explain (default: 20)
 * - lang: Language for explanations ('nl' or 'en', default: 'nl')
 */
router.get('/explain/classes', asyncHandler(async (req, res) => {
  const graph = (req.query.graph as string) || 'http://data.ruimtemeesters.nl/ontologies/base';
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const lang = ((req.query.lang as string) || 'nl') as 'nl' | 'en';

  if (lang !== 'nl' && lang !== 'en') {
    throw new BadRequestError("Language must be 'nl' or 'en'");
  }

  const service = getOntologyGPTService();
  const explanations = await service.explainOntologyClasses(graph, limit, lang);

  res.json({
    graph,
    limit,
    language: lang,
    count: explanations.length,
    explanations,
  });
}));

/**
 * GET /api/ontology/explain/properties
 * Generate GPT-powered explanations for ontology properties
 * 
 * Query parameters:
 * - graph: Named graph URI (default: http://data.ruimtemeesters.nl/ontologies/base)
 * - limit: Maximum number of properties to explain (default: 20)
 * - lang: Language for explanations ('nl' or 'en', default: 'nl')
 */
router.get('/explain/properties', asyncHandler(async (req, res) => {
  const graph = (req.query.graph as string) || 'http://data.ruimtemeesters.nl/ontologies/base';
  const limit = parseInt((req.query.limit as string) || '20', 10);
  const lang = ((req.query.lang as string) || 'nl') as 'nl' | 'en';

  if (lang !== 'nl' && lang !== 'en') {
    throw new BadRequestError("Language must be 'nl' or 'en'");
  }

  const service = getOntologyGPTService();
  const explanations = await service.explainOntologyProperties(graph, limit, lang);

  res.json({
    graph,
    limit,
    language: lang,
    count: explanations.length,
    explanations,
  });
}));

/**
 * GET /api/ontology/explain/class/:classUri
 * Generate explanation for a specific ontology class
 * 
 * Query parameters:
 * - graph: Named graph URI (default: http://data.ruimtemeesters.nl/ontologies/base)
 * - lang: Language for explanation ('nl' or 'en', default: 'nl')
 */
router.get('/explain/class/:classUri', asyncHandler(async (req, res) => {
  const classUri = decodeURIComponent(req.params.classUri);
  const graph = (req.query.graph as string) || 'http://data.ruimtemeesters.nl/ontologies/base';
  const lang = ((req.query.lang as string) || 'nl') as 'nl' | 'en';

  if (lang !== 'nl' && lang !== 'en') {
    throw new BadRequestError("Language must be 'nl' or 'en'");
  }

  const service = getOntologyGPTService();
  const explanation = await service.explainClass(classUri, graph, lang);

  res.json({
    class: classUri,
    graph,
    language: lang,
    explanation,
  });
}));

/**
 * POST /api/ontology/query
 * Execute a custom SPARQL query with GPT predicates
 * 
 * Body:
 * {
 *   "query": "SPARQL query string",
 *   "graph": "optional named graph URI"
 * }
 */
router.post('/query', asyncHandler(async (req, res) => {
  const { query, graph } = req.body;

  if (!query || typeof query !== 'string') {
    throw new BadRequestError('Query parameter is required and must be a string');
  }

  const service = getOntologyGPTService();
  
  // If graph is specified, wrap query in GRAPH clause
  let finalQuery = query;
  if (graph && typeof graph === 'string') {
    // Simple approach: prepend GRAPH clause if not already present
    if (!query.toUpperCase().includes('GRAPH')) {
      finalQuery = `PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
PREFIX owl: <http://www.w3.org/2002/07/owl#>
PREFIX gpt: <http://www.ontotext.com/plugins/gpt#>

${query.replace(/WHERE\s*\{/i, `WHERE {
  GRAPH <${graph}> {`).replace(/\}\s*$/, `  }
}`)}`;
    }
  }

  const results = await service.executeGPTQuery(finalQuery);

  res.json({
    query: finalQuery,
    graph: graph || null,
    count: results.length,
    results,
  });
}));

/**
 * GET /api/ontology/graphs
 * List all named graphs containing ontologies
 */
router.get('/graphs', asyncHandler(async (_req, res) => {
  const service = getOntologyGPTService();
  const graphs = await service.listOntologyGraphs();

  res.json({
    count: graphs.length,
    graphs,
  });
}));

export default router;

