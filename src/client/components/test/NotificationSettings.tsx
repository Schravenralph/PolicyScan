/**
 * Notification Settings Component
 * 
 * UI for configuring test notification preferences (browser, email, Slack).
 */

import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TestNotificationService, getTestNotificationService } from '../../services/notifications/TestNotificationService';
import { Bell, Mail, MessageSquare, CheckCircle2, Settings, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Alert, AlertDescription } from '../ui/alert';
import { t } from '../../utils/i18n';

interface NotificationSettingsProps {
  testNotificationService?: TestNotificationService;
}

export function NotificationSettings({ testNotificationService: injectedService }: NotificationSettingsProps) {
  const navigate = useNavigate();
  const notificationService = injectedService || getTestNotificationService();
  
  const [browserEnabled, setBrowserEnabled] = useState(false);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>('default');
  const [emailEnabled, setEmailEnabled] = useState(false);
  const [emailRecipients, setEmailRecipients] = useState<string>('');
  const [slackEnabled, setSlackEnabled] = useState(false);
  const [slackChannel, setSlackChannel] = useState('');
  const [slackWebhookUrl, setSlackWebhookUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Load current settings
    const browserChannel = notificationService.getChannelStatus('browser');
    setBrowserEnabled(browserChannel?.enabled || false);
    setBrowserPermission(notificationService.getPermission());

    const emailChannel = notificationService.getChannelStatus('email');
    setEmailEnabled(emailChannel?.enabled || false);
    if (emailChannel?.config?.recipients) {
      setEmailRecipients((emailChannel.config.recipients as string[]).join(', '));
    }

    const slackChannel = notificationService.getChannelStatus('slack');
    setSlackEnabled(slackChannel?.enabled || false);
    if (slackChannel?.config?.channel) {
      setSlackChannel(slackChannel.config.channel as string);
    }
    if (slackChannel?.config?.webhookUrl) {
      setSlackWebhookUrl(slackChannel.config.webhookUrl as string);
    }
  }, [notificationService]);

  const handleRequestBrowserPermission = useCallback(async () => {
    try {
      const permission = await notificationService.requestPermission();
      setBrowserPermission(permission);
      if (permission === 'granted') {
        setBrowserEnabled(true);
        notificationService.setChannelEnabled('browser', true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request browser permission');
    }
  }, [notificationService]);

  const handleSave = useCallback(async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(false);

      // Save browser settings
      notificationService.setChannelEnabled('browser', browserEnabled);

      // Save email settings
      if (emailEnabled) {
        const recipients = emailRecipients
          .split(',')
          .map(r => r.trim())
          .filter(Boolean);
        notificationService.setChannelEnabled('email', true);
        notificationService.configureChannel('email', { recipients });
      } else {
        notificationService.setChannelEnabled('email', false);
      }

      // Save Slack settings
      if (slackEnabled) {
        notificationService.setChannelEnabled('slack', true);
        const slackConfig: Record<string, unknown> = {};
        if (slackChannel) {
          slackConfig.channel = slackChannel;
        }
        if (slackWebhookUrl) {
          slackConfig.webhookUrl = slackWebhookUrl;
        }
        notificationService.configureChannel('slack', slackConfig);
      } else {
        notificationService.setChannelEnabled('slack', false);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  }, [notificationService, browserEnabled, emailEnabled, emailRecipients, slackEnabled, slackChannel]);

  const handleTestNotification = useCallback(async (channel: 'browser' | 'email' | 'slack') => {
    try {
      if (channel === 'browser') {
        await notificationService.sendBrowserNotification({
          title: 'Test Notification',
          body: 'This is a test notification from the test dashboard.',
          tag: 'test-notification',
        });
      } else if (channel === 'email') {
        const recipients = emailRecipients.split(',').map(r => r.trim()).filter(Boolean);
        if (recipients.length === 0) {
          setError('Please enter at least one email address');
          return;
        }
        for (const recipient of recipients) {
          await notificationService.sendEmailNotification({
            to: recipient,
            subject: 'Test Notification - Test Dashboard',
            body: 'This is a test notification from the test dashboard.',
            html: `<p>${t('test.testNotificationMessage')}</p>`,
          });
        }
      } else if (channel === 'slack') {
        if (!slackWebhookUrl.trim()) {
          setError('Please enter a Slack webhook URL');
          return;
        }
        await notificationService.sendSlackNotification({
          text: 'Test notification from test dashboard',
          channel: slackChannel || undefined,
          webhookUrl: slackWebhookUrl,
        });
      }
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to send test ${channel} notification`);
    }
  }, [notificationService, emailRecipients, slackChannel, slackWebhookUrl]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Notification Settings
          </CardTitle>
          <CardDescription>
            Configure how you receive test notifications (failures, alerts, completions)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert>
              <CheckCircle2 className="w-4 h-4" />
              <AlertDescription>{t('test.settingsSavedSuccessfully')}</AlertDescription>
            </Alert>
          )}

          {/* Browser Notifications */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Bell className="w-5 h-5" />
                <div>
                  <Label htmlFor="browser-enabled" className="text-base font-medium">
                    Browser Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications in your browser
                  </p>
                </div>
              </div>
              <Switch
                id="browser-enabled"
                checked={browserEnabled}
                onCheckedChange={(checked) => {
                  setBrowserEnabled(checked);
                  if (checked && browserPermission !== 'granted') {
                    handleRequestBrowserPermission();
                  } else {
                    notificationService.setChannelEnabled('browser', checked);
                  }
                }}
                disabled={browserPermission === 'denied'}
              />
            </div>
            {browserPermission === 'default' && (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRequestBrowserPermission}
                >
                  Request Permission
                </Button>
                <span className="text-sm text-muted-foreground">
                  Browser permission required
                </span>
              </div>
            )}
            {browserPermission === 'granted' && (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-50 text-green-700">
                  <CheckCircle2 className="w-3 h-3 mr-1" />
                  Permission granted
                </Badge>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestNotification('browser')}
                >
                  Test Notification
                </Button>
              </div>
            )}
            {browserPermission === 'denied' && (
              <div className="text-sm text-red-600">
                Browser notifications are blocked. Please enable them in your browser settings.
              </div>
            )}
          </div>

          {/* Email Notifications */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Mail className="w-5 h-5" />
                <div>
                  <Label htmlFor="email-enabled" className="text-base font-medium">
                    Email Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications via email
                  </p>
                </div>
              </div>
              <Switch
                id="email-enabled"
                checked={emailEnabled}
                onCheckedChange={setEmailEnabled}
              />
            </div>
            {emailEnabled && (
              <div className="space-y-2">
                <Label htmlFor="email-recipients">{t('common.emailAddresses')}</Label>
                <Input
                  id="email-recipients"
                  type="email"
                  placeholder="email1@example.com, email2@example.com"
                  value={emailRecipients}
                  onChange={(e) => setEmailRecipients(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter email addresses separated by commas
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/tests/notifications/email-config')}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Configure Email Settings
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleTestNotification('email')}
                    disabled={!emailRecipients.trim()}
                  >
                    Test Email
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Slack Notifications */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5" />
                <div>
                  <Label htmlFor="slack-enabled" className="text-base font-medium">
                    Slack Notifications
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Receive notifications in Slack
                  </p>
                </div>
              </div>
              <Switch
                id="slack-enabled"
                checked={slackEnabled}
                onCheckedChange={setSlackEnabled}
              />
            </div>
            {slackEnabled && (
              <div className="space-y-2">
                <Label htmlFor="slack-webhook-url">Slack Webhook URL *</Label>
                <Input
                  id="slack-webhook-url"
                  type="url"
                  placeholder="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
                  value={slackWebhookUrl}
                  onChange={(e) => setSlackWebhookUrl(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Enter your Slack incoming webhook URL. Get one from{' '}
                  <a
                    href="https://api.slack.com/messaging/webhooks"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    Slack API
                  </a>
                </p>
                <Label htmlFor="slack-channel">Slack Channel (optional)</Label>
                <Input
                  id="slack-channel"
                  placeholder="#test-alerts"
                  value={slackChannel}
                  onChange={(e) => setSlackChannel(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Leave empty to use default channel configured in webhook
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleTestNotification('slack')}
                  disabled={!slackWebhookUrl.trim()}
                >
                  Test Slack
                </Button>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <>
                  <span className="animate-spin mr-2">⏳</span>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  Save Settings
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


