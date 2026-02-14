/**
 * Quick Comparison Widget Component
 * 
 * Compares the latest test run with the previous run.
 */

import { GitCompare, ExternalLink, ArrowUp, ArrowDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface TestRun {
  id?: string;
  results?: {
    passed?: number;
    failed?: number;
    skipped?: number;
    total?: number;
    duration?: number;
  };
}

interface QuickComparisonWidgetProps {
  latestRun: TestRun;
  previousRun: TestRun;
}

function ChangeIndicator({ diff, isGood }: { diff: number; isGood: boolean }) {
  if (diff === 0) return null;
  const isPositive = diff > 0;
  const isImprovement = isGood ? isPositive : !isPositive;
  const Icon = isPositive ? ArrowUp : ArrowDown;
  const color = isImprovement ? 'text-green-600' : 'text-red-600';
  return (
    <span className={`flex items-center gap-1 ${color} text-sm font-semibold`}>
      <Icon className="w-4 h-4" />
      {Math.abs(diff)}
    </span>
  );
}

export function QuickComparisonWidget({ latestRun, previousRun }: QuickComparisonWidgetProps) {
  const navigate = useNavigate();

  if (!latestRun || !previousRun) return null;

  const latestPassed = latestRun.results?.passed || 0;
  const latestFailed = latestRun.results?.failed || 0;
  const latestSkipped = latestRun.results?.skipped || 0;
  const latestTotal = latestRun.results?.total || 0;
  const latestDuration = latestRun.results?.duration || 0;
  
  const previousPassed = previousRun.results?.passed || 0;
  const previousFailed = previousRun.results?.failed || 0;
  const previousSkipped = previousRun.results?.skipped || 0;
  const previousTotal = previousRun.results?.total || 0;
  const previousDuration = previousRun.results?.duration || 0;
  
  const passedDiff = latestPassed - previousPassed;
  const failedDiff = latestFailed - previousFailed;
  const skippedDiff = latestSkipped - previousSkipped;
  const totalDiff = latestTotal - previousTotal;
  const durationDiff = latestDuration - previousDuration;
  
  const latestPassRate = latestTotal > 0 ? ((latestPassed / latestTotal) * 100).toFixed(1) : '0.0';
  const previousPassRate = previousTotal > 0 ? ((previousPassed / previousTotal) * 100).toFixed(1) : '0.0';
  const passRateDiff = parseFloat(latestPassRate) - parseFloat(previousPassRate);

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  return (
    <Card className="col-span-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5" />
            Quick Comparison: Latest vs Previous Run
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (latestRun.id && previousRun.id) {
                navigate(`/tests/compare?run1=${latestRun.id}&run2=${previousRun.id}`);
              }
            }}
          >
            View Full Comparison
            <ExternalLink className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          <div>
            <div className="text-xs text-gray-500 mb-2">Passed</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{latestPassed}</span>
              <ChangeIndicator diff={passedDiff} isGood={true} />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Previous: {previousPassed}
            </div>
            <div className="text-xs text-gray-500 mt-1">
              Pass Rate: {latestPassRate}% {passRateDiff !== 0 && (
                <span className={passRateDiff > 0 ? 'text-green-600' : 'text-red-600'}>
                  ({passRateDiff > 0 ? '+' : ''}{passRateDiff.toFixed(1)}%)
                </span>
              )}
            </div>
          </div>
          
          <div>
            <div className="text-xs text-gray-500 mb-2">Failed</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-red-600">{latestFailed}</span>
              <ChangeIndicator diff={failedDiff} isGood={false} />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Previous: {previousFailed}
            </div>
          </div>
          
          <div>
            <div className="text-xs text-gray-500 mb-2">Skipped</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-yellow-600">{latestSkipped}</span>
              <ChangeIndicator diff={skippedDiff} isGood={false} />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Previous: {previousSkipped}
            </div>
          </div>
          
          <div>
            <div className="text-xs text-gray-500 mb-2">Total Tests</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{latestTotal}</span>
              <ChangeIndicator diff={totalDiff} isGood={true} />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Previous: {previousTotal}
            </div>
          </div>
          
          <div>
            <div className="text-xs text-gray-500 mb-2">Duration</div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold">{formatDuration(latestDuration)}</span>
              {durationDiff !== 0 && (
                <ChangeIndicator diff={durationDiff < 0 ? Math.abs(durationDiff) : -durationDiff} isGood={durationDiff < 0} />
              )}
            </div>
            <div className="text-xs text-gray-400 mt-1">
              Previous: {formatDuration(previousDuration)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
