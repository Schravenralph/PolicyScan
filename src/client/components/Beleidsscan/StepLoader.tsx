/**
 * StepLoader Component
 * 
 * Loading skeleton for wizard step transitions.
 * Prevents forced reflow by using CSS-based animations.
 */

import { Skeleton } from '../ui/skeleton';
import { t } from '../../utils/i18n';

export function StepLoader() {
  return (
    <div className="space-y-6 animate-in fade-in-50 duration-200" role="status" aria-live="polite">
      <div className="space-y-4">
        <Skeleton className="h-10 w-3/4" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-2/3" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-6 w-1/4" />
        <Skeleton className="h-32 w-full" />
      </div>
      <span className="sr-only">{t('stepLoader.loading')}</span>
    </div>
  );
}
