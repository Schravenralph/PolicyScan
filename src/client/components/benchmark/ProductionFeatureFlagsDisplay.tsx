/**
 * Production Feature Flags Display Component
 * 
 * Displays the current production feature flags configuration.
 */

import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { getFeatureFlagDisplayName } from '../../utils/featureFlagUtils';
import { t } from '../../utils/i18n';

interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  source: 'environment' | 'database' | 'default';
}

interface ProductionFeatureFlagsDisplayProps {
  flags: FeatureFlag[];
}

export function ProductionFeatureFlagsDisplay({ flags }: ProductionFeatureFlagsDisplayProps) {
  const navigate = useNavigate();

  return (
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              {t('featureFlags.productionFeatureFlags')}
            </CardTitle>
            <CardDescription>
              {t('featureFlags.productionDescription')}
            </CardDescription>
          </div>
          <Button
            onClick={() => navigate('/feature-flags')}
            variant="outline"
            size="sm"
          >
            {t('featureFlags.manageFlags')}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
          {flags.filter(f => f.source !== 'environment').slice(0, 20).map((flag) => (
            <div key={flag.name} className="flex items-center gap-2 text-xs">
              <Badge variant={flag.enabled ? 'default' : 'secondary'} className="text-xs">
                {flag.enabled ? t('featureFlags.enabled') : t('featureFlags.disabled')}
              </Badge>
              <span className="text-xs truncate" title={flag.description || flag.name}>
                {getFeatureFlagDisplayName(flag.name)}
              </span>
            </div>
          ))}
          {flags.filter(f => f.source !== 'environment').length > 20 && (
            <div className="text-xs text-muted-foreground">
              +{flags.filter(f => f.source !== 'environment').length - 20} {t('featureFlags.more')}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
