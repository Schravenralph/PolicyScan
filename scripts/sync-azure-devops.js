#!/usr/bin/env node

/**
 * Azure DevOps Work Item Sync Script
 * 
 * Syncs user stories from markdown files to Azure DevOps work items
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Azure DevOps Configuration
const AZURE_CONFIG = {
    organization: 'Data-en-AI',
    project: 'Beleidsscan Bronzoeker',
    baseUrl: 'https://dev.azure.com/Data-en-AI/Beleidsscan%20Bronzoeker',
    apiVersion: '7.1-preview.3'
};

// Personal Access Token - should be set as environment variable
const PAT = process.env.AZURE_DEVOPS_PAT;

if (!PAT) {
    console.error('❌ Error: AZURE_DEVOPS_PAT environment variable not set');
    console.error('');
    console.error('Please set your Azure DevOps Personal Access Token:');
    console.error('  export AZURE_DEVOPS_PAT="your-pat-here"');
    console.error('');
    console.error('To create a PAT:');
    console.error('  1. Go to https://dev.azure.com/Data-en-AI/_usersSettings/tokens');
    console.error('  2. Click "New Token"');
    console.error('  3. Set scope: Work Items (Read & Write)');
    console.error('  4. Copy the token');
    process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(':' + PAT).toString('base64');

/**
 * Parse user story markdown file
 */
async function parseUserStory(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');

    // Extract title (first line, starts with #)
    const titleLine = lines.find(l => l.startsWith('# US-'));
    const title = titleLine ? titleLine.replace(/^# /, '').trim() : path.basename(filePath, '.md');

    // Extract story number
    const storyMatch = title.match(/^US-(\d+):/);
    const storyNumber = storyMatch ? storyMatch[1] : '000';

    // Extract tags
    const tagsLine = lines.find(l => l.startsWith('**Tags:**'));
    const tags = tagsLine
        ? tagsLine.replace('**Tags:**', '').trim().split(',').map(t => t.trim())
        : [];

    // Extract status from tags
    const statusTag = tags.find(t => t.toLowerCase().includes('status'));
    let state = 'To Do';  // Default state
    if (statusTag) {
        if (statusTag.includes('completed') || statusTag.includes('done')) {
            state = 'Done';
        } else if (statusTag.includes('in-progress') || statusTag.includes('wip')) {
            state = 'Doing';
        }
    }

    // Extract description (everything after title until "## Acceptance Criteria")
    const descStartIndex = lines.findIndex(l => l.startsWith('# US-')) + 1;
    const descEndIndex = lines.findIndex(l => l.startsWith('## Acceptance Criteria'));
    const description = lines.slice(descStartIndex, descEndIndex > 0 ? descEndIndex : lines.length)
        .join('\n')
        .trim();

    return {
        title,
        description,
        storyNumber,
        tags,
        state,
        filePath: path.basename(filePath)
    };
}

/**
 * Create work item in Azure DevOps
 */
async function createWorkItem(story) {
    const url = `https://dev.azure.com/${AZURE_CONFIG.organization}/${encodeURIComponent(AZURE_CONFIG.project)}/_apis/wit/workitems/$Issue?api-version=${AZURE_CONFIG.apiVersion}`;

    const body = [
        {
            op: 'add',
            path: '/fields/System.Title',
            value: story.title
        },
        {
            op: 'add',
            path: '/fields/System.Description',
            value: story.description
        },
        {
            op: 'add',
            path: '/fields/System.Tags',
            value: story.tags.join('; ')
        },
        {
            op: 'add',
            path: '/fields/System.State',
            value: story.state
        }
    ];

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json-patch+json',
                'Authorization': authHeader
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`HTTP ${response.status}: ${error}`);
        }

        const workItem = await response.json();
        return workItem;
    } catch (error) {
        console.error(`Failed to create work item for ${story.title}:`, error.message);
        return null;
    }
}

/**
 * Main sync function
 */
async function syncUserStories() {
    console.log('🔄 Syncing user stories to Azure DevOps...\n');

    const userStoriesDir = path.join(__dirname, '../../user-stories');
    const files = await fs.readdir(userStoriesDir);
    const storyFiles = files.filter(f => f.startsWith('US-') && f.endsWith('.md'));

    console.log(`📚 Found ${storyFiles.length} user stories\n`);

    const results = {
        created: [],
        failed: [],
        skipped: []
    };

    for (const file of storyFiles.sort()) {
        const filePath = path.join(userStoriesDir, file);
        const story = await parseUserStory(filePath);

        console.log(`Processing: ${story.title}`);
        console.log(`  State: ${story.state}`);
        console.log(`  Tags: ${story.tags.slice(0, 3).join(', ')}${story.tags.length > 3 ? '...' : ''}`);

        const workItem = await createWorkItem(story);

        if (workItem) {
            results.created.push({
                title: story.title,
                id: workItem.id,
                url: workItem._links.html.href
            });
            console.log(`  ✅ Created: Work Item #${workItem.id}\n`);
        } else {
            results.failed.push(story.title);
            console.log(`  ❌ Failed\n`);
        }

        // Rate limiting - wait 100ms between requests
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 Sync Summary');
    console.log('='.repeat(60));
    console.log(`✅ Created: ${results.created.length}`);
    console.log(`❌ Failed: ${results.failed.length}`);
    console.log(`⏭️  Skipped: ${results.skipped.length}`);
    console.log('');

    if (results.created.length > 0) {
        console.log('Created Work Items:');
        results.created.forEach(item => {
            console.log(`  #${item.id}: ${item.title}`);
            console.log(`    ${item.url}`);
        });
    }

    if (results.failed.length > 0) {
        console.log('\nFailed:');
        results.failed.forEach(title => console.log(`  - ${title}`));
    }
}

// Run sync
syncUserStories().catch(console.error);
