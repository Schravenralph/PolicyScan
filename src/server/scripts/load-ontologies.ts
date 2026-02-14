#!/usr/bin/env tsx
/**
 * Load custom vocabularies and external ontologies into GraphDB
 * 
 * Usage: tsx src/server/scripts/load-ontologies.ts
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { connectGraphDB, getGraphDBClient } from '../config/graphdb.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ontologiesDir = join(__dirname, '../ontologies');

// External ontology URLs (to download and load)
const EXTERNAL_ONTOLOGIES = [
  {
    name: 'GeoSPARQL',
    url: 'https://raw.githubusercontent.com/opengeospatial/ogc-geosparql/master/11.0/geosparql.ttl',
    graphUri: 'http://data.example.org/graph/geosparql',
    contentType: 'text/turtle' as const,
    fallbackUrls: [
      'https://raw.githubusercontent.com/opengeospatial/ogc-geosparql/master/geosparql.ttl',
      'http://www.opengis.net/ont/geosparql',
    ],
  },
  {
    name: 'PROV-O',
    url: 'https://www.w3.org/ns/prov-o',
    graphUri: 'http://data.example.org/graph/prov',
    contentType: 'text/turtle' as const,
  },
  {
    name: 'ELI',
    url: 'https://raw.githubusercontent.com/SEMICeu/ELI-ontology/master/eli.ttl',
    graphUri: 'http://data.example.org/graph/eli',
    contentType: 'text/turtle' as const,
    fallbackUrls: [
      'https://data.europa.eu/eli/ontology',
      'https://raw.githubusercontent.com/SEMICeu/ELI-ontology/main/eli.ttl',
    ],
  },
  {
    name: 'NEN3610',
    url: 'https://www.geonovum.nl/geo-standaarden/nen-3610',
    graphUri: 'http://data.example.org/graph/nen3610',
    contentType: 'text/turtle' as const,
    note: 'NEN3610 may need to be downloaded manually from Geonovum or NEN website. Check: https://www.geonovum.nl/geo-standaarden/nen-3610',
  },
  {
    name: 'OWMS',
    url: 'https://standaarden.overheid.nl/owms/terms/',
    graphUri: 'http://data.example.org/graph/owms',
    contentType: 'text/turtle' as const,
    fallbackUrls: [
      'https://standaarden.overheid.nl/owms/terms/owms-4.0.ttl',
      'https://standaarden.overheid.nl/owms/terms/owms.ttl',
    ],
    note: 'OWMS may need to be accessed via the Overheid.nl standards portal',
  },
];

async function loadLocalOntology(fileName: string, graphUri: string) {
  const filePath = join(ontologiesDir, fileName);
  console.log(`Loading ${fileName} into graph ${graphUri}...`);
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const client = getGraphDBClient();
    await client.loadRDF(content, 'text/turtle', graphUri);
    console.log(`✅ Loaded ${fileName}\n`);
  } catch (error) {
    console.error(`❌ Failed to load ${fileName}:`, error);
    throw error;
  }
}

async function downloadAndLoadOntology(
  url: string,
  graphUri: string,
  name: string,
  contentType: 'text/turtle' | 'application/rdf+xml' | 'text/n3' | 'application/n-triples' = 'text/turtle',
  fallbackUrls?: string[],
  note?: string
) {
  const urlsToTry = [url, ...(fallbackUrls || [])];
  
  for (const tryUrl of urlsToTry) {
    console.log(`Downloading ${name} from ${tryUrl}...`);
    
    try {
      const response = await fetch(tryUrl, {
        headers: {
          'Accept': contentType === 'text/turtle' ? 'text/turtle, application/turtle' : 'application/rdf+xml',
        },
      });
      
      if (!response.ok) {
        if (tryUrl === urlsToTry[urlsToTry.length - 1]) {
          // Last URL failed
          throw new Error(`Failed to download ${name}: ${response.status} ${response.statusText}`);
        }
        // Try next URL
        console.log(`   ⚠️  ${tryUrl} failed, trying next URL...`);
        continue;
      }
      
      const content = await response.text();
      
      // Detect content type from response if available
      const detectedContentType = response.headers.get('content-type')?.split(';')[0] || contentType;
      let finalContentType = contentType;
      
      if (detectedContentType.includes('turtle') || detectedContentType.includes('text/turtle')) {
        finalContentType = 'text/turtle';
      } else if (detectedContentType.includes('rdf+xml') || detectedContentType.includes('application/rdf+xml')) {
        finalContentType = 'application/rdf+xml';
      }
      
      const client = getGraphDBClient();
      await client.loadRDF(content, finalContentType, graphUri);
      console.log(`✅ Loaded ${name}\n`);
      return; // Success!
    } catch (error) {
      if (tryUrl === urlsToTry[urlsToTry.length - 1]) {
        // Last URL failed
        console.error(`❌ Failed to load ${name}:`, error);
        if (note) {
          console.log(`   ℹ️  ${note}`);
        }
        console.log(`   You may need to download it manually and place it in ${ontologiesDir}/`);
        console.log(`   Or import it via GraphDB Workbench: Import > User data > Get RDF data from a URL\n`);
        // Don't throw - external ontologies are optional
        return;
      }
      // Continue to next URL
    }
  }
}

async function main() {
  console.log('📚 Loading ontologies into GraphDB...\n');

  // Check if --unified flag is provided to load all ontologies into a single graph
  const unifiedGraph = process.argv.includes('--unified');
  const baseOntologyGraph = 'http://data.ruimtemeesters.nl/ontologies/base';

  try {
    // Connect to GraphDB
    await connectGraphDB();
    const client = getGraphDBClient();

    // Load custom vocabularies
    console.log('1. Loading custom vocabularies...\n');
    const vocabGraph = unifiedGraph ? baseOntologyGraph : 'http://data.example.org/graph/vocab/up';
    await loadLocalOntology('up-vocabulary.ttl', vocabGraph);
    
    if (!unifiedGraph) {
      await loadLocalOntology('law-vocabulary.ttl', 'http://data.example.org/graph/vocab/law');
      await loadLocalOntology('aid-vocabulary.ttl', 'http://data.example.org/graph/vocab/aid');
      await loadLocalOntology('doc-vocabulary.ttl', 'http://data.example.org/graph/vocab/doc');
      await loadLocalOntology('kg-vocabulary.ttl', 'http://data.example.org/graph/vocab/kg');
    } else {
      // Load all vocabularies into the unified graph
      await loadLocalOntology('law-vocabulary.ttl', baseOntologyGraph);
      await loadLocalOntology('aid-vocabulary.ttl', baseOntologyGraph);
      await loadLocalOntology('doc-vocabulary.ttl', baseOntologyGraph);
      await loadLocalOntology('kg-vocabulary.ttl', baseOntologyGraph);
      console.log(`   ✅ All vocabularies loaded into unified graph: ${baseOntologyGraph}\n`);
    }

    // Load Dutch government ontologies (TOOI, ELI, CCW, SCW)
    console.log('1b. Loading Dutch government ontologies...\n');
    const govGraph = unifiedGraph ? baseOntologyGraph : 'http://data.ruimtemeesters.nl/ontologies/dutch-gov';
    
    // ELI (European Legislation Identifier)
    await loadLocalOntology('eli-ontology.ttl', govGraph);
    
    // TOOI series (Dutch government ontologies)
    await loadLocalOntology('tooikern.ttl', govGraph);
    await loadLocalOntology('tooiont.ttl', govGraph);
    await loadLocalOntology('tooibwb.ttl', govGraph);
    await loadLocalOntology('tooiwep.ttl', govGraph);
    await loadLocalOntology('tooitop.ttl', govGraph);
    await loadLocalOntology('tooiwl.ttl', govGraph);
    await loadLocalOntology('tooixtrn.ttl', govGraph);
    
    // CCW (Common Crawl/Web ontologies)
    await loadLocalOntology('ccw_plooi_documentsoorten_7.ttl', govGraph);
    
    // SCW (Semantic Crawl/Web ontologies)
    await loadLocalOntology('scw_publicatiebladen_1.ttl', govGraph);
    
    if (unifiedGraph) {
      console.log(`   ✅ All Dutch government ontologies loaded into unified graph: ${baseOntologyGraph}\n`);
    }

    // Load external ontologies
    console.log('2. Loading external ontologies...\n');
    for (const ontology of EXTERNAL_ONTOLOGIES) {
      const targetGraph = unifiedGraph ? baseOntologyGraph : ontology.graphUri;
      await downloadAndLoadOntology(
        ontology.url,
        targetGraph,
        ontology.name,
        ontology.contentType,
        ontology.fallbackUrls,
        ontology.note
      );
    }

    if (unifiedGraph) {
      console.log(`\n   ✅ All ontologies loaded into unified graph: ${baseOntologyGraph}`);
      console.log('   This graph can be used with GPT SPARQL queries and TTYG agent.\n');
    }

    // Verify loaded ontologies
    console.log('3. Verifying loaded ontologies...\n');
    
    // Verify custom vocabularies
    const verifyCustomQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
      PREFIX owl: <http://www.w3.org/2002/07/owl#>
      PREFIX up: <http://data.example.org/def/up#>
      PREFIX law: <http://data.example.org/def/law#>
      PREFIX aid: <http://data.example.org/def/aid#>
      PREFIX doc: <http://data.example.org/def/doc#>
      
      SELECT ?class (SAMPLE(?label) AS ?label) WHERE {
        ?class rdf:type owl:Class .
        OPTIONAL { ?class rdfs:label ?label }
        FILTER (
          STRSTARTS(STR(?class), "http://data.example.org/def/up#") ||
          STRSTARTS(STR(?class), "http://data.example.org/def/law#") ||
          STRSTARTS(STR(?class), "http://data.example.org/def/aid#") ||
          STRSTARTS(STR(?class), "http://data.example.org/def/doc#")
        )
      }
      GROUP BY ?class
      ORDER BY ?class
      LIMIT 50
    `;

    const customResults = await client.query(verifyCustomQuery);
    console.log(`✅ Found ${customResults.length} custom vocabulary classes:\n`);
    customResults.forEach((result: Record<string, string>, index: number) => {
      const className = result.class.split('#').pop() || result.class.split('/').pop();
      console.log(`   ${index + 1}. ${className}${result.label ? ` - ${result.label}` : ''}`);
    });

    // Verify external ontologies
    console.log('\n4. Verifying external ontologies...\n');
    const verifyExternalQuery = `
      PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
      PREFIX owl: <http://www.w3.org/2002/07/owl#>
      PREFIX geo: <http://www.opengis.net/ont/geosparql#>
      PREFIX prov: <http://www.w3.org/ns/prov#>
      PREFIX eli: <http://data.europa.eu/eli/ontology#>
      PREFIX owms: <http://purl.org/court/def/2009/owms#>
      
      SELECT ?ontology (COUNT(DISTINCT ?class) AS ?classCount) WHERE {
        {
          SELECT ?ontology ?class WHERE {
            GRAPH ?g {
              ?class rdf:type owl:Class .
              BIND(?g AS ?ontology)
            }
            FILTER (
              STRSTARTS(STR(?g), "http://data.example.org/graph/geosparql") ||
              STRSTARTS(STR(?g), "http://data.example.org/graph/prov") ||
              STRSTARTS(STR(?g), "http://data.example.org/graph/eli") ||
              STRSTARTS(STR(?g), "http://data.example.org/graph/owms") ||
              STRSTARTS(STR(?g), "http://data.example.org/graph/nen3610")
            )
          }
        }
      }
      GROUP BY ?ontology
      ORDER BY ?ontology
    `;

    try {
      const externalResults = await client.query(verifyExternalQuery);
      if (externalResults.length > 0) {
        console.log(`✅ Found ${externalResults.length} external ontology graph(s):\n`);
        externalResults.forEach((result: Record<string, string>) => {
          const graphName = result.ontology.split('/').pop() || result.ontology;
          console.log(`   - ${graphName}: ${result.classCount} classes`);
        });
      } else {
        console.log('⚠️  No external ontology graphs found (they may not have been loaded yet)');
      }
    } catch (_error) {
      console.log('⚠️  Could not verify external ontologies (this is okay if they failed to load)');
    }

    console.log('\n✅ Ontology loading completed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to load ontologies:', error);
    process.exit(1);
  }
}

main();

