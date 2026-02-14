import { useState } from 'react';
import { HelpCircle, ExternalLink } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from './ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from './ui/popover';
import { Link } from 'react-router-dom';
import { t } from '../utils/i18n';

interface HelpTooltipProps {
  content: string;
  title?: string;
  linkTo?: string;
  linkText?: string;
  variant?: 'tooltip' | 'popover';
  className?: string;
}

export function HelpTooltip({
  content,
  title,
  linkTo,
  linkText = t('common.moreInfo'),
  variant = 'tooltip',
  className = '',
}: HelpTooltipProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (variant === 'popover') {
    return (
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={`inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded ${className}`}
            aria-label={t('common.help')}
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="start">
          <div className="space-y-2">
            {title && (
              <h4 className="font-semibold text-sm text-gray-900">{title}</h4>
            )}
            <p className="text-sm text-gray-600">{content}</p>
            {linkTo && (
              <Link
                to={linkTo}
                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                onClick={() => setIsOpen(false)}
              >
                {linkText}
                <ExternalLink className="w-3 h-3" />
              </Link>
            )}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`inline-flex items-center justify-center w-5 h-5 text-gray-400 hover:text-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded ${className}`}
          aria-label="Help"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          {title && (
            <p className="font-semibold text-sm">{title}</p>
          )}
          <p className="text-sm">{content}</p>
          {linkTo && (
            <Link
              to={linkTo}
              className="inline-flex items-center gap-1 text-xs text-blue-300 hover:text-blue-200 font-medium mt-1"
            >
              {linkText}
              <ExternalLink className="w-3 h-3" />
            </Link>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
