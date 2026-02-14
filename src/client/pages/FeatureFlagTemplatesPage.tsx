import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { toast } from '../utils/toast';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Check, Loader2, BarChart3, Flag, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { getFeatureFlagDisplayName } from '../utils/featureFlagUtils';
import { t } from '../utils/i18n';

interface FeatureFlagTemplate {
  name: string;
  description: string;
  featureFlags: Record<string, boolean>;
}

type FeatureFlagCategory = 
  | 'Knowledge Graph Core'
  | 'Knowledge Graph Advanced'
  | 'Legal Features'
  | 'Retrieval'
  | 'Extraction'
  | 'Other';

export function FeatureFlagTemplatesPage() {
  const [templates, setTemplates] = useState<FeatureFlagTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<FeatureFlagCategory | 'All'>('All');
  const navigate = useNavigate();

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await api.get<{ templates: FeatureFlagTemplate[] }>('/feature-flags/templates');
      setTemplates(response.templates || []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error(t('featureFlags.failedToLoadTemplates'), t('featureFlags.tryAgainLater'));
    } finally {
      setLoading(false);
    }
  };

  const applyTemplate = async (templateName: string) => {
    try {
      setApplying(templateName);
      await api.post(`/feature-flags/templates/${templateName}/apply`);
      toast.success(
        t('featureFlags.templateApplied'),
        t('featureFlags.templateAppliedSuccess').replace('{{name}}', templateName)
      );
    } catch (error: unknown) {
      console.error('Error applying template:', error);
      const errorMessage = (error && typeof error === 'object' && 'response' in error && 
        error.response && typeof error.response === 'object' && 'data' in error.response &&
        error.response.data && typeof error.response.data === 'object' && 'error' in error.response.data &&
        typeof error.response.data.error === 'string') 
        ? error.response.data.error 
        : 'Failed to apply template';
      toast.error(t('featureFlags.failedToApplyTemplate'), errorMessage);
    } finally {
      setApplying(null);
    }
  };

  const runBenchmark = (template: FeatureFlagTemplate) => {
    // Navigate to benchmark page with template flags as URL params
    const flagsParam = encodeURIComponent(JSON.stringify(template.featureFlags));
    navigate(`/benchmark?template=${template.name}&flags=${flagsParam}`);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">{t('featureFlags.loadingTemplates')}</div>
      </div>
    );
  }

  const getEnabledCount = (flags: Record<string, boolean>) => {
    return Object.values(flags).filter(Boolean).length;
  };

  const getTotalCount = (flags: Record<string, boolean>) => {
    return Object.keys(flags).length;
  };
  
  // Helper to get category for a flag (simplified - would ideally come from API)
  const getFlagCategory = (flagName: string): FeatureFlagCategory => {
    if (flagName.startsWith('KG_')) {
      if (flagName.includes('LEGAL') || flagName.includes('HIERARCHICAL') || flagName.includes('TEMPORAL') || flagName.includes('DOCUMENT_DEPENDENCIES') || flagName.includes('ONTOLOGY')) {
        return 'Legal Features';
      }
      if (flagName.includes('RETRIEVAL') || flagName.includes('GRAPHRAG') || flagName.includes('COMMUNITY') || flagName.includes('CONTEXTUAL') || flagName.includes('LLM_ANSWER')) {
        return 'Retrieval';
      }
      if (flagName.includes('EXTRACTION') || flagName.includes('RELATIONSHIP')) {
        return 'Extraction';
      }
      if (flagName.includes('TRAVERSAL') || flagName.includes('TRUTH') || flagName.includes('FUSION') || flagName.includes('STEINER') || flagName.includes('SEMANTIC') || flagName.includes('CHANGE') || flagName.includes('VERSIONING') || flagName.includes('INCREMENTAL') || flagName.includes('ADAPTIVE') || flagName.includes('MAX_WEIGHT') || flagName.includes('HETEROGNN')) {
        return 'Knowledge Graph Advanced';
      }
      return 'Knowledge Graph Core';
    }
    return 'Other';
  };
  
  // Filter templates by category
  const filteredTemplates = selectedCategory === 'All' 
    ? templates 
    : templates.filter(template => {
        // Check if template has any flags in the selected category
        return Object.keys(template.featureFlags).some(flagName => 
          getFlagCategory(flagName) === selectedCategory
        );
      });
  
  const categories: FeatureFlagCategory[] = [
    'Knowledge Graph Core',
    'Knowledge Graph Advanced',
    'Legal Features',
    'Retrieval',
    'Extraction',
    'Other',
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">{t('featureFlags.templatesTitle')}</h1>
          <p className="text-muted-foreground mt-1">
            {t('featureFlags.templatesDescription')}
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={selectedCategory} onValueChange={(value) => setSelectedCategory(value as FeatureFlagCategory | 'All')}>
            <SelectTrigger className="w-[200px]">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder={t('featureFlags.filterByCategory')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">{t('featureFlags.allCategories')}</SelectItem>
              {categories.map(category => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            onClick={() => navigate('/feature-flags')}
            variant="outline"
            size="sm"
          >
            <Flag className="h-4 w-4 mr-2" />
            {t('featureFlags.manageFlags')}
          </Button>
        </div>
      </div>

      {filteredTemplates.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {t('featureFlags.noTemplatesFound')}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template) => {
            const enabledCount = getEnabledCount(template.featureFlags);
            const totalCount = getTotalCount(template.featureFlags);
            const isApplying = applying === template.name;

            return (
              <Card key={template.name} className="flex flex-col">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <CardTitle className="text-lg font-semibold">
                        {template.name}
                      </CardTitle>
                      <CardDescription className="mt-2">
                        {template.description}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="space-y-4 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-xs">
                        {enabledCount} / {totalCount} {t('featureFlags.enabledCount')}
                      </Badge>
                    </div>
                    
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {Object.entries(template.featureFlags)
                        .slice(0, 10)
                        .map(([flagName, enabled]) => (
                          <div
                            key={flagName}
                            className="flex items-center justify-between text-xs p-2 rounded border bg-muted/30"
                          >
                            <span className="text-xs font-semibold truncate flex-1">
                              {getFeatureFlagDisplayName(flagName)}
                            </span>
                            <Badge
                              variant={enabled ? 'default' : 'secondary'}
                              className="ml-2 text-xs"
                            >
                              {enabled ? t('featureFlags.enabled') : t('featureFlags.disabled')}
                            </Badge>
                          </div>
                        ))}
                      {Object.keys(template.featureFlags).length > 10 && (
                        <div className="text-xs text-muted-foreground text-center">
                          +{Object.keys(template.featureFlags).length - 10} {t('featureFlags.moreFlags')}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-4 pt-4 border-t">
                    <Button
                      onClick={() => applyTemplate(template.name)}
                      disabled={isApplying}
                      variant="outline"
                      size="sm"
                      className="flex-1"
                    >
                      {isApplying ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          {t('featureFlags.applying')}
                        </>
                      ) : (
                        <>
                          <Check className="h-4 w-4 mr-2" />
                          {t('featureFlags.apply')}
                        </>
                      )}
                    </Button>
                    <Button
                      onClick={() => runBenchmark(template)}
                      variant="default"
                      size="sm"
                      className="flex-1"
                    >
                      <BarChart3 className="h-4 w-4 mr-2" />
                      {t('featureFlags.benchmark')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

