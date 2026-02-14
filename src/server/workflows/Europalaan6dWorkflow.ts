/**
 * Europalaan6dWorkflow - Dedicated workflow for Europalaan 6d benchmark
 * 
 * Ingests all STOP/TPOD documents relevant to Europalaan 6d location.
 * Proves completeness + idempotency on a fixed location.
 * 
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/07-dso-stop-tpod-adapter.md
 * @see docs/40-implementation-plans/final-plan-canonical-document-parsing/24-fixtures-benchmarks/benchmarks.md
 */

import { logger } from '../utils/logger.js';
import type { ServiceContext } from '../contracts/types.js';
import type { Geometry } from 'geojson';
import { getDeploymentConfig } from '../config/deployment.js';
import { WorkflowEngine } from '../services/workflow/WorkflowEngine.js';
import { dsoLocationSearchWorkflow } from './predefinedWorkflows.js';
import { transformRdToWgs84 } from '../geo/crsTransform.js';

/**
 * Workflow configuration
 */
export interface Europalaan6dWorkflowConfig {
  address?: string; // Address to geocode (default: "Europalaan 6d")
  bufferRadiusMeters?: number; // Buffer radius in meters (default: 15)
  useProduction?: boolean; // Use production DSO API (default: false)
  apiKey?: string; // DSO API key (optional)
  defaultModelId?: string; // Embedding model ID
}

/**
 * Workflow report
 */
export interface Europalaan6dWorkflowReport {
  address: string;
  geometry: Geometry;
  documentsDiscovered: number;
  documentsIngested: number;
  chunksCreated: number;
  geometriesIndexed: number;
  errors: Array<{ documentId: string; error: string }>;
  durationMs: number;
}

/**
 * Europalaan6dWorkflow - Main workflow
 */
export class Europalaan6dWorkflow {
  private config: Europalaan6dWorkflowConfig;
  private workflowEngine?: WorkflowEngine;

  constructor(config: Europalaan6dWorkflowConfig = {}, workflowEngine?: WorkflowEngine) {
    // Use centrally validated deployment configuration for DSO environment + API key
    const deploymentConfig = getDeploymentConfig();
    const dsoConfig = deploymentConfig.dso;

    const defaultUseProduction =
      config.useProduction ?? dsoConfig.env === 'prod';
    const defaultApiKey = config.apiKey ?? dsoConfig.apiKey;
    
    this.config = {
      address: config.address || 'Europalaan 6d',
      bufferRadiusMeters: config.bufferRadiusMeters || 15,
      useProduction: config.useProduction ?? defaultUseProduction,
      apiKey: config.apiKey || defaultApiKey,
      defaultModelId: config.defaultModelId,
    };

    this.workflowEngine = workflowEngine;
  }

  /**
   * Run the workflow
   * 
   * Full pipeline: geocode → discover → acquire → extract → map → persist
   * 
   * @param ctx - Service context
   * @returns Workflow report
   */
  async run(ctx: ServiceContext): Promise<Europalaan6dWorkflowReport> {
    if (!this.workflowEngine) {
      throw new Error("WorkflowEngine is required for Europalaan6dWorkflow. Please provide it in the constructor.");
    }

    const startTime = Date.now();

    logger.info(
      { address: this.config.address, bufferRadius: this.config.bufferRadiusMeters },
      'Starting Europalaan 6d workflow via WorkflowEngine'
    );

    // Execute the declarative workflow
    // Note: We map config to workflow params
    const result = await this.workflowEngine.executeWorkflow(
      dsoLocationSearchWorkflow,
      {
        address: this.config.address,
        mode: this.config.useProduction ? 'prod' : 'preprod',
        // Pass other context/config if needed by the action
        ...ctx,
      },
      undefined, // existingRunId
      { reviewMode: false }
    );

    const durationMs = Date.now() - startTime;

    // Extract results from workflow context
    // The action 'search_dso_location' stores its result in context['search-dso-location']
    // (based on the step ID defined in dsoLocationSearchWorkflow)
    const stepId = 'search-dso-location';
    const actionResult = result.context?.[stepId] as any;

    if (!actionResult) {
      logger.error({ result }, 'Workflow completed but no result found in context');
      throw new Error('Workflow completed but no result found for step search-dso-location');
    }

    const searchLocation = actionResult.searchLocation || {};
    const stats = actionResult.stats || {};

    // Construct geometry from searchLocation (which has RD coordinates)
    // We need to transform RD to WGS84 for the report (GeoJSON)
    let coordinates: [number, number] = [0, 0];

    if (searchLocation.coordinates) {
        coordinates = transformRdToWgs84(searchLocation.coordinates.x, searchLocation.coordinates.y);
    }

    const pointGeometry: Geometry = {
        type: 'Point',
        coordinates
    };

    const report: Europalaan6dWorkflowReport = {
      address: this.config.address!,
      geometry: pointGeometry,
      documentsDiscovered: actionResult.totalFound || 0,
      documentsIngested: stats.documentsIngested || 0,
      chunksCreated: stats.chunksCreated || 0,
      geometriesIndexed: stats.geometriesIndexed || 0,
      errors: stats.errors || [],
      durationMs,
    };

    logger.info(
      {
        documentsDiscovered: report.documentsDiscovered,
        documentsIngested: report.documentsIngested,
        chunksCreated: report.chunksCreated,
        geometriesIndexed: report.geometriesIndexed,
        errors: report.errors.length,
        durationMs: report.durationMs,
      },
      'Europalaan 6d workflow completed'
    );

    return report;
  }
}
