/**
 * Empty State Component
 * 
 * Reusable component for displaying empty states with guidance and suggestions.
 */

import { LucideIcon, Search } from 'lucide-react';
import { Button } from './button';
import { t } from '../../utils/i18n';

export interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline' | 'ghost';
  icon?: LucideIcon;
}

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  message: string;
  guidance?: string[];
  suggestions?: string[];
  actions?: EmptyStateAction[];
  severity?: 'info' | 'warning' | 'error';
}

export function EmptyState({
  icon: Icon = Search,
  title,
  message,
  guidance = [],
  suggestions = [],
  actions = [],
  severity = 'info',
}: EmptyStateProps) {
  const severityStyles = {
    info: 'bg-primary/5 border-primary/20',
    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
    error: 'bg-destructive/5 border-destructive/20',
  };

  const iconStyles = {
    info: 'text-primary',
    warning: 'text-yellow-600 dark:text-yellow-500',
    error: 'text-destructive',
  };

  return (
    <div className={`mt-8 p-8 rounded-xl text-center border ${severityStyles[severity]}`}>
      <Icon className={`w-16 h-16 mx-auto mb-4 ${iconStyles[severity]}`} aria-hidden="true" />
      <h4 className="text-xl mb-2 font-semibold font-serif text-foreground">
        {title}
      </h4>
      <p className="mb-4 text-foreground">
        {message}
      </p>

      {/* Guidance */}
      {guidance.length > 0 && (
        <div className="space-y-2 text-sm text-left max-w-md mx-auto mb-6 text-muted-foreground">
          <p>
            <strong className="text-foreground">Mogelijke oorzaken:</strong>
          </p>
          <ul className="list-disc list-inside space-y-1">
            {guidance.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2 text-sm text-left max-w-md mx-auto mb-6 text-muted-foreground">
          <p>
            <strong className="text-foreground">{t('common.tryFollowing')}</strong>
          </p>
          <ul className="list-disc list-inside space-y-1">
            {suggestions.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Actions */}
      {actions.length > 0 && (
        <div className="flex flex-wrap gap-4 justify-center">
          {actions.map((action, index) => {
            const ActionIcon = action.icon;
            return (
              <Button
                key={index}
                onClick={action.onClick}
                variant={action.variant || 'outline'}
                className={
                  action.variant === 'outline'
                    ? 'border-primary text-primary hover:bg-primary/10'
                    : ''
                }
              >
                {ActionIcon && <ActionIcon className="w-4 h-4 mr-2" aria-hidden="true" />}
                {action.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}


