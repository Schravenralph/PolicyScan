/**
 * Offline Indicator - Shows when the application is offline
 * 
 * Displays a banner when the network is offline to inform the user.
 */

import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import type { ReactElement } from 'react';
import { t } from '../../utils/i18n';

export function OfflineIndicator(): ReactElement | null {
  const { isOnline } = useNetworkStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: '#dc2626',
        color: 'white',
        padding: '12px 16px',
        textAlign: 'center',
        zIndex: 9999,
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
      }}
    >
      <strong>{t('network.offline')}</strong> - {t('network.offlineMessage')}
    </div>
  );
}


