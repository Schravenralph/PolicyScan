import { Workflow } from '../services/infrastructure/types.js';

export const POLICY_SCAN_WORKFLOW: Workflow = {
    id: 'policy-scan-workflow',
    name: 'Policy Scan Workflow',
    description: 'Recursive policy scanning flow using Navigation Graph and Knowledge Graph',
    steps: [
        {
            id: 'initialize',
            name: 'Initialize Scan',
            action: 'initializeScan',
            next: 'initialSearch'
        },
        {
            id: 'initialSearch',
            name: 'Initial Web Search',
            action: 'searchWeb',
            next: 'clusterAnalysis'
        },
        {
            id: 'clusterAnalysis',
            name: 'Graph Cluster Analysis',
            action: 'analyzeGraph',
            next: 'recursiveCrawl'
        },
        {
            id: 'recursiveCrawl',
            name: 'Recursive Crawl & Propagation',
            action: 'recursiveCrawl',
            next: 'finalize'
        },
        {
            id: 'finalize',
            name: 'Finalize Scan',
            action: 'finalizeScan'
        }
    ]
};
