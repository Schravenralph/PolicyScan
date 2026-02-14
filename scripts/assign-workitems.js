#!/usr/bin/env node

/**
 * Assign all work items to Ralph Schraven
 */

import fetch from 'node:fetch';

// Personal Access Token - MUST be set as environment variable
// ⚠️  SECURITY: Never commit tokens to the repository. Only use .env files.
const PAT = process.env.AZURE_DEVOPS_PAT;

if (!PAT) {
    console.error('❌ Error: AZURE_DEVOPS_PAT environment variable not set');
    console.error('');
    console.error('Please set your Azure DevOps Personal Access Token:');
    console.error('  export AZURE_DEVOPS_PAT="your-pat-here"');
    console.error('');
    console.error('Or add to .env file:');
    console.error('  AZURE_DEVOPS_PAT=your-pat-here');
    console.error('');
    console.error('To create a PAT:');
    console.error('  1. Go to https://dev.azure.com/Data-en-AI/_usersSettings/tokens');
    console.error('  2. Click "New Token"');
    console.error('  3. Set scope: Work Items (Read & Write)');
    console.error('  4. Copy the token');
    console.error('');
    console.error('⚠️  SECURITY: Never commit tokens to the repository. Only use .env files.');
    process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(':' + PAT).toString('base64');
const org = 'Data-en-AI';
const project = 'Beleidsscan Bronzoeker';

// Work items to assign (#87-#110)
const workItemIds = Array.from({ length: 24 }, (_, i) => 87 + i);

async function assignWorkItem(workItemId, assignedTo) {
    const url = `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_apis/wit/workitems/${workItemId}?api-version=7.1`;

    const body = [
        {
            op: 'add',
            path: '/fields/System.AssignedTo',
            value: assignedTo
        }
    ];

    try {
        const response = await fetch(url, {
            method: 'PATCH',
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
        return {
            id: workItem.id,
            title: workItem.fields['System.Title'],
            assignedTo: workItem.fields['System.AssignedTo']?.displayName || 'Unassigned'
        };
    } catch (error) {
        console.error(`Failed to assign work item #${workItemId}:`, error.message);
        return null;
    }
}

async function assignAllWorkItems() {
    console.log('🔄 Assigning all work items to Ralph Schraven...\n');

    // Azure DevOps user identity for Ralph Schraven
    // This will be auto-resolved by Azure DevOps
    const assignedTo = 'Ralph Schraven <ralph.schraven@ruimtemeesters.nl>';

    let success = 0;
    let failed = 0;

    for (const id of workItemIds) {
        const result = await assignWorkItem(id, assignedTo);

        if (result) {
            console.log(`✅ #${result.id}: ${result.title}`);
            console.log(`   Assigned to: ${result.assignedTo}\n`);
            success++;
        } else {
            console.log(`❌ #${id}: Failed\n`);
            failed++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('\n' + '='.repeat(60));
    console.log('📊 Assignment Summary');
    console.log('='.repeat(60));
    console.log(`✅ Assigned: ${success}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`\n🎯 All work items assigned to: Ralph Schraven`);
}

assignAllWorkItems().catch(console.error);
