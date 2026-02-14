import { useState, useCallback, useRef, useEffect } from 'react';
import type { TestApiService } from '../services/api/TestApiService';

export interface PipelineStep {
  stepNumber: number;
  stepName: string;
  status: 'passed' | 'failed' | 'skipped';
  scenarios: {
    total: number;
    passed: number;
    failed: number;
  };
  duration?: number;
}

export interface PipelineDetails {
  steps: PipelineStep[];
  statistics: {
    totalScenarios: number;
    passedScenarios: number;
    failedScenarios: number;
    passRate: number;
  };
  loading?: boolean;
  error?: string;
}

export function usePipelineVisualization(testApiService: TestApiService) {
  // Pipeline expansion state
  const [expandedPipelines, setExpandedPipelines] = useState<Set<string>>(new Set());
  const [pipelineDetails, setPipelineDetails] = useState<Record<string, PipelineDetails>>({});

  // Ref to keep track of details without triggering re-renders in callbacks
  const pipelineDetailsRef = useRef<Record<string, PipelineDetails>>({});

  useEffect(() => {
    pipelineDetailsRef.current = pipelineDetails;
  }, [pipelineDetails]);

  // Load pipeline details when expanded
  const loadPipelineDetails = useCallback(async (pipelineId: string) => {
    const currentDetails = pipelineDetailsRef.current[pipelineId];
    if (currentDetails && (currentDetails.loading || currentDetails.steps)) {
      return; // Already loaded or loading
    }

    // Optimistically update ref to prevent race conditions
    pipelineDetailsRef.current = {
      ...pipelineDetailsRef.current,
      [pipelineId]: {
        ...(pipelineDetailsRef.current[pipelineId] || {
          steps: [],
          statistics: { totalScenarios: 0, passedScenarios: 0, failedScenarios: 0, passRate: 0 },
        }),
        loading: true,
        error: undefined,
      },
    };

    setPipelineDetails(prev => ({
      ...prev,
      [pipelineId]: {
        ...(prev[pipelineId] || { steps: [], statistics: { totalScenarios: 0, passedScenarios: 0, failedScenarios: 0, passRate: 0 } }),
        loading: true,
        error: undefined
      },
    }));

    try {
      const details = await testApiService.getPipeline(pipelineId);
      setPipelineDetails(prev => ({
        ...prev,
        [pipelineId]: {
          steps: (details.steps as PipelineStep[]) || [],
          statistics: (details.statistics as PipelineDetails['statistics']) || {
            totalScenarios: 0,
            passedScenarios: 0,
            failedScenarios: 0,
            passRate: 0,
          },
          loading: false,
        },
      }));
    } catch (error) {
      setPipelineDetails(prev => ({
        ...prev,
        [pipelineId]: {
          ...prev[pipelineId],
          loading: false,
          error: error instanceof Error ? error.message : String(error),
        },
      }));
    }
  }, [testApiService]);

  // Toggle pipeline expansion
  const togglePipelineExpansion = useCallback((pipelineId: string) => {
    const isExpanded = expandedPipelines.has(pipelineId);
    setExpandedPipelines(prev => {
      const newSet = new Set(prev);
      if (newSet.has(pipelineId)) {
        newSet.delete(pipelineId);
      } else {
        newSet.add(pipelineId);
      }
      return newSet;
    });

    if (!isExpanded) {
      loadPipelineDetails(pipelineId);
    }
  }, [expandedPipelines, loadPipelineDetails]);

  return {
    expandedPipelines,
    pipelineDetails,
    loadPipelineDetails,
    togglePipelineExpansion,
  };
}
