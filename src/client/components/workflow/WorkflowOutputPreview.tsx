/**
 * Workflow Output Preview Component
 * 
 * Displays workflow output preview including endpoints and execution trace.
 */

import { FileText, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { translateStepName } from '../../utils/logTranslations';
import { t } from '../../utils/i18n';

interface WorkflowOutput {
  trace: {
    steps: Array<{
      stepName: string;
      status: string;
      urls?: string[];
    }>;
  };
  results?: {
    endpoints?: Array<{
      title: string;
      url: string;
    }>;
  };
}

interface WorkflowOutputPreviewProps {
  output: WorkflowOutput;
}

export function WorkflowOutputPreview({ output }: WorkflowOutputPreviewProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-white">
        {t('workflowResults.workflowResultsPreview')}
      </h3>
      
      {/* Endpoints Preview */}
      {output.results?.endpoints && output.results.endpoints.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
            {t('workflowResults.endpointsFound')} ({output.results?.endpoints?.length || 0})
          </h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(output.results?.endpoints || []).slice(0, 20).map((endpoint, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-900/50 rounded-lg"
              >
                <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {endpoint.title}
                  </div>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="text-xs text-gray-500 truncate cursor-help">
                        {endpoint.url}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-md break-all">{endpoint.url}</p>
                    </TooltipContent>
                  </Tooltip>
                </div>
                <a
                  href={endpoint.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            ))}
            {(output.results?.endpoints?.length || 0) > 20 && (
              <div className="text-sm text-gray-500 text-center py-2">
                {t('workflowResults.andMoreEndpoints').replace('{{count}}', String((output.results?.endpoints?.length || 0) - 20))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Trace Preview */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          {t('workflowResults.executionTrace')}
        </h4>
        <div className="space-y-2">
          {output.trace.steps.map((step, idx) => (
            <div
              key={idx}
              className="flex items-center gap-2 text-sm"
            >
              <div className={`w-2 h-2 rounded-full ${
                step.status === 'success' ? 'bg-green-500' :
                step.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
              }`} />
              <span className="text-gray-700 dark:text-gray-300">
                {translateStepName(step.stepName)}
              </span>
              {step.urls && step.urls.length > 0 && (
                <span className="text-xs text-gray-500">
                  {t('workflowResults.urlsCount').replace('{{count}}', String(step.urls.length))}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
