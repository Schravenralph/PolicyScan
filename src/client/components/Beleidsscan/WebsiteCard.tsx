/**
 * Website Card Component
 * 
 * Individual website card for selection with checkbox, title, URL,
 * summary, relevance, and website types.
 */

import { memo } from 'react';
import { Check, ExternalLink } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import type { BronWebsite } from '../../services/api';
import { t } from '../../utils/i18n';

interface WebsiteCardProps {
  website: BronWebsite;
  websiteId: string;
  isSelected: boolean;
  onToggle: () => void;
}

function WebsiteCardComponent({
  website,
  websiteId,
  isSelected,
  onToggle,
}: WebsiteCardProps) {
  return (
    <div
      key={websiteId}
      data-testid={`website-card-${websiteId}`}
      role="listitem"
      className="w-full"
    >
      <button
        onClick={onToggle}
        className={`w-full p-6 rounded-xl border-2 hover:shadow-lg transition-all text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary bg-background ${
          isSelected ? 'border-primary' : 'border-border'
        }`}
        aria-pressed={isSelected}
        aria-label={`${isSelected ? t('websiteCard.deselect') : t('websiteCard.select')} ${website.titel}`}
      >
        <div className="flex items-start gap-4">
          <div
            className={`w-6 h-6 rounded border-2 flex-shrink-0 flex items-center justify-center mt-1 ${
              isSelected ? 'border-primary bg-primary' : 'border-border bg-background'
            }`}
            role="checkbox"
            aria-checked={isSelected}
            aria-hidden="true"
          >
            {isSelected && (
              <Check className="w-4 h-4 text-primary-foreground" aria-hidden="true" />
            )}
          </div>
          <div className="flex-1">
            <h4 className="text-lg mb-2 font-semibold font-serif text-foreground">
              {website.titel}
            </h4>
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={website.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm flex items-center gap-1 hover:opacity-70 transition-opacity mb-2 text-primary max-w-[300px]"
                  aria-label={t('websiteCard.openInNewTab').replace('{{title}}', website.titel)}
                >
                  <ExternalLink className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                  <span className="truncate">{website.url}</span>
                </a>
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-md break-all">{website.url}</p>
              </TooltipContent>
            </Tooltip>
            <p className="text-sm text-muted-foreground">
              {website.samenvatting}
            </p>
            {website['relevantie voor zoekopdracht'] && (
              <p className="text-sm mt-2 text-foreground">
                <strong>Relevantie:</strong> {website['relevantie voor zoekopdracht']}
              </p>
            )}
            {website.website_types && website.website_types.length > 0 && (
              <div className="flex gap-2 mt-2">
                {website.website_types.map((type) => (
                  <span
                    key={`${websiteId}-${type}`}
                    className="px-2 py-1 rounded text-xs bg-muted text-muted-foreground"
                  >
                    {type}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </button>
    </div>
  );
}

// Memoize WebsiteCard to prevent unnecessary re-renders when parent re-renders
// Only re-render if props actually change
export const WebsiteCard = memo(WebsiteCardComponent, (prevProps, nextProps) => {
  return (
    prevProps.websiteId === nextProps.websiteId &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.onToggle === nextProps.onToggle &&
    prevProps.website._id === nextProps.website._id &&
    prevProps.website.titel === nextProps.website.titel
  );
});
