/**
 * Overheidslaag Selector Component
 * 
 * Radio button grid for selecting government layer (overheidslaag)
 * with keyboard navigation and validation.
 */

import React, { useMemo, memo } from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from '../ui/label';
import { t } from '../../utils/i18n';

type WebsiteType = 'gemeente' | 'waterschap' | 'provincie' | 'rijk' | 'kennisinstituut';

interface Overheidslaag {
  id: WebsiteType;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  color: string;
}

interface OverheidslaagSelectorProps {
  overheidslagen: Overheidslaag[];
  selectedOverheidslaag: WebsiteType | null;
  onSelect: (id: WebsiteType) => void;
  validationError?: string;
}

function OverheidslaagSelectorComponent({
  overheidslagen,
  selectedOverheidslaag,
  onSelect,
  validationError,
}: OverheidslaagSelectorProps) {
  // Memoize handleKeyDown to prevent function recreation on every render
  // Create a stable map of handlers for each laag
  const keyDownHandlers = useMemo(() => {
    const handlers = new Map<string, (e: React.KeyboardEvent) => void>();
    overheidslagen.forEach((laag) => {
      handlers.set(laag.id, (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(laag.id);
        }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          const currentIndex = overheidslagen.findIndex(l => l.id === laag.id);
          const nextIndex = (currentIndex + 1) % overheidslagen.length;
          const nextButton = document.querySelector(`[data-overheidslaag="${overheidslagen[nextIndex].id}"]`) as HTMLElement;
          nextButton?.focus();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          const currentIndex = overheidslagen.findIndex(l => l.id === laag.id);
          const prevIndex = (currentIndex - 1 + overheidslagen.length) % overheidslagen.length;
          const prevButton = document.querySelector(`[data-overheidslaag="${overheidslagen[prevIndex].id}"]`) as HTMLElement;
          prevButton?.focus();
        }
      });
    });
    return handlers;
  }, [overheidslagen, onSelect]);

  return (
    <div className="mt-8">
      <div className="flex items-center gap-2 mb-4">
        <Label className={`text-lg block ${validationError ? 'text-destructive' : 'text-foreground'}`} htmlFor="overheidslaag-selection">
          {t('overheidslaagSelector.selectLayer')}
          <span className="ml-1 text-destructive" aria-label={t('overheidslaagSelector.requiredField')}>*</span>
        </Label>
      </div>
      <div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        role="radiogroup"
        aria-labelledby="overheidslaag-label"
        aria-invalid={!!validationError}
        aria-describedby={validationError ? 'overheidslaag-error' : undefined}
        id="overheidslaag-selection"
      >
        {overheidslagen.map((laag, index) => {
          // Style objects - computed directly (no hooks in callbacks)
          const buttonStyle = {
            backgroundColor: 'white',
            minHeight: '80px',
            outline: 'none',
            ['--overheidslaag-color' as any]: laag.color
          };
          
          const iconContainerStyle = {
            backgroundColor: laag.color
          };
          
          const iconStyle = {
            color: 'white'
          };

          // Accessibility improvement: Ensure one radio button is always reachable via tab
          // If nothing is selected, the first item (index 0) becomes focusable (tabIndex=0)
          const isSelected = selectedOverheidslaag === laag.id;
          const isFirst = index === 0;
          const tabIndex = isSelected || (selectedOverheidslaag === null && isFirst) ? 0 : -1;
          
          return (
            <button
              key={laag.id}
              onClick={() => onSelect(laag.id)}
              className={`p-4 sm:p-6 rounded-xl border-2 hover:shadow-lg transition-all text-left focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary ${
                selectedOverheidslaag === laag.id
                  ? 'border-[color:var(--overheidslaag-color)]'
                  : validationError
                    ? 'border-destructive'
                    : 'border-border'
              }`}
              style={buttonStyle}
              onKeyDown={keyDownHandlers.get(laag.id)!}
              tabIndex={tabIndex}
              role="radio"
              aria-checked={selectedOverheidslaag === laag.id}
              aria-label={`Selecteer ${laag.label}`}
              data-overheidslaag={laag.id}
              data-testid={`overheidslaag-${laag.id}`}
            >
              <div className="flex items-center gap-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center"
                  style={iconContainerStyle}
                  aria-hidden="true"
                >
                  <laag.icon className="w-6 h-6" style={iconStyle} aria-hidden="true" />
                </div>
              <h4 className="text-lg text-foreground">
                {laag.label}
              </h4>
            </div>
          </button>
          );
        })}
      </div>
      {validationError && (
        <p
          id="overheidslaag-error"
          className="mt-2 text-sm flex items-center gap-1 animate-in fade-in text-destructive"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          <span>{validationError}</span>
        </p>
      )}
      <span id="overheidslaag-label" className="sr-only">{t('common.selectGovernmentLayer')}</span>
    </div>
  );
}

// Memoize OverheidslaagSelector to prevent unnecessary re-renders
// Only re-render when props actually change
export const OverheidslaagSelector = memo(OverheidslaagSelectorComponent, (prevProps, nextProps) => {
  return (
    prevProps.overheidslagen.length === nextProps.overheidslagen.length &&
    prevProps.selectedOverheidslaag === nextProps.selectedOverheidslaag &&
    prevProps.validationError === nextProps.validationError &&
    prevProps.onSelect === nextProps.onSelect &&
    // Deep compare overheidslagen array (check if same reference or same id values)
    (prevProps.overheidslagen === nextProps.overheidslagen ||
      (prevProps.overheidslagen.length === nextProps.overheidslagen.length &&
        prevProps.overheidslagen.every((l, i) => l.id === nextProps.overheidslagen[i]?.id)))
  );
});
