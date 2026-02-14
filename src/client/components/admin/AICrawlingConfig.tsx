import { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { t } from '../../utils/i18n';
import { toast } from '../../utils/toast';
import { formatAggressiveness, formatStrategy, formatCacheEnabled, formatEnabled } from '../../utils/aiCrawlingFormatters.js';
import { Trash2, Plus, Save, Edit } from 'lucide-react';
import { logError } from '../../utils/errorHandler';

interface AICrawlingConfig {
  _id?: string;
  scope: 'global' | 'site' | 'query';
  siteUrl?: string;
  aggressiveness: 'low' | 'medium' | 'high';
  strategy: 'site_search' | 'ai_navigation' | 'traditional' | 'auto';
  maxDepth?: number;
  maxLinks?: number;
  llmModel?: string;
  cacheEnabled?: boolean;
  cacheTTL?: number;
  timeout?: number;
  fallbackBehavior?: 'traditional' | 'skip';
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
}

export function AICrawlingConfig() {
  const [configs, setConfigs] = useState<AICrawlingConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newConfig, setNewConfig] = useState<Partial<AICrawlingConfig>>({
    scope: 'site',
    aggressiveness: 'medium',
    strategy: 'auto',
    enabled: true,
    cacheEnabled: true,
    maxDepth: 4,
    maxLinks: 15,
    cacheTTL: 604800,
    timeout: 30000,
    fallbackBehavior: 'traditional',
  });

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      setLoading(true);
      const data = await api.getAICrawlingConfigs();
      setConfigs(data);
    } catch (error) {
      logError(error, 'load-ai-crawling-configs');
      toast.error(t('aiCrawling.toast.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      if (newConfig.scope === 'site' && !newConfig.siteUrl) {
        toast.error(t('aiCrawling.toast.urlRequired'));
        return;
      }

      await api.createAICrawlingConfig({
        scope: newConfig.scope || 'site',
        siteUrl: newConfig.siteUrl,
        aggressiveness: newConfig.aggressiveness || 'medium',
        strategy: newConfig.strategy || 'auto',
        maxDepth: newConfig.maxDepth,
        maxLinks: newConfig.maxLinks,
        llmModel: newConfig.llmModel,
        cacheEnabled: newConfig.cacheEnabled ?? true,
        cacheTTL: newConfig.cacheTTL,
        timeout: newConfig.timeout,
        fallbackBehavior: newConfig.fallbackBehavior || 'traditional',
        enabled: newConfig.enabled ?? true,
      });

      toast.success(t('aiCrawling.toast.createSuccess'));
      setNewConfig({
        scope: 'site',
        aggressiveness: 'medium',
        strategy: 'auto',
        enabled: true,
        cacheEnabled: true,
        maxDepth: 4,
        maxLinks: 15,
        cacheTTL: 604800,
        timeout: 30000,
        fallbackBehavior: 'traditional',
      });
      loadConfigs();
    } catch (error) {
      logError(error, 'create-ai-crawling-config');
      toast.error(t('aiCrawling.toast.createError'));
    }
  };

  const handleUpdate = async (id: string, updates: Partial<AICrawlingConfig>) => {
    try {
      await api.updateAICrawlingConfig(id, updates);
      toast.success(t('aiCrawling.toast.updateSuccess'));
      setEditingId(null);
      loadConfigs();
    } catch (error) {
      logError(error, 'update-ai-crawling-config');
      toast.error(t('aiCrawling.toast.updateError'));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('aiCrawling.toast.deleteConfirm'))) {
      return;
    }

    try {
      await api.deleteAICrawlingConfig(id);
      toast.success(t('aiCrawling.toast.deleteSuccess'));
      loadConfigs();
    } catch (error) {
      logError(error, 'delete-ai-crawling-config');
      toast.error(t('aiCrawling.toast.deleteError'));
    }
  };

  if (loading) {
    return <div className="p-6">{t('common.loading')}</div>;
  }

  const globalConfig = configs.find(c => c.scope === 'global');
  const siteConfigs = configs.filter(c => c.scope === 'site');

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">{t('aiCrawling.title')}</h2>
        <p className="text-gray-600">
          {t('aiCrawling.description')}
        </p>
      </div>

      {/* Global Configuration */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">{t('aiCrawling.globalConfig')}</h3>
        {globalConfig ? (
          <ConfigForm
            config={globalConfig}
            isEditing={editingId === globalConfig._id}
            onEdit={() => setEditingId(globalConfig._id || null)}
            onSave={(updates) => globalConfig._id && handleUpdate(globalConfig._id, updates)}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div className="text-gray-500">{t('aiCrawling.noGlobalConfig')}</div>
        )}
      </div>

      {/* Site Configurations */}
      <div className="border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-4">{t('aiCrawling.siteConfigs')}</h3>
        
        {/* Create New Site Config */}
        <div className="border-b pb-4 mb-4">
          <h4 className="font-medium mb-3">{t('aiCrawling.createSiteConfig')}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="new-site-url">{t('aiCrawling.siteUrl')}</Label>
              <Input
                id="new-site-url"
                value={newConfig.siteUrl || ''}
                onChange={(e) => setNewConfig({ ...newConfig, siteUrl: e.target.value })}
                placeholder="https://example.nl"
              />
            </div>
            <div>
              <Label htmlFor="new-aggressiveness">{t('aiCrawling.aggressiveness')}</Label>
              <Select
                value={newConfig.aggressiveness}
                onValueChange={(value: 'low' | 'medium' | 'high') =>
                  setNewConfig({ ...newConfig, aggressiveness: value })
                }
              >
                <SelectTrigger id="new-aggressiveness">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t('aiCrawling.aggressiveness.low')}</SelectItem>
                  <SelectItem value="medium">{t('aiCrawling.aggressiveness.medium')}</SelectItem>
                  <SelectItem value="high">{t('aiCrawling.aggressiveness.high')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="new-strategy">{t('aiCrawling.strategy')}</Label>
              <Select
                value={newConfig.strategy}
                onValueChange={(value: 'site_search' | 'ai_navigation' | 'traditional' | 'auto') =>
                  setNewConfig({ ...newConfig, strategy: value })
                }
              >
                <SelectTrigger id="new-strategy">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">{t('aiCrawling.strategy.auto')}</SelectItem>
                  <SelectItem value="site_search">{t('aiCrawling.strategy.site_search')}</SelectItem>
                  <SelectItem value="ai_navigation">{t('aiCrawling.strategy.ai_navigation')}</SelectItem>
                  <SelectItem value="traditional">{t('aiCrawling.strategy.traditional')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button onClick={handleCreate} className="w-full">
                <Plus className="w-4 h-4 mr-2" />
                {t('aiCrawling.create')}
              </Button>
            </div>
          </div>
        </div>

        {/* List Site Configs */}
        {siteConfigs.length === 0 ? (
          <div className="text-gray-500">{t('aiCrawling.noSiteConfigs')}</div>
        ) : (
          <div className="space-y-4">
            {siteConfigs.map((config) => (
              <div key={config._id} className="border rounded p-4">
                <ConfigForm
                  config={config}
                  isEditing={editingId === config._id}
                  onEdit={() => setEditingId(config._id || null)}
                  onSave={(updates) => config._id && handleUpdate(config._id, updates)}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => config._id && handleDelete(config._id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface ConfigFormProps {
  config: AICrawlingConfig;
  isEditing: boolean;
  onEdit: () => void;
  onSave: (updates: Partial<AICrawlingConfig>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function ConfigForm({ config, isEditing, onEdit, onSave, onCancel, onDelete }: ConfigFormProps) {
  const [updates, setUpdates] = useState<Partial<AICrawlingConfig>>({});

  const handleSave = () => {
    onSave(updates);
    setUpdates({});
  };

  const handleCancel = () => {
    setUpdates({});
    onCancel();
  };

  if (!isEditing) {
    return (
      <div className="flex justify-between items-start">
        <div className="flex-1">
          {config.siteUrl && (
            <div className="font-medium mb-2">{config.siteUrl}</div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div>
              <span className="text-gray-600">{t('aiCrawling.aggressiveness')}:</span> {formatAggressiveness(config.aggressiveness)}
            </div>
            <div>
              <span className="text-gray-600">{t('aiCrawling.strategy')}:</span> {formatStrategy(config.strategy)}
            </div>
            <div>
              <span className="text-gray-600">{t('aiCrawling.maxDepth')}:</span> {config.maxDepth || t('common.notAvailable')}
            </div>
            <div>
              <span className="text-gray-600">{t('aiCrawling.maxLinks')}:</span> {config.maxLinks || t('common.notAvailable')}
            </div>
            <div>
              <span className="text-gray-600">{t('aiCrawling.cacheEnabled')}:</span> {formatCacheEnabled(config.cacheEnabled ?? false)}
            </div>
            <div>
              <span className="text-gray-600">{t('aiCrawling.enabled')}:</span> {formatEnabled(config.enabled)}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Edit className="w-4 h-4" />
          </Button>
          {onDelete && (
            <Button variant="outline" size="sm" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {config.siteUrl && (
        <div>
          <Label>{t('aiCrawling.siteUrl')}</Label>
          <Input value={config.siteUrl} disabled />
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label>{t('aiCrawling.aggressiveness')}</Label>
          <Select
            value={(updates.aggressiveness || config.aggressiveness) as string}
            onValueChange={(value) => setUpdates({ ...updates, aggressiveness: value as 'low' | 'medium' | 'high' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="low">{t('aiCrawling.aggressiveness.low')}</SelectItem>
              <SelectItem value="medium">{t('aiCrawling.aggressiveness.medium')}</SelectItem>
              <SelectItem value="high">{t('aiCrawling.aggressiveness.high')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t('aiCrawling.strategy')}</Label>
          <Select
            value={(updates.strategy || config.strategy) as string}
            onValueChange={(value) => setUpdates({ ...updates, strategy: value as 'site_search' | 'ai_navigation' | 'traditional' | 'auto' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">{t('aiCrawling.strategy.auto')}</SelectItem>
              <SelectItem value="site_search">{t('aiCrawling.strategy.site_search')}</SelectItem>
              <SelectItem value="ai_navigation">{t('aiCrawling.strategy.ai_navigation')}</SelectItem>
              <SelectItem value="traditional">{t('aiCrawling.strategy.traditional')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t('aiCrawling.maxDepth')}</Label>
          <Input
            type="number"
            value={updates.maxDepth ?? config.maxDepth ?? ''}
            onChange={(e) => setUpdates({ ...updates, maxDepth: parseInt(e.target.value) || undefined })}
          />
        </div>
        <div>
          <Label>{t('aiCrawling.maxLinks')}</Label>
          <Input
            type="number"
            value={updates.maxLinks ?? config.maxLinks ?? ''}
            onChange={(e) => setUpdates({ ...updates, maxLinks: parseInt(e.target.value) || undefined })}
          />
        </div>
        <div>
          <Label>{t('aiCrawling.cacheEnabled')}</Label>
          <Select
            value={String(updates.cacheEnabled ?? config.cacheEnabled ?? true)}
            onValueChange={(value) => setUpdates({ ...updates, cacheEnabled: value === 'true' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{t('aiCrawling.cache.enabled')}</SelectItem>
              <SelectItem value="false">{t('aiCrawling.cache.disabled')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t('aiCrawling.enabled')}</Label>
          <Select
            value={String(updates.enabled ?? config.enabled ?? true)}
            onValueChange={(value) => setUpdates({ ...updates, enabled: value === 'true' })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="true">{t('aiCrawling.boolean.yes')}</SelectItem>
              <SelectItem value="false">{t('aiCrawling.boolean.no')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2">
        <Button onClick={handleSave}>
          <Save className="w-4 h-4 mr-2" />
          {t('aiCrawling.save')}
        </Button>
        <Button variant="outline" onClick={handleCancel}>
          {t('aiCrawling.cancel')}
        </Button>
      </div>
    </div>
  );
}

