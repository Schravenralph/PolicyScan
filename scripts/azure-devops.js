#!/usr/bin/env node

/**
 * Azure DevOps Integration Script
 *
 * This script integrates with Azure DevOps to:
 * - Create work items
 * - Update work items
 * - Add comments to work items
 * - Link commits to work items
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Azure DevOps config
const configPath = path.join(__dirname, '..', '.config', 'azure.json');
let config;

try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
} catch (_error) {
  console.error('Error loading Azure DevOps config from .config/azure.json');
  console.error('Make sure the file exists and is valid JSON');
  process.exit(1);
}

const { organization, project, personalAccessToken } = config;
const baseUrl = `https://dev.azure.com/${organization}/${encodeURIComponent(project)}/_apis`;
const apiVersion = '7.0';

/**
 * Make authenticated request to Azure DevOps API
 */
async function makeRequest(endpoint, method = 'GET', body = null, contentType = 'application/json-patch+json') {
  const auth = Buffer.from(`:${personalAccessToken}`).toString('base64');

  const options = {
    method,
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': contentType,
      'Accept': 'application/json'
    }
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const url = endpoint.includes('?')
    ? `${endpoint}&api-version=${apiVersion}`
    : `${endpoint}?api-version=${apiVersion}`;

  try {
    const response = await fetch(url, options);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Azure DevOps API error (${response.status}): ${errorText}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return { success: true };
    }

    return await response.json();
  } catch (error) {
    console.error('Request failed:', error.message);
    throw error;
  }
}

/**
 * Create a work item
 */
async function createWorkItem(workItemType, title, description, options = {}) {
  const document = [
    {
      op: 'add',
      path: '/fields/System.Title',
      value: title
    },
    {
      op: 'add',
      path: '/fields/System.Description',
      value: description
    }
  ];

  // Add optional fields
  if (options.assignedTo) {
    document.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: options.assignedTo
    });
  }

  if (options.tags) {
    document.push({
      op: 'add',
      path: '/fields/System.Tags',
      value: options.tags
    });
  }

  if (options.state) {
    document.push({
      op: 'add',
      path: '/fields/System.State',
      value: options.state
    });
  }

  const endpoint = `${baseUrl}/wit/workitems/$${workItemType}`;
  const result = await makeRequest(endpoint, 'POST', document);

  console.log(`✅ Created ${workItemType} #${result.id}: ${title}`);
  return result;
}

/**
 * Update a work item
 */
async function updateWorkItem(workItemId, updates) {
  const document = [];

  if (updates.title) {
    document.push({
      op: 'add',
      path: '/fields/System.Title',
      value: updates.title
    });
  }

  if (updates.description) {
    document.push({
      op: 'add',
      path: '/fields/System.Description',
      value: updates.description
    });
  }

  if (updates.state) {
    document.push({
      op: 'add',
      path: '/fields/System.State',
      value: updates.state
    });
  }

  if (updates.assignedTo) {
    document.push({
      op: 'add',
      path: '/fields/System.AssignedTo',
      value: updates.assignedTo
    });
  }

  if (updates.tags) {
    document.push({
      op: 'add',
      path: '/fields/System.Tags',
      value: updates.tags
    });
  }

  const endpoint = `${baseUrl}/wit/workitems/${workItemId}`;
  const result = await makeRequest(endpoint, 'PATCH', document);

  console.log(`✅ Updated work item #${workItemId}`);
  return result;
}

/**
 * Add comment to work item
 */
async function addComment(workItemId, comment) {
  const auth = Buffer.from(`:${personalAccessToken}`).toString('base64');

  const endpoint = `${baseUrl}/wit/workitems/${workItemId}/comments?api-version=7.0-preview.3`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ text: comment })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Azure DevOps API error (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  console.log(`✅ Added comment to work item #${workItemId}`);
  return result;
}

/**
 * Get work items by query
 */
async function queryWorkItems(wiql) {
  const endpoint = `${baseUrl}/wit/wiql`;
  const result = await makeRequest(endpoint, 'POST', { query: wiql }, 'application/json');

  return result.workItems || [];
}

