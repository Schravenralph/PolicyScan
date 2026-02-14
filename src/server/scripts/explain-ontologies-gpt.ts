#!/usr/bin/env tsx
/**
 * Example script demonstrating SPARQL + GPT magic predicates for ontology explanations
 * 
 * Usage: tsx src/server/scripts/explain-ontologies-gpt.ts [--graph <graph-uri>] [--limit <number>] [--lang nl|en]
 * 
 * Prerequisites:
 * - GraphDB must be running with LLM configured (see docs/server/GRAPHDB-GPT-SETUP.md)
 * - Ontologies must be loaded into a named graph
 */

import { connectGraphDB } from '../config/graphdb.js';
import { getOntologyGPTService } from '../services/external/OntologyGPTService.js';

const DEFAULT_ONTOLOGY_GRAPH = 'http://data.ruimtemeesters.nl/ontologies/base';
const DEFAULT_LIMIT = 20;

async function main() {
  // Parse command line arguments
  const args = process.argv.slice(2);
  let ontologyGraph = DEFAULT_ONTOLOGY_GRAPH;
  let limit = DEFAULT_LIMIT;
  let language: 'nl' | 'en' = 'nl';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--graph' && i + 1 < args.length) {
      ontologyGraph = args[i + 1];
      i++;
    } else if (args[i] === '--limit' && i + 1 < args.length) {
      limit = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--lang' && i + 1 < args.length) {
      language = args[i + 1] as 'nl' | 'en';
      i++;
    }
  }

  console.log('📚 Generating GPT-powered ontology explanations...\n');
  console.log(`   Graph: ${ontologyGraph}`);
  console.log(`   Limit: ${limit}`);
  console.log(`   Language: ${language}\n`);

  try {
    // Connect to GraphDB
    await connectGraphDB();
    const service = getOntologyGPTService();

    // List available ontology graphs
    console.log('1. Listing available ontology graphs...\n');
    const graphs = await service.listOntologyGraphs();
    if (graphs.length === 0) {
      console.log('   ⚠️  No ontology graphs found. Make sure ontologies are loaded.');
      console.log('   Run: pnpm run graphdb:load-ontologies\n');
    } else {
      console.log(`   ✅ Found ${graphs.length} ontology graph(s):\n`);
      graphs.forEach((graph, index) => {
        console.log(`   ${index + 1}. ${graph}`);
      });
      console.log('');
    }

    // Explain ontology classes
    console.log('2. Generating explanations for ontology classes...\n');
    try {
      const classExplanations = await service.explainOntologyClasses(ontologyGraph, limit, language);
      
      if (classExplanations.length === 0) {
        console.log('   ⚠️  No classes found in the specified graph.');
        console.log(`   Make sure ontologies are loaded into: ${ontologyGraph}\n`);
      } else {
        console.log(`   ✅ Generated ${classExplanations.length} explanations:\n`);
        classExplanations.forEach((explanation, index) => {
          const className = explanation.class.split('#').pop() || explanation.class.split('/').pop() || explanation.class;
          console.log(`   ${index + 1}. ${className}`);
          if (explanation.label) {
            console.log(`      Label: ${explanation.label}`);
          }
          console.log(`      ${explanation.explanation}\n`);
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('gpt:')) {
        console.log('   ⚠️  GPT predicates not available. Make sure GraphDB is configured with LLM settings.');
        console.log('   See: docs/server/GRAPHDB-GPT-SETUP.md\n');
      } else {
        throw error;
      }
    }

    // Explain ontology properties
    console.log('3. Generating explanations for ontology properties...\n');
    try {
      const propertyExplanations = await service.explainOntologyProperties(ontologyGraph, limit, language);
      
      if (propertyExplanations.length === 0) {
        console.log('   ⚠️  No properties found in the specified graph.\n');
      } else {
        console.log(`   ✅ Generated ${propertyExplanations.length} explanations:\n`);
        propertyExplanations.forEach((explanation, index) => {
          const propName = explanation.property.split('#').pop() || explanation.property.split('/').pop() || explanation.property;
          console.log(`   ${index + 1}. ${propName}`);
          if (explanation.label) {
            console.log(`      Label: ${explanation.label}`);
          }
          console.log(`      ${explanation.explanation}\n`);
        });
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('gpt:')) {
        console.log('   ⚠️  GPT predicates not available.\n');
      } else {
        throw error;
      }
    }

    console.log('✅ Ontology explanation generation completed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Failed to generate explanations:', error);
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
    }
    process.exit(1);
  }
}

main();

