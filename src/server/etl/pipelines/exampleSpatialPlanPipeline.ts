#!/usr/bin/env tsx
/**
 * Example: Loading a Spatial Plan into GraphDB
 * 
 * Demonstrates how to load urban planning data using the up: vocabulary.
 * 
 * Usage: tsx src/server/etl/pipelines/exampleSpatialPlanPipeline.ts
 */

import { connectGraphDB, getGraphDBClient } from '../../config/graphdb.js';
import { loadRDFTriples } from '../loaders/graphdbLoader.js';

/**
 * Create RDF for an example spatial plan
 */
function createSpatialPlanRDF(): string {
  const planId = 'omgevingsplan-amsterdam-centrum-2024';
  const planUri = `http://data.example.org/id/plan/${planId}`;
  const zoningAreaUri = `http://data.example.org/id/zoning/${planId}/centrum`;
  const regulationUri = `http://data.example.org/id/regulation/${planId}/hoogte`;
  
  return `
    @prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .
    @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
    @prefix dct: <http://purl.org/dc/terms/> .
    @prefix geo: <http://www.opengis.net/ont/geosparql#> .
    @prefix up: <http://data.example.org/def/up#> .
    @prefix law: <http://data.example.org/def/law#> .
    @prefix kg: <http://data.example.org/def/kg#> .
    @prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
    
    # Spatial Plan
    <${planUri}> a up:SpatialPlan ;
        rdfs:label "Omgevingsplan Amsterdam Centrum 2024"@nl ;
        dct:title "Omgevingsplan Amsterdam Centrum 2024" ;
        up:planType "omgevingsplan" ;
        up:issuedBy <http://data.example.org/id/authority/gemeente-amsterdam> ;
        up:hasZoningArea <${zoningAreaUri}> ;
        up:definesRegulation <${regulationUri}> ;
        kg:validFrom "2024-01-01T00:00:00Z"^^xsd:dateTime .
    
    # Zoning Area
    <${zoningAreaUri}> a up:ZoningArea ;
        rdfs:label "Centrumgebied"@nl ;
        geo:hasGeometry [
            geo:asWKT "POLYGON((4.89 52.37, 4.91 52.37, 4.91 52.38, 4.89 52.38, 4.89 52.37))"^^geo:wktLiteral
        ] ;
        up:allowsActivity <http://data.example.org/id/activity/wonen> ;
        up:allowsActivity <http://data.example.org/id/activity/kantoor> .
    
    # Planning Regulation (height limit)
    <${regulationUri}> a up:PlanningRegulation ;
        rdfs:label "Maximale bouwhoogte Centrum"@nl ;
        up:maxHeight "30.0"^^xsd:decimal ;
        up:appliesTo <${zoningAreaUri}> .
    
    # Authority
    <http://data.example.org/id/authority/gemeente-amsterdam> a law:Authority ;
        rdfs:label "Gemeente Amsterdam"@nl ;
        law:providerName "Gemeente Amsterdam" .
  `;
}

async function main() {
  console.log('🏗️  Example: Loading Spatial Plan into GraphDB\n');

  try {
    await connectGraphDB();
    const client = getGraphDBClient();

    // Load the spatial plan
    const rdf = createSpatialPlanRDF();
    await loadRDFTriples(rdf, {
      graphUri: 'http://data.example.org/graph/plans/amsterdam',
    });

    console.log('✅ Spatial plan loaded!\n');

    // Query with reasoning (RDFS+)
    console.log('Querying with RDFS+ reasoning...\n');
    const query = `
      PREFIX up: <http://data.example.org/def/up#>
      PREFIX geo: <http://www.opengis.net/ont/geosparql#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?plan ?label ?height WHERE {
        ?plan a up:SpatialPlan ;
              rdfs:label ?label ;
              up:definesRegulation ?reg .
        ?reg up:maxHeight ?height .
      }
    `;

    const results = await client.query(query);
    console.log(`✅ Found ${results.length} spatial plan(s):\n`);
    results.forEach((result: Record<string, string>, index: number) => {
      console.log(`   ${index + 1}. ${result.label}`);
      console.log(`      Max height: ${result.height} meters`);
      console.log(`      Plan URI: ${result.plan}\n`);
    });

    // GeoSPARQL query example
    console.log('Testing GeoSPARQL query...\n');
    const geoQuery = `
      PREFIX geo: <http://www.opengis.net/ont/geosparql#>
      PREFIX geof: <http://www.opengis.net/def/function/geosparql/>
      PREFIX up: <http://data.example.org/def/up#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      
      SELECT ?area ?label WHERE {
        ?area a up:ZoningArea ;
              rdfs:label ?label ;
              geo:hasGeometry ?geom .
        ?geom geo:asWKT ?wkt .
        
        FILTER (geof:sfIntersects(?wkt, "POINT(4.90 52.375)"^^geo:wktLiteral))
      }
    `;

    const geoResults = await client.query(geoQuery);
    console.log(`✅ Found ${geoResults.length} zoning area(s) at point:\n`);
    geoResults.forEach((result: Record<string, string>) => {
      console.log(`   - ${result.label} (${result.area})\n`);
    });

    console.log('✅ Example pipeline completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Pipeline failed:', error);
    process.exit(1);
  }
}

main();

