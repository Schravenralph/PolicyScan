import { Progress } from '../ui/progress';
import { Clock, CheckCircle2 } from 'lucide-react';
import { t } from '../../utils/i18n';

interface TestProgressBarProps {
  progress: {
    percentage: number;
    completed: number;
    total: number;
    estimatedTimeRemaining?: number;
  };
  className?: string;
}

/**
 * Progress bar component for test execution
 * Shows completion percentage, completed/total tests, and estimated time remaining
 */
export function TestProgressBar({ progress, className = '' }: TestProgressBarProps) {
  const { percentage, completed, total, estimatedTimeRemaining } = progress;

  // Format estimated time remaining
  const formatTimeRemaining = (seconds?: number): string => {
    if (!seconds || seconds <= 0) return '';
    
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      const minutes = Math.floor(seconds / 60);
      const remainingSeconds = seconds % 60;
      return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
    } else {
      const hours = Math.floor(seconds / 3600);
      const minutes = Math.floor((seconds % 3600) / 60);
      return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
  };

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Progress bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-gray-700">
            {t('testProgressBar.title')}
          </span>
          <span className="text-gray-600">
            {completed} / {total > 0 ? total : '?'} {t('testProgressBar.tests')}
          </span>
        </div>
        <Progress value={percentage} className="h-2" />
        <div className="flex items-center justify-between text-xs text-gray-500">
          <span>{percentage}% {t('testProgressBar.complete')}</span>
          {estimatedTimeRemaining && estimatedTimeRemaining > 0 && (
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              <span>~{formatTimeRemaining(estimatedTimeRemaining)} {t('testProgressBar.remaining')}</span>
            </div>
          )}
        </div>
      </div>

      {/* Status indicator */}
      {total > 0 && completed === total && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <CheckCircle2 className="w-4 h-4" />
          <span>{t('testProgressBar.allTestsCompleted')}</span>
        </div>
      )}
    </div>
  );
}

