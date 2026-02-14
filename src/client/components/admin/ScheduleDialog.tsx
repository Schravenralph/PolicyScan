/**
 * Schedule Dialog Component
 * 
 * Dialog for creating threshold schedules with time range, days of week, and thresholds.
 */

import { useState } from 'react';
import { t } from '../../utils/i18n';

interface ScheduleDialogProps {
  onClose: () => void;
  onSave: (schedule: {
    name: string;
    timeRange: { start: string; end: string };
    daysOfWeek: number[];
    thresholds: Record<string, number>;
    enabled: boolean;
  }) => void;
}

export function ScheduleDialog({ onClose, onSave }: ScheduleDialogProps) {
  const [name, setName] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('17:00');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 2, 3, 4, 5]);
  const [thresholds, setThresholds] = useState<Record<string, number>>({});

  const toggleDay = (day: number) => {
    setDaysOfWeek(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);
  };

  const handleSave = () => {
    onSave({
      name,
      timeRange: { start: startTime, end: endTime },
      daysOfWeek,
      thresholds,
      enabled: true,
    });
  };

  return (
    <div className="fixed inset-0 bg-white backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white border-primary rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto border-2 shadow-2xl">
        <h2 className="text-xl font-semibold mb-4">{t('admin.createThresholdSchedule')}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('admin.scheduleName')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-2"
              placeholder={t('admin.scheduleNamePlaceholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('admin.scheduleStartTime')}</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('admin.scheduleEndTime')}</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t('admin.scheduleDaysOfWeek')}</label>
            <div className="flex gap-2">
              {[t('common.sunday'), t('common.monday'), t('common.tuesday'), t('common.wednesday'), t('common.thursday'), t('common.friday'), t('common.saturday')].map((day, idx) => (
                <button
                  key={idx}
                  onClick={() => toggleDay(idx)}
                  className={`px-3 py-1 rounded text-sm ${daysOfWeek.includes(idx)
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-200 text-gray-700'
                    }`}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">{t('admin.scheduleThresholds')}</label>
            <div className="space-y-2">
              {['database_size_mb', 'knowledge_base_size_mb', 'error_rate_24h', 'api_response_time_p95_ms'].map((metric) => (
                <div key={metric} className="flex items-center justify-between">
                  <label className="text-sm capitalize">{metric.replace(/_/g, ' ')}</label>
                  <input
                    type="number"
                    value={thresholds[metric] || ''}
                    onChange={(e) => setThresholds({ ...thresholds, [metric]: Number(e.target.value) })}
                    className="w-32 border border-gray-300 rounded px-2 py-1 text-sm"
                    placeholder={t('admin.scheduleOptional')}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
          >
            {t('admin.createSchedule')}
          </button>
        </div>
      </div>
    </div>
  );
}

