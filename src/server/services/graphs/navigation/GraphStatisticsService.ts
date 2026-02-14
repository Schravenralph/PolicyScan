/**
 * Graph Statistics Monitoring Service
 * 
 * Tracks navigation graph health and growth metrics during workflow execution,
 * including node count changes, edge count changes, connectivity ratios, and anomaly detection.
 * 
 * @module GraphStatisticsService
 */

import { logger } from '../../../utils/logger.js';
import { NavigationGraph, GraphStatistics } from './NavigationGraph.js';
import { IRunManager } from '../../workflow/interfaces/IRunManager.js';
import {
  navigationGraphNodesAdded,
  navigationGraphEdgesAdded,
  navigationGraphConnectivityRatio,
} from '../../../utils/metrics.js';

/**
 * Graph growth tracking result
 */
export interface GraphGrowthResult {
  nodesAdded: number;
  edgesAdded: number;
  connectivityRatio: number;
  anomalyDetected: boolean;
  anomalyReason?: string;
}

/**
 * Service to track navigation graph statistics during workflow execution
 */
export class GraphStatisticsService {
  constructor(
    private navigationGraph: NavigationGraph,
    private runManager: IRunManager
  ) {}

  /**
   * Track graph growth during workflow execution
   * 
   * Compares before/after statistics and updates Prometheus metrics.
   * Also detects anomalies (e.g., workflows completing without adding expected nodes).
   * 
   * @param runId - The workflow run ID
   * @param workflowId - The workflow ID
   * @param beforeStats - Graph statistics before workflow execution
   * @param afterStats - Graph statistics after workflow execution
   * @returns Graph growth result with changes and anomaly detection
   */
  async trackWorkflowGraphGrowth(
    runId: string,
    workflowId: string,
    beforeStats: GraphStatistics,
    afterStats: GraphStatistics
  ): Promise<GraphGrowthResult> {
    const startTime = Date.now();
    const context = { runId, workflowId };

    try {
      // Calculate changes
      const nodesAdded = afterStats.totalNodes - beforeStats.totalNodes;
      const edgesAdded = afterStats.totalEdges - beforeStats.totalEdges;

      // Calculate connectivity ratio (edges per node)
      // Avoid division by zero
      const connectivityRatio = afterStats.totalNodes > 0
        ? afterStats.totalEdges / afterStats.totalNodes
        : 0;

      // Update Prometheus metrics
      if (nodesAdded > 0) {
        navigationGraphNodesAdded.inc(
          { change_type: 'added', workflow_id: workflowId },
          nodesAdded
        );
      } else if (nodesAdded < 0) {
        // Handle node removal (shouldn't happen in normal operation)
        navigationGraphNodesAdded.inc(
          { change_type: 'removed', workflow_id: workflowId },
          Math.abs(nodesAdded)
        );
      }

      if (edgesAdded > 0) {
        navigationGraphEdgesAdded.inc({ workflow_id: workflowId }, edgesAdded);
      } else if (edgesAdded < 0) {
        // Handle edge removal
        navigationGraphEdgesAdded.inc({ workflow_id: workflowId }, Math.abs(edgesAdded));
      }

      // Update connectivity ratio gauge
      navigationGraphConnectivityRatio.set({ workflow_id: workflowId }, connectivityRatio);

      // Detect anomalies
      const anomalyCheck = this.checkForExpectedGrowth(
        workflowId,
        nodesAdded,
        edgesAdded,
        beforeStats,
        afterStats
      );

      const duration = Date.now() - startTime;

      // Log structured statistics
      logger.info(
        {
          ...context,
          nodesAdded,
          edgesAdded,
          connectivityRatio,
          beforeStats: {
            totalNodes: beforeStats.totalNodes,
            totalEdges: beforeStats.totalEdges,
          },
          afterStats: {
            totalNodes: afterStats.totalNodes,
            totalEdges: afterStats.totalEdges,
          },
          anomalyDetected: anomalyCheck.anomalyDetected,
          anomalyReason: anomalyCheck.anomalyReason,
          duration,
        },
        'Graph growth tracked for workflow execution'
      );

      // Log warning if anomaly detected
      if (anomalyCheck.anomalyDetected) {
        logger.warn(
          {
            ...context,
            nodesAdded,
            edgesAdded,
            anomalyReason: anomalyCheck.anomalyReason,
          },
          'Anomaly detected in graph growth during workflow execution'
        );
      }

      return {
        nodesAdded,
        edgesAdded,
        connectivityRatio,
        anomalyDetected: anomalyCheck.anomalyDetected,
        anomalyReason: anomalyCheck.anomalyReason,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      logger.error(
        {
          ...context,
          error,
          duration,
        },
        'Failed to track graph growth for workflow execution'
      );
      // Don't throw - statistics tracking should not fail workflows
      return {
        nodesAdded: 0,
        edgesAdded: 0,
        connectivityRatio: 0,
        anomalyDetected: false,
      };
    }
  }

  /**
   * Check for expected growth and detect anomalies
   * 
   * Determines if a workflow should have added nodes based on workflow definition
   * and detects anomalies when workflows complete without adding expected nodes.
   * 
   * @param workflowId - The workflow ID
   * @param nodesAdded - Number of nodes added
   * @param edgesAdded - Number of edges added
   * @param beforeStats - Statistics before workflow
   * @param afterStats - Statistics after workflow
   * @returns Anomaly detection result
   */
  private checkForExpectedGrowth(
    workflowId: string,
    nodesAdded: number,
    _edgesAdded: number,
    _beforeStats: GraphStatistics,
    afterStats: GraphStatistics
  ): { anomalyDetected: boolean; anomalyReason?: string } {
    // Anomaly: Negative growth (nodes removed) - shouldn't happen in normal operation
    // Check this first as it's always an anomaly regardless of workflow type
    if (nodesAdded < 0) {
      return {
        anomalyDetected: true,
        anomalyReason: `Workflow ${workflowId} resulted in negative node growth (${nodesAdded} nodes removed)`,
      };
    }

    // Anomaly: Very low connectivity (isolated nodes)
    // Check this before workflow-specific checks as it's a general health issue
    const connectivityRatio = afterStats.totalNodes > 0
      ? afterStats.totalEdges / afterStats.totalNodes
      : 0;
    if (connectivityRatio < 0.1 && afterStats.totalNodes > 10) {
      return {
        anomalyDetected: true,
        anomalyReason: `Low connectivity ratio (${connectivityRatio.toFixed(2)}) detected - possible isolated nodes`,
      };
    }

    // Workflows that typically add nodes to the navigation graph
    const workflowsThatShouldAddNodes = [
      'bfs_explore_3_hops',
      'iplo-exploration',
      'beleidsscan-step-1',
      'beleidsscan-step-2',
      'beleidsscan-step-3',
      'beleidsscan-wizard',
    ];

    // Check if this workflow should add nodes
    const shouldAddNodes = workflowsThatShouldAddNodes.some(id =>
      workflowId.includes(id) || workflowId === id
    );

    if (!shouldAddNodes) {
      // Not an anomaly if workflow doesn't typically add nodes
      return { anomalyDetected: false };
    }

    // Anomaly: Workflow should add nodes but didn't
    if (nodesAdded === 0 && shouldAddNodes) {
      return {
        anomalyDetected: true,
        anomalyReason: `Workflow ${workflowId} completed without adding any nodes (expected to add nodes)`,
      };
    }

    return { anomalyDetected: false };
  }

  /**
   * Get current graph statistics
   * 
   * @param runId - Optional run ID for context
   * @param workflowId - Optional workflow ID for context
   * @returns Current graph statistics
   */
  async getCurrentStatistics(
    runId?: string,
    workflowId?: string
  ): Promise<GraphStatistics> {
    return await this.navigationGraph.getStatistics({ runId, workflowId });
  }
}

