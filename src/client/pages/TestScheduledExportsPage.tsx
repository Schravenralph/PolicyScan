/**
 * Test Scheduled Exports Page
 * 
 * UI for managing scheduled test data exports.
 */

import { useEffect, useState, useCallback } from 'react';
import { TestApiService } from '../services/api/TestApiService';
import { Calendar, Plus, Edit, Trash2, Play, Download, Clock, Mail } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { TestDashboardNav } from '../components/test/TestDashboardNav';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';

interface ScheduledExport {
  id: string;
  name: string;
  schedule: string;
  format: 'csv' | 'json' | 'xlsx' | 'pdf';
  filters?: {
    testType?: string;
    branch?: string;
    timeRangeDays?: number;
  };
  recipients?: string[];
  enabled: boolean;
  lastRun?: string;
  nextRun?: string;
  createdAt: string;
  updatedAt: string;
}

export function TestScheduledExportsPage({ testApiService: injectedTestApiService }: { testApiService?: TestApiService } = {}) {
  const testApi = injectedTestApiService || new TestApiService();
  const [exports, setExports] = useState<ScheduledExport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingExport, setEditingExport] = useState<ScheduledExport | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);

  const loadExports = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await testApi.getScheduledExports();
      setExports(data.scheduledExports);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load scheduled exports';
      setError(errorMessage);
      console.error('Error loading scheduled exports:', err);
    } finally {
      setLoading(false);
    }
  }, [testApi]);

  useEffect(() => {
    loadExports();
    // Refresh every 30 seconds
    const interval = setInterval(loadExports, 30000);
    return () => clearInterval(interval);
  }, [loadExports]);

  const handleCreate = useCallback(async (config: Omit<ScheduledExport, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'>) => {
    try {
      await testApi.createScheduledExport(config);
      setShowCreateDialog(false);
      await loadExports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create scheduled export');
    }
  }, [testApi, loadExports]);

  const handleUpdate = useCallback(async (id: string, updates: Partial<ScheduledExport>) => {
    try {
      await testApi.updateScheduledExport(id, updates);
      setEditingExport(null);
      await loadExports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update scheduled export');
    }
  }, [testApi, loadExports]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm('Are you sure you want to delete this scheduled export?')) {
      return;
    }

    try {
      await testApi.deleteScheduledExport(id);
      await loadExports();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete scheduled export');
    }
  }, [testApi, loadExports]);

  const handleExecute = useCallback(async (id: string) => {
    try {
      setExecutingId(id);
      const blob = await testApi.executeScheduledExport(id);
      
      // Download the file
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export-${id}-${new Date().toISOString()}.${blob.type.includes('pdf') ? 'pdf' : 'xlsx'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to execute scheduled export');
    } finally {
      setExecutingId(null);
    }
  }, [testApi]);

  const formatCronExpression = (cron: string): string => {
    // Simple formatting - in production, use a proper cron parser
    if (cron === '0 9 * * 1') return 'Every Monday at 9:00 AM';
    if (cron === '0 0 * * *') return 'Daily at midnight';
    if (cron === '0 0 * * 0') return 'Every Sunday at midnight';
    if (cron === '0 0 1 * *') return 'Monthly on the 1st';
    return cron;
  };

  if (loading && exports.length === 0) {
    return (
      <div className="p-8">
        <TestDashboardNav />
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <Calendar className="h-8 w-8 animate-spin mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">Loading scheduled exports...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      <TestDashboardNav />

      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">📅 Scheduled Exports</h1>
          <p className="text-muted-foreground mt-1">Manage automated test data exports</p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Create Export
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Scheduled Exports List */}
      {exports.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground py-8">
              <Calendar className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p>No scheduled exports configured</p>
              <Button onClick={() => setShowCreateDialog(true)} className="mt-4">
                <Plus className="w-4 h-4 mr-2" />
                Create Your First Export
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {exports.map((exportConfig) => (
            <Card key={exportConfig.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <CardTitle>{exportConfig.name}</CardTitle>
                    <Badge variant={exportConfig.enabled ? 'default' : 'outline'}>
                      {exportConfig.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>
                    <Badge variant="outline">{exportConfig.format.toUpperCase()}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExecute(exportConfig.id)}
                      disabled={executingId === exportConfig.id}
                    >
                      {executingId === exportConfig.id ? (
                        <>
                          <Download className="w-4 h-4 mr-2 animate-spin" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          Execute Now
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditingExport(exportConfig)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(exportConfig.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Schedule</div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" />
                      <span className="font-mono text-sm">{formatCronExpression(exportConfig.schedule)}</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Next Run</div>
                    <div>
                      {exportConfig.nextRun
                        ? new Date(exportConfig.nextRun).toLocaleString()
                        : 'Not scheduled'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Last Run</div>
                    <div>
                      {exportConfig.lastRun
                        ? new Date(exportConfig.lastRun).toLocaleString()
                        : 'Never'}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm text-muted-foreground mb-1">Recipients</div>
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      <span>
                        {exportConfig.recipients && exportConfig.recipients.length > 0
                          ? exportConfig.recipients.join(', ')
                          : 'None'}
                      </span>
                    </div>
                  </div>
                  {exportConfig.filters && (
                    <div className="md:col-span-2">
                      <div className="text-sm text-muted-foreground mb-1">Filters</div>
                      <div className="flex flex-wrap gap-2">
                        {exportConfig.filters.testType && (
                          <Badge variant="outline">Type: {exportConfig.filters.testType}</Badge>
                        )}
                        {exportConfig.filters.branch && (
                          <Badge variant="outline">Branch: {exportConfig.filters.branch}</Badge>
                        )}
                        {exportConfig.filters.timeRangeDays && (
                          <Badge variant="outline">Last {exportConfig.filters.timeRangeDays} days</Badge>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      {(showCreateDialog || editingExport) && (
        <ScheduledExportDialog
          export={editingExport}
          onSave={(config) => {
            if (editingExport) {
              handleUpdate(editingExport.id, config);
            } else {
              handleCreate(config);
            }
          }}
          onClose={() => {
            setShowCreateDialog(false);
            setEditingExport(null);
          }}
        />
      )}
    </div>
  );
}

interface ScheduledExportDialogProps {
  export?: ScheduledExport | null;
  onSave: (config: Omit<ScheduledExport, 'id' | 'createdAt' | 'updatedAt' | 'lastRun' | 'nextRun'>) => void;
  onClose: () => void;
}

function ScheduledExportDialog({ export: exportConfig, onSave, onClose }: ScheduledExportDialogProps) {
  const [name, setName] = useState(exportConfig?.name || '');
  const [schedule, setSchedule] = useState(exportConfig?.schedule || '0 9 * * 1');
  const [format, setFormat] = useState<'csv' | 'json' | 'xlsx' | 'pdf'>(exportConfig?.format || 'xlsx');
  const [testType, setTestType] = useState(exportConfig?.filters?.testType || '');
  const [branch, setBranch] = useState(exportConfig?.filters?.branch || '');
  const [timeRangeDays, setTimeRangeDays] = useState(exportConfig?.filters?.timeRangeDays || 30);
  const [recipients, setRecipients] = useState(exportConfig?.recipients?.join(', ') || '');
  const [enabled, setEnabled] = useState(exportConfig?.enabled !== false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      schedule,
      format,
      filters: {
        testType: testType || undefined,
        branch: branch || undefined,
        timeRangeDays: timeRangeDays || undefined,
      },
      recipients: recipients.split(',').map(r => r.trim()).filter(Boolean),
      enabled,
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-2 shadow-2xl">
        <DialogHeader>
          <DialogTitle>{exportConfig ? 'Edit' : 'Create'} Scheduled Export</DialogTitle>
          <DialogDescription>
            Configure automated test data exports with custom schedules and filters
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              placeholder="Weekly Test Report"
            />
          </div>

          <div>
            <Label htmlFor="schedule">Cron Schedule</Label>
            <Input
              id="schedule"
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              required
              placeholder="0 9 * * 1"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Cron expression (e.g., "0 9 * * 1" for every Monday at 9 AM)
            </p>
          </div>

          <div>
            <Label htmlFor="format">Format</Label>
            <select
              id="format"
              value={format}
              onChange={(e) => setFormat(e.target.value as 'csv' | 'json' | 'xlsx' | 'pdf')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
            >
              <option value="csv">CSV</option>
              <option value="json">JSON</option>
              <option value="xlsx">Excel (XLSX)</option>
              <option value="pdf">PDF</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="testType">Test Type (optional)</Label>
              <select
                id="testType"
                value={testType}
                onChange={(e) => setTestType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white"
              >
                <option value="">All Types</option>
                <option value="unit">Unit</option>
                <option value="integration">Integration</option>
                <option value="e2e">End-to-end</option>
                <option value="visual">Visual</option>
                <option value="performance">Performance</option>
              </select>
            </div>

            <div>
              <Label htmlFor="timeRangeDays">Time Range (days)</Label>
              <Input
                id="timeRangeDays"
                type="number"
                value={timeRangeDays}
                onChange={(e) => setTimeRangeDays(parseInt(e.target.value) || 30)}
                min={1}
                max={365}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="branch">Branch (optional)</Label>
            <Input
              id="branch"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
            />
          </div>

          <div>
            <Label htmlFor="recipients">Email Recipients (optional, comma-separated)</Label>
            <Input
              id="recipients"
              value={recipients}
              onChange={(e) => setRecipients(e.target.value)}
              placeholder="team@example.com, manager@example.com"
            />
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="enabled"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="enabled">Enabled</Label>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              {exportConfig ? 'Update' : 'Create'} Export
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

