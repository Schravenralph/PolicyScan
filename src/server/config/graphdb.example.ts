/**
 * Example usage of GraphDB client
 * 
 * This demonstrates how to use the GraphDB client for SPARQL queries
 * aligned with the RDF/OWL + GeoSPARQL + PROV-O architecture.
 */

import { getGraphDBClient } from './graphdb.js';

/**
 * Example: Query for spatial plans using GeoSPARQL
 */
export async function querySpatialPlans(geometryWKT: string) {
  const client = getGraphDBClient();

  const query = `
    PREFIX geo: <http://www.opengis.net/ont/geosparql#>
    PREFIX up: <http://data.example.org/def/up#>
    PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
    
    SELECT ?plan ?planLabel ?geometry
    WHERE {
      ?plan rdf:type up:SpatialPlan ;
            rdfs:label ?planLabel ;
            geo:hasGeometry ?geometry .
      
      ?geometry geo:asWKT ?planWKT .
      
      FILTER (geof:sfIntersects(?planWKT, "${geometryWKT}"^^geo:wktLiteral))
    }
  `;

  return await client.query(query);
}

/**
 * Example: Insert RDF triples for a legal provision
 */
export async function insertLegalProvision(
  provisionUri: string,
  title: string,
  validFrom: string
) {
  const client = getGraphDBClient();

  const updateQuery = `
    PREFIX law: <http://data.example.org/def/law#>
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX kg: <http://data.example.org/def/kg#>
    
    INSERT DATA {
      <${provisionUri}> rdf:type law:LegalProvision ;
                        dct:title "${title}" ;
                        kg:validFrom "${validFrom}"^^xsd:date .
    }
  `;

  await client.update(updateQuery);
}

/**
 * Example: Load ontology file (Turtle format)
 */
export async function loadOntology(turtleContent: string, graphUri: string) {
  const client = getGraphDBClient();

  await client.loadRDF(
    turtleContent,
    'text/turtle',
    graphUri
  );
}

/**
 * Example: Query with reasoning (RDFS/OWL)
 * 
 * GraphDB will automatically infer subclasses and subproperties
 */
export async function queryWithReasoning() {
  const client = getGraphDBClient();

  const query = `
    PREFIX up: <http://data.example.org/def/up#>
    PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
    
    # This will also return instances of subclasses of up:SpatialPlan
    SELECT ?plan ?type
    WHERE {
      ?plan rdf:type ?type .
      ?type rdfs:subClassOf* up:SpatialPlan .
    }
  `;

  return await client.query(query);
}

// Usage example:
// 
// // Connect once at application startup
// await connectGraphDB();
// 
// // Use the client throughout your application
// const plans = await querySpatialPlans('POINT(4.9 52.37)');
// console.log('Found plans:', plans);

