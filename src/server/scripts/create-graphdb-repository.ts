#!/usr/bin/env tsx
/**
 * Script to create a GraphDB repository programmatically
 * 
 * Usage: tsx src/server/scripts/create-graphdb-repository.ts [repository-id]
 */

import dotenv from 'dotenv';
import fetch from 'cross-fetch';
import graphdb from 'graphdb';

dotenv.config();

const repositoryId = process.argv[2] || process.env.GRAPHDB_REPOSITORY || 'beleidsscan';
const host = process.env.GRAPHDB_HOST || 'localhost';
const port = process.env.GRAPHDB_PORT || '7200';
const username = process.env.GRAPHDB_USER || 'admin';
const password = process.env.GRAPHDB_PASSWORD || 'root';

const baseUrl = `http://${host}:${port}`;
const restEndpoint = `${baseUrl}/rest`;

async function createRepository() {
  console.log(`🔧 Creating GraphDB repository: ${repositoryId}\n`);

  try {
    // Check if repository already exists
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
    const checkUrl = `${restEndpoint}/repositories`;
    
    const checkResponse = await fetch(checkUrl, {
      headers: {
        Accept: 'application/json',
        Authorization: authHeader,
      },
    });

    if (checkResponse.ok) {
      const repos = await checkResponse.json();
      const repoExists = repos.some((repo: { id?: string }) => repo.id === repositoryId);
      
      if (repoExists) {
        console.log(`✅ Repository "${repositoryId}" already exists!\n`);
        return;
      }
    }

    // Create repository configuration
    const RepositoryConfig = graphdb.repository.RepositoryConfig;
    const RepositoryType = graphdb.repository.RepositoryType;

    const config = new RepositoryConfig(
      repositoryId,
      '', // location (empty for local)
      new Map(), // params
      '', // title
      RepositoryType.GRAPHDB_FREE
    );

    // Use GraphDBServerClient to create repository (has createRepository method)
    const ServerClientConfig = graphdb.server.ServerClientConfig;
    const GraphDBServerClient = graphdb.server.GraphDBServerClient;

    const serverConfig = new ServerClientConfig(baseUrl)
      .useBasicAuthentication(username, password);

    const serverClient = new GraphDBServerClient(serverConfig);

    console.log('Creating repository...');
    const result = await serverClient.createRepository(config);
    
    if (result instanceof Error) {
      throw result;
    }
    
    console.log(`✅ Repository "${repositoryId}" created successfully!\n`);
    console.log(`   Access it at: ${baseUrl}/sparql`);
    console.log(`   Workbench: ${baseUrl}`);
    
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
        console.error(`   5. Enable GeoSPARQL plugin`);
        console.error(`   6. Enable OWL reasoning: RDFS/OWL-Horst`);
      }
    }
    
    process.exit(1);
  }
}

createRepository();

