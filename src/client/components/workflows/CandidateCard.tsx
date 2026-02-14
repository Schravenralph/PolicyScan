/**
 * Candidate Card Component
 * 
 * Individual candidate result card in the review dialog.
 */

import { CheckCircle2, XCircle, ExternalLink, Zap, ChevronRight, Info } from 'lucide-react';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { t } from '../../utils/i18n';

interface CandidateResult {
  id: string;
  title: string;
  url: string;
  snippet?: string;
  metadata?: Record<string, unknown>;
  reviewStatus: 'pending' | 'accepted' | 'rejected';
  reviewNotes?: string;
}

interface CandidateCardProps {
  candidate: CandidateResult;
  isAccepted: boolean;
  isRejected: boolean;
  isExpanded: boolean;
  onToggle: (checked: boolean) => void;
  onToggleExpansion: () => void;
}

export function CandidateCard({
  candidate,
  isAccepted,
  isRejected,
  isExpanded,
  onToggle,
  onToggleExpansion,
}: CandidateCardProps) {
  const relevanceScore = (candidate.metadata?.relevanceScore as number) || 0;
  const boostScore = (candidate.metadata?.boostScore as number) || 0;
  const hasBoost = boostScore > 0;

  return (
    <div
      className={`p-4 border rounded-lg transition-all ${
        isAccepted
          ? 'border-green-500 bg-green-50/50'
          : isRejected
          ? 'border-red-500 bg-red-50/50'
          : 'border-gray-200 hover:border-gray-300 bg-background'
      } ${hasBoost ? 'ring-2 ring-yellow-400/50' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-1 flex-shrink-0">
          <Checkbox
            checked={isAccepted}
            onCheckedChange={(checked) => onToggle(checked === true)}
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 mb-2">
                <h4 className="font-semibold text-base leading-tight flex-1">
                  {candidate.title}
                </h4>
                {hasBoost && (
                  <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-300 flex items-center gap-1 flex-shrink-0">
                    <Zap className="h-3 w-3" />
                    {t('workflowReview.boost')}: +{boostScore.toFixed(1)}
                  </Badge>
                )}
                {(relevanceScore > 0 || boostScore > 0) && (
                  <Badge variant="secondary" className="flex-shrink-0 text-xs">
                    {t('workflowReview.score')}: {(relevanceScore + boostScore).toFixed(1)}
                  </Badge>
                )}
              </div>
              {candidate.snippet && (
                <p className={`text-sm text-muted-foreground mb-2 ${!isExpanded ? 'line-clamp-2' : ''}`}>
                  {candidate.snippet}
                </p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <a
                  href={candidate.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:underline flex items-center gap-1 break-all"
                >
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                  <span className="truncate max-w-[400px]">{candidate.url}</span>
                </a>
                {candidate.snippet && candidate.snippet.length > 100 && (
                  <button
                    onClick={onToggleExpansion}
                    className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                  >
                    {isExpanded ? t('workflowReview.showLess') : t('workflowReview.showMore')}
                    <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                  </button>
                )}
              </div>
              {isExpanded && candidate.metadata && Object.keys(candidate.metadata).length > 0 && (
                <div className="mt-2 p-2 bg-muted/50 rounded text-xs">
                  <div className="font-semibold mb-1 flex items-center gap-1">
                    <Info className="h-3 w-3" />
                    {t('workflowReview.metadata')}
                  </div>
                  <div className="space-y-1">
                    {Object.entries(candidate.metadata).map(([key, value]) => (
                      <div key={key} className="flex gap-2">
                        <span className="font-medium">{key}:</span>
                        <span>{String(value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {isAccepted && (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              )}
              {isRejected && (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
