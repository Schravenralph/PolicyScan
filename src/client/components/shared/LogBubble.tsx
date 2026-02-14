import { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { translateLogMessage } from '../../utils/logTranslations';
import { BaseLogEntry } from '../../types/logTypes';

export type { BaseLogEntry };

interface LogBubbleProps {
  log: BaseLogEntry;
  variant?: 'default' | 'compact' | 'inline';
  enableFadeOut?: boolean;
  onFadeComplete?: () => void;
  className?: string;
  nextLog?: BaseLogEntry | null;
}

// Filter repetitive or low-value thought bubbles
function shouldShowThoughtBubble(thoughtBubble?: string): boolean {
  if (!thoughtBubble) return false;

  const filteredPatterns = [
    /Ik werk de navigatiegrafiek bij/i,
    /Navigation graph.*updated/i,
    /graph.*updated/i,
    /Updating graph/i,
    /Merging.*graph/i,
    /Consolidating.*graph/i,
  ];

  return !filteredPatterns.some((p) => p.test(thoughtBubble));
}

function LogBubbleComponent({
  log,
  variant = 'default',
  enableFadeOut = false,
  onFadeComplete,
  className = '',
  nextLog = null,
}: LogBubbleProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isFading, setIsFading] = useState(false);
  const [thoughtBubbleVisible, setThoughtBubbleVisible] = useState(true);

  const fadeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const shouldShow = useMemo(() => shouldShowThoughtBubble(log.thoughtBubble), [log.thoughtBubble]);
  const nextLogIsNonThought = !!(nextLog && !nextLog.thoughtBubble);

  // Hide thought when next non-thought appears
  useEffect(() => {
    if (nextLogIsNonThought && log.thoughtBubble && thoughtBubbleVisible) {
      setThoughtBubbleVisible(false);
    }
  }, [nextLogIsNonThought, log.thoughtBubble, thoughtBubbleVisible]);

  // Fade out once log is complete
  useEffect(() => {
    if (enableFadeOut && log.isComplete && !isFading) {
      fadeTimeoutRef.current = setTimeout(() => {
        setIsFading(true);
        setTimeout(() => {
          setIsVisible(false);
          if (onFadeComplete) onFadeComplete();
        }, 500);
      }, 3000);
    }

    return () => {
      if (fadeTimeoutRef.current) clearTimeout(fadeTimeoutRef.current);
    };
  }, [log.isComplete, isFading, enableFadeOut, onFadeComplete]);

  const levelStyles = useMemo(() => {
    const level = log.level || 'info';
    switch (level) {
      case 'error':
        return { bg: 'bg-red-950/30 border-red-800/50', hover: 'hover:border-red-700/50', text: 'text-red-400' };
      case 'warn':
        return { bg: 'bg-yellow-950/20 border-yellow-800/50', hover: 'hover:border-yellow-700/50', text: 'text-yellow-400' };
      case 'debug':
        return { bg: 'bg-gray-800/50 border-gray-700/50', hover: 'hover:border-gray-600/50', text: 'text-gray-400' };
      default:
        return { bg: 'bg-blue-950/20 border-blue-800/50', hover: 'hover:border-blue-700/50', text: 'text-blue-400' };
    }
  }, [log.level]);

  const thoughtText = useMemo(() => {
    if (!log.thoughtBubble) return '';
    const lines = log.thoughtBubble.split('\n');
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    return lines.join('\n');
  }, [log.thoughtBubble]);

  const formatTimestamp = useCallback((ts: Date | string): string => {
    if (typeof ts === 'string') {
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        return date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      }
      return ts;
    }
    if (isNaN(ts.getTime())) {
      return new Date().toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
    return ts.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, []);

  if (!isVisible) return null;

  // Translation fallback
  const rawMessage = log.localizedMessage ?? log.formattedMessage ?? log.message ?? '';
  const translated = translateLogMessage(rawMessage);
  const displayMessage = translated || rawMessage;

  const displayIcon = log.icon || '?';
  const displayColor = log.color || levelStyles.text;

  const showThought = !!(log.thoughtBubble && shouldShow && thoughtBubbleVisible);

  if (variant === 'inline') {
    return (
      <div className={`flex gap-3 group ${className}`} style={{ opacity: 1, transform: 'none' }}>
        <div className="shrink-0 w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 border-2 border-gray-700 flex items-center justify-center text-lg shadow-lg">
          {displayIcon}
        </div>

        <div className="flex-1 min-w-0">
          <div className={`${displayColor} text-sm font-medium mb-2 leading-relaxed`}>
            <span>{displayMessage}</span>
          </div>

          {showThought && (
            <div className="bg-gray-800/60 border-l-4 border-blue-500/50 rounded-r-lg p-3 text-xs text-gray-300 leading-relaxed mb-2 shadow-sm">
              <div className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0 font-semibold">?</span>
                <div className="flex-1">
                  <span>{thoughtText}</span>
                </div>
              </div>
            </div>
          )}

          <div className="text-gray-600 text-[10px] mt-1 font-mono">{formatTimestamp(log.timestamp)}</div>
        </div>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`group relative rounded-lg border transition-all duration-200 ${levelStyles.bg} ${levelStyles.hover} ${className}`}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{displayIcon}</span>
              <span className={`text-sm font-medium ${displayColor}`}>{(log.level || 'info').toUpperCase()}</span>
            </div>
            <span className="text-xs text-gray-500 font-mono">{formatTimestamp(log.timestamp)}</span>
          </div>

          <div className="mb-2">
            <div className={`text-gray-100 text-sm leading-relaxed ${displayColor} font-medium`}>
              <span>{displayMessage}</span>
            </div>
          </div>

          {showThought && (
            <div className="mt-3 pt-3 border-t border-gray-700/50">
              <div className="flex items-start gap-2">
                <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-400 mt-1.5"></div>
                <div className="flex-1">
                  <p className="text-xs text-gray-400 italic leading-relaxed">
                    <span>{thoughtText}</span>
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div
          className={`absolute top-0 right-0 w-16 h-16 opacity-10 pointer-events-none ${
            log.level === 'error' ? 'bg-red-500' : log.level === 'warn' ? 'bg-yellow-500' : log.level === 'debug' ? 'bg-gray-500' : 'bg-blue-500'
          } rounded-bl-full`}
        />
      </div>
    );
  }

  // Default variant
  return (
    <div
      className={`rounded-lg border p-3 transition-all duration-500 ${isFading ? 'opacity-0 translate-x-4' : 'opacity-100 translate-x-0'} ${
        levelStyles.bg
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 border-2 border-gray-700 flex items-center justify-center text-sm shadow-lg">
          {displayIcon}
        </div>

        <div className="flex-1 min-w-0">
          <div className="text-gray-100 text-sm leading-relaxed mb-2">
            <span>{displayMessage}</span>
          </div>

          {showThought && (
            <div className={`mt-2 bg-gray-800/60 border-l-4 border-blue-500/50 rounded-r-lg p-2.5 text-xs text-gray-300 leading-relaxed ${!thoughtBubbleVisible ? 'hidden' : ''}`}>
              <div className="flex items-start gap-2">
                <span className="text-blue-400 shrink-0 font-semibold">?</span>
                <div className="flex-1">
                  <span>{thoughtText}</span>
                </div>
              </div>
            </div>
          )}

          <div className="text-gray-600 text-[10px] mt-1.5 font-mono">{formatTimestamp(log.timestamp)}</div>
        </div>
      </div>
    </div>
  );
}

// Memo comparator
function areLogPropsEqual(prevProps: LogBubbleProps, nextProps: LogBubbleProps) {
  if (prevProps.variant !== nextProps.variant) return false;
  if (prevProps.enableFadeOut !== nextProps.enableFadeOut) return false;
  if (prevProps.className !== nextProps.className) return false;

  const prevLog = prevProps.log;
  const nextLog = nextProps.log;

  if (prevLog !== nextLog) {
    if (prevLog.id !== nextLog.id) return false;
    if (prevLog.message !== nextLog.message) return false;
    if (prevLog.localizedMessage !== nextLog.localizedMessage) return false;
    if (prevLog.formattedMessage !== nextLog.formattedMessage) return false;
    if (prevLog.thoughtBubble !== nextLog.thoughtBubble) return false;
    if (prevLog.isComplete !== nextLog.isComplete) return false;

    const prevTime = prevLog.timestamp instanceof Date ? prevLog.timestamp.getTime() : new Date(prevLog.timestamp).getTime();
    const nextTime = nextLog.timestamp instanceof Date ? nextLog.timestamp.getTime() : new Date(nextLog.timestamp).getTime();
    if (prevTime !== nextTime) return false;
  }

  const prevNextLogIsNonThought = !!(prevProps.nextLog && !prevProps.nextLog.thoughtBubble);
  const nextNextLogIsNonThought = !!(nextProps.nextLog && !nextProps.nextLog.thoughtBubble);
  if (prevNextLogIsNonThought !== nextNextLogIsNonThought) return false;

  if (prevProps.onFadeComplete !== nextProps.onFadeComplete) return false;

  return true;
}

export const LogBubble = memo(LogBubbleComponent, areLogPropsEqual);
