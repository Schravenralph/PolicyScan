/**
 * Browser Compatibility Warning Component
 * 
 * Displays a warning banner when the browser is not fully compatible
 * or when recommended browser features are missing.
 */

import React from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { checkBrowserCompatibility, getBrowserInfo, isRecommendedBrowser } from '../../utils/browserCompatibility';
import { t } from '../../utils/i18n';

interface BrowserCompatibilityWarningProps {
  onDismiss?: () => void;
  showOnlyIfIncompatible?: boolean;
}

export function BrowserCompatibilityWarning({
  onDismiss,
  showOnlyIfIncompatible = false,
}: BrowserCompatibilityWarningProps) {
  const [dismissed, setDismissed] = React.useState(false);
  const [compatibility] = React.useState(() => checkBrowserCompatibility());
  const browserInfo = getBrowserInfo();
  const isRecommended = isRecommendedBrowser();

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  // Don't show if dismissed
  if (dismissed) {
    return null;
  }

  // Don't show if only showing for incompatible browsers and browser is compatible
  if (showOnlyIfIncompatible && compatibility.compatible) {
    return null;
  }

  // Show critical incompatibility warning
  if (!compatibility.compatible) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-4" role="alert">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-red-500 mr-3 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-red-800 mb-1">
              Browser niet volledig ondersteund
            </h3>
            <p className="text-sm text-red-700 mb-2">
              Uw browser mist essentiële functies die nodig zijn voor deze applicatie. Sommige
              functionaliteit werkt mogelijk niet correct.
            </p>
            {compatibility.missingFeatures.length > 0 && (
              <div className="text-sm text-red-600 mb-2">
                <p className="font-medium">Ontbrekende functies:</p>
                <ul className="list-disc list-inside mt-1">
                  {compatibility.missingFeatures.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-sm text-red-700">
              We raden aan om een moderne browser te gebruiken zoals Chrome, Firefox of Safari.
            </p>
          </div>
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="ml-4 text-red-500 hover:text-red-700"
              aria-label="Sluiten"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Show warning for non-recommended browsers
  if (!isRecommended) {
    return (
      <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4" role="alert">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-yellow-500 mr-3 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-yellow-800 mb-1">
              Browser mogelijk niet optimaal ondersteund
            </h3>
            <p className="text-sm text-yellow-700 mb-2">
              U gebruikt {browserInfo.name} versie {browserInfo.version}. Voor de beste ervaring
              raden we aan om een recentere versie te gebruiken.
            </p>
            {compatibility.warnings.length > 0 && (
              <div className="text-sm text-yellow-600 mb-2">
                <p className="font-medium">Mogelijk ontbrekende functies:</p>
                <ul className="list-disc list-inside mt-1">
                  {compatibility.warnings.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="ml-4 text-yellow-500 hover:text-yellow-700"
              aria-label="Sluiten"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // Show info for missing optional features
  if (compatibility.warnings.length > 0) {
    return (
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-4" role="alert">
        <div className="flex items-start">
          <AlertTriangle className="h-5 w-5 text-blue-500 mr-3 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-800 mb-1">
              Sommige functies mogelijk niet beschikbaar
            </h3>
            <p className="text-sm text-blue-700 mb-2">
              Uw browser ondersteunt niet alle optionele functies. De applicatie werkt, maar
              sommige geavanceerde functies zijn mogelijk niet beschikbaar.
            </p>
            <div className="text-sm text-blue-600">
              <p className="font-medium">{t('browser.missingOptionalFeatures')}</p>
              <ul className="list-disc list-inside mt-1">
                {compatibility.warnings.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
            </div>
          </div>
          {onDismiss && (
            <button
              onClick={handleDismiss}
              className="ml-4 text-blue-500 hover:text-blue-700"
              aria-label="Sluiten"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>
    );
  }

  // No warnings needed
  return null;
}


