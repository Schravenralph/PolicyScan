/**
 * Browser Compatibility Utility
 * 
 * Provides feature detection and compatibility checking for browser features
 * required by the application.
 */

export interface BrowserCompatibilityStatus {
  compatible: boolean;
  features: {
    localStorage: boolean;
    sessionStorage: boolean;
    fetch: boolean;
    promises: boolean;
    asyncAwait: boolean;
    es6Classes: boolean;
    arrowFunctions: boolean;
    templateLiterals: boolean;
    destructuring: boolean;
    spreadOperator: boolean;
    cssGrid: boolean;
    cssFlexbox: boolean;
    intersectionObserver: boolean;
    resizeObserver: boolean;
    broadcastChannel: boolean;
    webWorkers: boolean;
  };
  missingFeatures: string[];
  warnings: string[];
  browserInfo: {
    userAgent: string;
    platform: string;
    language: string;
  };
}

/**
 * Check if a feature is available
 */
function hasFeature(feature: string): boolean {
  try {
    switch (feature) {
      case 'localStorage':
        try {
          const test = '__localStorage_test__';
          localStorage.setItem(test, test);
          localStorage.removeItem(test);
          return true;
        } catch {
          return false;
        }
      case 'sessionStorage':
        try {
          const test = '__sessionStorage_test__';
          sessionStorage.setItem(test, test);
          sessionStorage.removeItem(test);
          return true;
        } catch {
          return false;
        }
      case 'fetch':
        return typeof fetch !== 'undefined';
      case 'promises':
        return typeof Promise !== 'undefined';
      case 'asyncAwait':
        // Check if async/await is supported (ES2017)
        try {
           
          eval('(async () => {})');
          return true;
        } catch {
          return false;
        }
      case 'es6Classes':
        // Check if ES6 classes are supported
        try {
           
          eval('class Test {}');
          return true;
        } catch {
          return false;
        }
      case 'arrowFunctions':
        // Check if arrow functions are supported
        try {
           
          eval('(() => {})');
          return true;
        } catch {
          return false;
        }
      case 'templateLiterals':
        // Check if template literals are supported
        try {
           
          eval('`test`');
          return true;
        } catch {
          return false;
        }
      case 'destructuring':
        // Check if destructuring is supported
        try {
           
          eval('const {a} = {a: 1}');
          return true;
        } catch {
          return false;
        }
      case 'spreadOperator':
        // Check if spread operator is supported
        try {
           
          eval('[...[1,2,3]]');
          return true;
        } catch {
          return false;
        }
      case 'cssGrid':
        return CSS.supports('display', 'grid');
      case 'cssFlexbox':
        return CSS.supports('display', 'flex');
      case 'intersectionObserver':
        return typeof IntersectionObserver !== 'undefined';
      case 'resizeObserver':
        return typeof ResizeObserver !== 'undefined';
      case 'broadcastChannel':
        return typeof BroadcastChannel !== 'undefined';
      case 'webWorkers':
        return typeof Worker !== 'undefined';
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Check browser compatibility
 */
export function checkBrowserCompatibility(): BrowserCompatibilityStatus {
  const features = {
    localStorage: hasFeature('localStorage'),
    sessionStorage: hasFeature('sessionStorage'),
    fetch: hasFeature('fetch'),
    promises: hasFeature('promises'),
    asyncAwait: hasFeature('asyncAwait'),
    es6Classes: hasFeature('es6Classes'),
    arrowFunctions: hasFeature('arrowFunctions'),
    templateLiterals: hasFeature('templateLiterals'),
    destructuring: hasFeature('destructuring'),
    spreadOperator: hasFeature('spreadOperator'),
    cssGrid: hasFeature('cssGrid'),
    cssFlexbox: hasFeature('cssFlexbox'),
    intersectionObserver: hasFeature('intersectionObserver'),
    resizeObserver: hasFeature('resizeObserver'),
    broadcastChannel: hasFeature('broadcastChannel'),
    webWorkers: hasFeature('webWorkers'),
  };

  // Critical features required for application to function
  const criticalFeatures = [
    'localStorage',
    'sessionStorage',
    'fetch',
    'promises',
    'asyncAwait',
    'es6Classes',
    'arrowFunctions',
    'templateLiterals',
    'destructuring',
    'spreadOperator',
  ] as const;

  // Important features that enhance functionality
  const importantFeatures = [
    'cssGrid',
    'cssFlexbox',
    'intersectionObserver',
    'resizeObserver',
    'broadcastChannel',
    'webWorkers',
  ] as const;

  const missingFeatures: string[] = [];
  const warnings: string[] = [];

  // Check critical features
  for (const feature of criticalFeatures) {
    if (!features[feature]) {
      missingFeatures.push(feature);
    }
  }

  // Check important features (warnings, not blockers)
  for (const feature of importantFeatures) {
    if (!features[feature]) {
      warnings.push(feature);
    }
  }

  // Browser is compatible if all critical features are available
  const compatible = missingFeatures.length === 0;

  // Get browser information
  const browserInfo = {
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    platform: typeof navigator !== 'undefined' ? navigator.platform : 'unknown',
    language: typeof navigator !== 'undefined' ? navigator.language : 'unknown',
  };

  return {
    compatible,
    features,
    missingFeatures,
    warnings,
    browserInfo,
  };
}

/**
 * Check if browser is compatible (quick check)
 */
export function isBrowserCompatible(): boolean {
  return checkBrowserCompatibility().compatible;
}

/**
 * Get browser name and version (if detectable)
 */
export function getBrowserInfo(): {
  name: string;
  version: string;
  platform: string;
} {
  if (typeof navigator === 'undefined') {
    return { name: 'unknown', version: 'unknown', platform: 'unknown' };
  }

  const ua = navigator.userAgent;
  let name = 'unknown';
  let version = 'unknown';

  // Detect Chrome/Chromium
  if (ua.includes('Chrome') && !ua.includes('Edg')) {
    const match = ua.match(/Chrome\/(\d+)/);
    name = 'Chrome';
    version = match ? match[1] : 'unknown';
  }
  // Detect Edge
  else if (ua.includes('Edg')) {
    const match = ua.match(/Edg\/(\d+)/);
    name = 'Edge';
    version = match ? match[1] : 'unknown';
  }
  // Detect Firefox
  else if (ua.includes('Firefox')) {
    const match = ua.match(/Firefox\/(\d+)/);
    name = 'Firefox';
    version = match ? match[1] : 'unknown';
  }
  // Detect Safari
  else if (ua.includes('Safari') && !ua.includes('Chrome')) {
    const match = ua.match(/Version\/(\d+)/);
    name = 'Safari';
    version = match ? match[1] : 'unknown';
  }

  return {
    name,
    version,
    platform: navigator.platform,
  };
}

/**
 * Check if browser is recommended (modern browser)
 */
export function isRecommendedBrowser(): boolean {
  const browserInfo = getBrowserInfo();
  const { name, version } = browserInfo;

  // Recommended browsers with minimum versions
  const recommendedBrowsers: Record<string, number> = {
    Chrome: 90,
    Edge: 90,
    Firefox: 88,
    Safari: 14,
  };

  if (name === 'unknown') {
    return false;
  }

  const minVersion = recommendedBrowsers[name];
  if (!minVersion) {
    return false;
  }

  const versionNum = parseInt(version, 10);
  return !isNaN(versionNum) && versionNum >= minVersion;
}


