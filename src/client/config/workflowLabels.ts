/**
 * Workflow Labels Configuration
 * 
 * Maps workflow IDs to their i18n translation keys for names and descriptions.
 */

import type { TranslationKey } from '../utils/i18n';

export const WORKFLOW_LABELS: Record<string, { nameKey: TranslationKey; descriptionKey: TranslationKey }> = {
    'iplo-exploration': {
        nameKey: 'workflows.iploExploration.name',
        descriptionKey: 'workflows.iploExploration.description'
    },
    'standard-scan': {
        nameKey: 'workflows.standardScan.name',
        descriptionKey: 'workflows.standardScan.description'
    },
    'quick-iplo-scan': {
        nameKey: 'workflows.quickIploScan.name',
        descriptionKey: 'workflows.quickIploScan.description'
    },
    'bfs-3-hop': {
        nameKey: 'workflows.bfs3Hop.name',
        descriptionKey: 'workflows.bfs3Hop.description'
    },
    'external-links-exploration': {
        nameKey: 'workflows.externalLinks.name',
        descriptionKey: 'workflows.externalLinks.description'
    },
    'beleidsscan-graph': {
        nameKey: 'workflows.beleidsscanGraph.name',
        descriptionKey: 'workflows.beleidsscanGraph.description'
    },
    'horst-aan-de-maas': {
        nameKey: 'workflows.horstAanDeMaas.name',
        descriptionKey: 'workflows.horstAanDeMaas.description'
    },
    'horst-labor-migration': {
        nameKey: 'workflows.horstLaborMigration.name',
        descriptionKey: 'workflows.horstLaborMigration.description'
    },
    'beleidsscan-step-1-search-dso': {
        nameKey: 'workflows.beleidsscanStep1.name',
        descriptionKey: 'workflows.beleidsscanStep1.description'
    },
    'beleidsscan-step-2-enrich-dso': {
        nameKey: 'workflows.beleidsscanStep2.name',
        descriptionKey: 'workflows.beleidsscanStep2.description'
    },
    'beleidsscan-step-3-search-iplo': {
        nameKey: 'workflows.beleidsscanStep3.name',
        descriptionKey: 'workflows.beleidsscanStep3.description'
    },
    'beleidsscan-step-4-scan-sources': {
        nameKey: 'workflows.beleidsscanStep4.name',
        descriptionKey: 'workflows.beleidsscanStep4.description'
    },
    'beleidsscan-step-5-officiele-bekendmakingen': {
        nameKey: 'workflows.beleidsscanStep5.name',
        descriptionKey: 'workflows.beleidsscanStep5.description'
    },
    'beleidsscan-step-6-rechtspraak': {
        nameKey: 'workflows.beleidsscanStep6.name',
        descriptionKey: 'workflows.beleidsscanStep6.description'
    },
    'beleidsscan-step-7-common-crawl': {
        nameKey: 'workflows.beleidsscanStep7.name',
        descriptionKey: 'workflows.beleidsscanStep7.description'
    },
    'beleidsscan-step-9-merge-score': {
        nameKey: 'workflows.beleidsscanStep9.name',
        descriptionKey: 'workflows.beleidsscanStep9.description'
    },
    'dso-location-search': {
        nameKey: 'workflows.dsoLocationSearch.name',
        descriptionKey: 'workflows.dsoLocationSearch.description'
    },
    'test-workflow-1': {
        nameKey: 'workflows.testWorkflow1.name',
        descriptionKey: 'workflows.testWorkflow1.description'
    },
    'test-workflow-2': {
        nameKey: 'workflows.testWorkflow2.name',
        descriptionKey: 'workflows.testWorkflow2.description'
    }
};

