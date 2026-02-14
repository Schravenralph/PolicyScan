#!/usr/bin/env tsx
/**
 * Simple script to create a GraphDB repository using REST API
 * Works with GraphDB Free edition (no authentication required)
 * 
 * Usage: tsx src/server/scripts/create-graphdb-repository-simple.ts [repository-id]
 */

import dotenv from 'dotenv';
import fetch from 'cross-fetch';

dotenv.config();

const repositoryId = process.argv[2] || process.env.GRAPHDB_REPOSITORY || 'Beleidsscan_KG';
const host = process.env.GRAPHDB_HOST || 'localhost';
const port = process.env.GRAPHDB_PORT || '7200';

const baseUrl = `http://${host}:${port}`;
const restEndpoint = `${baseUrl}/rest`;

// GraphDB repository configuration in Turtle format
const repositoryConfig = `
#
# GraphDB repository configuration
#
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#>.
@prefix rep: <http://www.openrdf.org/config/repository#>.
@prefix sr: <http://www.openrdf.org/config/repository/sail#>.
@prefix sail: <http://www.openrdf.org/config/sail#>.
@prefix owlim: <http://www.ontotext.com/trree/owlim#>.

[] a rep:Repository ;
    rep:repositoryID "${repositoryId}" ;
    rep:repositoryImpl [
        rep:repositoryType "graphdb:SailRepository" ;
        sr:sailImpl [
            sail:sailType "graphdb:FreeSail" ;
            owlim:base-URL "http://www.ontotext.com/" ;
            owlim:defaultNS "" ;
            owlim:entity-index-size "10000000" ;
            owlim:entity-id-size "32" ;
            owlim:imports "" ;
            owlim:repository-type "file-repository" ;
            owlim:ruleset "rdfs" ;
            owlim:storage-folder "storage" ;
            owlim:enable-context-index "true" ;
            owlim:enable-literal-index "true" ;
            owlim:check-for-inconsistencies "false" ;
            owlim:disable-sameAs "true" ;
            owlim:query-timeout "0" ;
            owlim:query-limit-results "0" ;
            owlim:throw-QueryEvaluationException-on-timeout "false" ;
            owlim:read-only "false"
        ]
    ].
`.trim();

async function createRepository() {
  console.log(`🔧 Creating GraphDB repository: ${repositoryId}\n`);

  try {
    // Check if repository already exists
    const checkUrl = `${restEndpoint}/repositories`;
    
    const checkResponse = await fetch(checkUrl, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (checkResponse.ok) {
      const repos = await checkResponse.json();
      const repoExists = Array.isArray(repos) && repos.some((repo: { id?: string }) => repo.id === repositoryId);
      
      if (repoExists) {
        console.log(`✅ Repository "${repositoryId}" already exists!\n`);
        return;
      }
    }

    // Create repository using multipart form data
    // GraphDB expects multipart/form-data with a 'config' field containing Turtle content
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const formData = `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="config"; filename="config.ttl"\r\n` +
      `Content-Type: text/turtle\r\n\r\n` +
      `${repositoryConfig}\r\n` +
      `--${boundary}--\r\n`;

    console.log('Creating repository...');
    const createResponse = await fetch(`${restEndpoint}/repositories`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
      },
      body: formData,
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Failed to create repository: ${createResponse.status} ${createResponse.statusText}\n${errorText}`);
    }
    
    console.log(`✅ Repository "${repositoryId}" created successfully!\n`);
    console.log(`   Access it at: ${baseUrl}/sparql`);
    console.log(`   Workbench: ${baseUrl}`);
    console.log(`   SPARQL endpoint: ${baseUrl}/repositories/${repositoryId}`);
    
  } catch (error) {
    console.error('❌ Failed to create repository:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        console.log(`\n✅ Repository "${repositoryId}" already exists!`);
      } else {
        console.error('\n💡 Alternative: Create repository manually via Workbench:');
        console.error(`   1. Open: ${baseUrl}`);
        console.error(`   2. Go to Setup → Repositories → Create`);
        console.error(`   3. Repository ID: ${repositoryId}`);
        console.error(`   4. Type: GraphDB-Free`);
        console.error(`   5. Enable GeoSPARQL plugin (optional)`);
        console.error(`   6. Enable OWL reasoning: RDFS/OWL-Horst (optional)`);
      }
    }
    
    process.exit(1);
  }
}

createRepository();

