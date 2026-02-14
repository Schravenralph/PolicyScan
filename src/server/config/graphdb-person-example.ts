/**
 * Example: Person repository using GraphDB official driver
 * 
 * This demonstrates the pattern from the user's example:
 * - Inserting RDF triples
 * - Querying with SPARQL
 * - Using the GraphDBClient wrapper (recommended approach)
 */

import { getGraphDBClient, getRepositoryClient, jsonParser } from './graphdb.js';
import graphdb from 'graphdb';

const PREFIXES = `
  PREFIX ex: <http://example.com/>
  PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
`;

export type Person = {
  iri: string;
  name: string;
};

/**
 * Insert a person into the knowledge graph
 * Uses GraphDBClient (recommended - simpler API)
 */
export async function insertPerson(id: string, name: string): Promise<void> {
  const client = getGraphDBClient();

  const update = `
    ${PREFIXES}
    INSERT DATA {
      ex:${id} rdf:type ex:Person ;
               ex:name "${name}" .
    }
  `;

  await client.update(update);
}

/**
 * Find persons by name
 * Uses GraphDBClient (recommended - simpler API, returns parsed results)
 */
export async function findPersonsByName(name: string): Promise<Person[]> {
  const client = getGraphDBClient();

  const query = `
    ${PREFIXES}
    SELECT ?person ?name WHERE {
      ?person rdf:type ex:Person ;
              ex:name ?name .
      FILTER(?name = "${name}")
    }
  `;

  // GraphDBClient.query() returns parsed results directly
  const results = await client.query(query);

  return results.map((result) => ({
    iri: result.person,
    name: result.name,
  }));
}

/**
 * Alternative: Find persons using RDFRepositoryClient with parser
 * This demonstrates using the official graphdb.js driver directly with the parser
 */
export async function findPersonsByNameWithParser(name: string): Promise<Person[]> {
  const repoClient = getRepositoryClient();

  const query = `
    ${PREFIXES}
    SELECT ?person ?name WHERE {
      ?person rdf:type ex:Person ;
              ex:name ?name .
      FILTER(?name = "${name}")
    }
  `;

  // Use the official graphdb.js query API
  const GetQueryPayload = graphdb.query.GetQueryPayload;
  const QueryType = graphdb.query.QueryType;
  const RDFMimeType = graphdb.http.RDFMimeType;

  const payload = new GetQueryPayload()
    .setQuery(query)
    .setQueryType(QueryType.SELECT)
    .setResponseType(RDFMimeType.SPARQL_RESULTS_JSON);

  const stream = await repoClient.query(payload);
  // Parse the stream using the parser with the correct query type
  // The parser will be initialized automatically with retry logic
  const bindings = await jsonParser.parseToBindings(stream, QueryType.SELECT);

  // The parser returns Record<string, unknown>[], where each binding has variable names as keys
  // SPARQL JSON results have values as objects with a 'value' property
  return bindings.map((b: Record<string, unknown>) => {
    // Handle both cases: bindings with get() method or direct property access
    const getValue = (key: string): string => {
      const binding = b[key];
      if (binding && typeof binding === 'object' && 'value' in binding) {
        return String((binding as { value: string }).value);
      }
      return String(binding);
    };
    
    return {
      iri: getValue('person'),
      name: getValue('name'),
    };
  });
}

/**
 * Example usage:
 * 
 * // Make sure GraphDB is connected first
 * const { connectGraphDB } = await import('./graphdb.js');
 * await connectGraphDB();
 * 
 * await insertPerson('alice', 'Alice');
 * await insertPerson('bob', 'Bob');
 * 
 * const results = await findPersonsByName('Alice');
 * console.log('Found persons:', results);
 */

