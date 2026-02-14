/**
 * Email Configuration Page
 * 
 * Comprehensive settings for email notifications: what, when, and how.
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Save, ArrowLeft, Clock, FileText, Settings, CheckCircle2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Alert, AlertDescription } from '../components/ui/alert';
import { Separator } from '../components/ui/separator';
import type {
  EmailConfiguration,
  EmailEventType,
  EmailFrequency,
  EmailFormat,
} from '../types/emailConfiguration';
import {
  EVENT_TYPE_LABELS,
  FREQUENCY_LABELS,
  FORMAT_LABELS,
  DEFAULT_EMAIL_EVENTS,
} from '../types/emailConfiguration';

const STORAGE_KEY = 'email_configuration';

export function EmailConfigurationPage() {
  const navigate = useNavigate();
  const [config, setConfig] = useState<EmailConfiguration>({
    recipients: [],
    events: DEFAULT_EMAIL_EVENTS,
    schedule: {
      frequency: 'daily_digest',
      time: '09:00',
    },
    format: {
      format: 'html',
      includeDetails: true,
      includeStackTrace: false,
      includeMetrics: true,
      maxItems: 50,
    },
    enabled: true,
  });
  const [recipientInput, setRecipientInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [queuedEvents, setQueuedEvents] = useState<number>(0);
  const [loadingQueue, setLoadingQueue] = useState(false);

  useEffect(() => {
    // Load saved configuration from backend
    const loadConfig = async () => {
      try {
        const response = await fetch('/api/tests/notifications/email/config', {
          credentials: 'include', // Include cookies for authentication
        });
        if (response.ok) {
          const data = await response.json();
          if (data.config) {
            setConfig({
              ...data.config,
              createdAt: data.config.createdAt,
              updatedAt: data.config.updatedAt,
            });
            if (data.config.recipients) {
              setRecipientInput(data.config.recipients.join(', '));
            }
          }
        }
      } catch (err) {
        console.error('Failed to load email configuration:', err);
        // Fallback to localStorage
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setConfig(parsed);
            if (parsed.recipients) {
              setRecipientInput(parsed.recipients.join(', '));
            }
          } catch (parseErr) {
            console.error('Failed to parse saved configuration:', parseErr);
          }
        }
      }
    };

    loadConfig();
    
    // Load queued events count
    const loadQueue = async () => {
      try {
        setLoadingQueue(true);
        const response = await fetch('/api/tests/notifications/email/digest/queue', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setQueuedEvents(data.count || 0);
        }
      } catch (err) {
        console.error('Failed to load digest queue:', err);
      } finally {
        setLoadingQueue(false);
      }
    };

    loadQueue();
    // Refresh queue count every 30 seconds
    const interval = setInterval(loadQueue, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleAddRecipient = useCallback(() => {
    const emails = recipientInput
      .split(',')
      .map(e => e.trim())
      .filter(e => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(e);
      });

    if (emails.length === 0) {
      setError('Please enter valid email addresses');
      return;
    }

    setConfig(prev => ({
      ...prev,
      recipients: [...new Set([...prev.recipients, ...emails])],
    }));
    setRecipientInput('');
    setError(null);
  }, [recipientInput]);

  const handleRemoveRecipient = useCallback((email: string) => {
    setConfig(prev => ({
      ...prev,
      recipients: prev.recipients.filter(e => e !== email),
    }));
  }, []);

  const handleEventToggle = useCallback((eventType: EmailEventType, enabled: boolean) => {
    setConfig(prev => ({
      ...prev,
      events: prev.events.map(e =>
        e.eventType === eventType ? { ...e, enabled } : e
      ),
    }));
  }, []);

  const handleEventFrequencyChange = useCallback((eventType: EmailEventType, frequency: EmailFrequency) => {
    setConfig(prev => ({
      ...prev,
      events: prev.events.map(e =>
        e.eventType === eventType ? { ...e, frequency } : e
      ),
    }));
  }, []);

  const handleEventSeverityChange = useCallback((eventType: EmailEventType, severity: 'low' | 'medium' | 'high' | 'critical') => {
    setConfig(prev => ({
      ...prev,
      events: prev.events.map(e =>
        e.eventType === eventType ? { ...e, severity } : e
      ),
    }));
  }, []);

  const handleSave = useCallback(async () => {
    if (config.recipients.length === 0) {
      setError('Please add at least one email recipient');
      return;
    }

    // Validate email addresses
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (const email of config.recipients) {
      if (!emailRegex.test(email)) {
        setError(`Invalid email address: ${email}`);
        return;
      }
    }

    // Validate at least one event is enabled
    const hasEnabledEvent = config.events.some(e => e.enabled);
    if (!hasEnabledEvent) {
      setError('Please enable at least one event type');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      const configToSave: EmailConfiguration = {
        ...config,
        updatedAt: new Date().toISOString(),
      };

      localStorage.setItem(STORAGE_KEY, JSON.stringify(configToSave));

      // Save to backend API
      const response = await fetch('/api/tests/notifications/email/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({
          recipients: configToSave.recipients,
          events: configToSave.events,
          schedule: configToSave.schedule,
          format: configToSave.format,
          enabled: configToSave.enabled,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to save configuration');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save configuration');
    } finally {
      setSaving(false);
    }
  }, [config]);

  return (
    <div className="p-8 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Mail className="w-8 h-8" />
            Email Notification Configuration
          </h1>
          <p className="text-muted-foreground mt-1">
            Configure what, when, and how you receive email notifications
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/tests/notifications')}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Notifications
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="w-4 h-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert>
          <CheckCircle2 className="w-4 h-4" />
          <AlertDescription>Configuration saved successfully!</AlertDescription>
        </Alert>
      )}

      {/* Recipients */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Email Recipients
          </CardTitle>
          <CardDescription>
            Who should receive email notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="email1@example.com, email2@example.com"
              value={recipientInput}
              onChange={(e) => setRecipientInput(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleAddRecipient();
                }
              }}
            />
            <Button onClick={handleAddRecipient}>Add</Button>
          </div>
          {config.recipients.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {config.recipients.map(email => (
                <Badge key={email} variant="outline" className="flex items-center gap-1">
                  {email}
                  <button
                    onClick={() => handleRemoveRecipient(email)}
                    className="ml-1 hover:text-red-600"
                  >
                    ×
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* What to Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            What to Email
          </CardTitle>
          <CardDescription>
            Select which events trigger email notifications
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {config.events.map(event => (
            <div key={event.eventType} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={event.enabled}
                    onCheckedChange={(checked) => handleEventToggle(event.eventType, checked)}
                  />
                  <Label className="text-base font-medium">
                    {EVENT_TYPE_LABELS[event.eventType]}
                  </Label>
                </div>
              </div>
              {event.enabled && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-8">
                  <div>
                    <Label className="text-sm">Frequency</Label>
                    <Select
                      value={event.frequency}
                      onValueChange={(value) => handleEventFrequencyChange(event.eventType, value as EmailFrequency)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {event.eventType.includes('failure') || event.eventType === 'test_alert' ? (
                    <div>
                      <Label className="text-sm">Minimum Severity</Label>
                      <Select
                        value={event.severity || 'medium'}
                        onValueChange={(value) => handleEventSeverityChange(event.eventType, value as 'low' | 'medium' | 'high' | 'critical')}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* When to Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              When to Email
            </div>
            {queuedEvents > 0 && (
              <Badge variant="outline" className="bg-blue-50 text-blue-700">
                {queuedEvents} event{queuedEvents !== 1 ? 's' : ''} queued
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Schedule for digest and summary emails
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Default Digest Frequency</Label>
              <Select
                value={config.schedule.frequency}
                onValueChange={(value) => setConfig(prev => ({
                  ...prev,
                  schedule: { ...prev.schedule, frequency: value as EmailFrequency },
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FREQUENCY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(config.schedule.frequency === 'daily_digest' || config.schedule.frequency === 'weekly_summary') && (
              <div>
                <Label>Time</Label>
                <Input
                  type="time"
                  value={config.schedule.time || '09:00'}
                  onChange={(e) => setConfig(prev => ({
                    ...prev,
                    schedule: { ...prev.schedule, time: e.target.value },
                  }))}
                />
              </div>
            )}
            {config.schedule.frequency === 'weekly_summary' && (
              <div>
                <Label>Day of Week</Label>
                <Select
                  value={String(config.schedule.dayOfWeek || 1)}
                  onValueChange={(value) => setConfig(prev => ({
                    ...prev,
                    schedule: { ...prev.schedule, dayOfWeek: parseInt(value) },
                  }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">Sunday</SelectItem>
                    <SelectItem value="1">Monday</SelectItem>
                    <SelectItem value="2">Tuesday</SelectItem>
                    <SelectItem value="3">Wednesday</SelectItem>
                    <SelectItem value="4">Thursday</SelectItem>
                    <SelectItem value="5">Friday</SelectItem>
                    <SelectItem value="6">Saturday</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* How to Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            How to Email
          </CardTitle>
          <CardDescription>
            Email format and content options
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Email Format</Label>
              <Select
                value={config.format.format}
                onValueChange={(value) => setConfig(prev => ({
                  ...prev,
                  format: { ...prev.format, format: value as EmailFormat },
                }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FORMAT_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Max Items in Digest</Label>
              <Input
                type="number"
                min="1"
                max="1000"
                value={config.format.maxItems || 50}
                onChange={(e) => setConfig(prev => ({
                  ...prev,
                  format: { ...prev.format, maxItems: parseInt(e.target.value) || 50 },
                }))}
              />
            </div>
          </div>
          <Separator />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Include Detailed Information</Label>
              <Switch
                checked={config.format.includeDetails}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  format: { ...prev.format, includeDetails: checked },
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Include Stack Traces</Label>
              <Switch
                checked={config.format.includeStackTrace}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  format: { ...prev.format, includeStackTrace: checked },
                }))}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label>Include Test Metrics</Label>
              <Switch
                checked={config.format.includeMetrics}
                onCheckedChange={(checked) => setConfig(prev => ({
                  ...prev,
                  format: { ...prev.format, includeMetrics: checked },
                }))}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center gap-2">
        <Button
          variant="outline"
          onClick={async () => {
            try {
              setError(null);
              setLoadingQueue(true);
              const response = await fetch('/api/tests/notifications/email/digest/trigger', {
                method: 'POST',
                credentials: 'include',
              });
              if (response.ok) {
                setSuccess(true);
                setTimeout(() => setSuccess(false), 3000);
                // Refresh queue count
                const queueResponse = await fetch('/api/tests/notifications/email/digest/queue', {
                  credentials: 'include',
                });
                if (queueResponse.ok) {
                  const queueData = await queueResponse.json();
                  setQueuedEvents(queueData.count || 0);
                }
              } else {
                const errorData = await response.json().catch(() => ({}));
                setError(errorData.message || 'Failed to trigger digest');
              }
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Failed to trigger digest');
            } finally {
              setLoadingQueue(false);
            }
          }}
          disabled={config.recipients.length === 0 || loadingQueue}
        >
          {loadingQueue ? 'Sending...' : queuedEvents > 0 ? `Test Digest (${queuedEvents} events)` : 'Test Digest'}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => navigate('/tests/notifications')}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || config.recipients.length === 0}>
            {saving ? (
              <>
                <span className="animate-spin mr-2">⏳</span>
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Configuration
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