/**
 * Link commit to work item
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function linkCommitToWorkItem(workItemId, commitId, repositoryId, comment) {
  const document = [
    {
      op: 'add',
      path: '/relations/-',
      value: {
        rel: 'ArtifactLink',
        url: `vstfs:///Git/Commit/${project}/${repositoryId}/${commitId}`,
        attributes: {
          comment: comment || `Linked commit ${commitId.substring(0, 7)}`
        }
      }
    }
  ];

  const endpoint = `${baseUrl}/wit/workitems/${workItemId}`;
  const result = await makeRequest(endpoint, 'PATCH', document);

  console.log(`✅ Linked commit ${commitId.substring(0, 7)} to work item #${workItemId}`);
  return result;
}

/**
 * Create work item for feature completion
 */
async function createFeatureWorkItem(commitMessage, commitId) {
  // Parse commit message for feature info
  const lines = commitMessage.split('\n');
  const title = lines[0].replace(/^feat:\s*/i, '').trim();
  const description = lines.slice(1).join('\n').trim();

  const workItem = await createWorkItem(
    'Task',
    `✅ ${title}`,
    `${description}\n\n**Commit:** ${commitId.substring(0, 7)}\n\n**Completed:** ${new Date().toISOString()}`,
    {
      state: 'Done',
      tags: 'automated; claude-code'
    }
  );

  return workItem;
}

/**
 * Update progress in Azure DevOps
 */
async function updateProgress(progressText) {
  // Find or create a "Progress Tracking" work item
  const wiql = `
    SELECT [System.Id], [System.Title], [System.State]
    FROM WorkItems
    WHERE [System.Title] CONTAINS 'Progress Tracking'
    AND [System.State] <> 'Closed'
    AND [System.State] <> 'Removed'
    ORDER BY [System.CreatedDate] DESC
  `;

  const workItems = await queryWorkItems(wiql);

  if (workItems.length > 0) {
    const workItemId = workItems[0].id;
    await addComment(workItemId, progressText);
  } else {
    // Create without setting state - let it use default
    await createWorkItem(
      'Task',
      'Beleidsscan Progress Tracking',
      'Automated progress updates from Claude Code',
      {
        tags: 'automated; progress-tracking'
      }
    );
  }
}

// CLI Interface
const command = process.argv[2];
const args = process.argv.slice(3);

async function main() {
  try {
    switch (command) {
      case 'create':
        {
          const [type, title, description] = args;
          if (!type || !title) {
            console.error('Usage: azure-devops.js create <type> <title> [description]');
            process.exit(1);
          }
          await createWorkItem(type, title, description || '');
        }
        break;

      case 'update':
        {
          const [id, field, value] = args;
          if (!id || !field || !value) {
            console.error('Usage: azure-devops.js update <id> <field> <value>');
            process.exit(1);
          }
          await updateWorkItem(id, { [field]: value });
        }
        break;

      case 'comment':
        {
          const [id, ...commentParts] = args;
          const comment = commentParts.join(' ');
          if (!id || !comment) {
            console.error('Usage: azure-devops.js comment <id> <comment>');
            process.exit(1);
          }
          await addComment(id, comment);
        }
        break;

      case 'progress':
        {
          const progressText = args.join(' ');
          if (!progressText) {
            console.error('Usage: azure-devops.js progress <progress text>');
            process.exit(1);
          }
          await updateProgress(progressText);
        }
        break;

      case 'feature':
        {
          const [commitMessage, commitId] = args;
          if (!commitMessage || !commitId) {
            console.error('Usage: azure-devops.js feature <commit-message> <commit-id>');
            process.exit(1);
          }
          await createFeatureWorkItem(commitMessage, commitId);
        }
        break;

      case 'test':
        {
          console.log('Testing Azure DevOps connection...');
          const wiql = 'SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project';
          const result = await queryWorkItems(wiql);
          console.log(`✅ Connection successful! Found ${result.length} work items in project.`);
        }
        break;

      default:
        console.log(`
Azure DevOps Integration Script

Usage:
  node azure-devops.js <command> [args]

Commands:
  test                                  Test Azure DevOps connection
  create <type> <title> [description]   Create a work item
  update <id> <field> <value>           Update a work item field
  comment <id> <comment>                Add comment to work item
  progress <text>                       Update progress tracking
  feature <commit-msg> <commit-id>      Create work item from feature commit

Examples:
  node azure-devops.js test
  node azure-devops.js create Task "Implement feature X" "Description here"
  node azure-devops.js comment 123 "Work completed"
  node azure-devops.js progress "Implemented web scraper with IPLO integration"
        `);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
