export interface BaseLogEntry {
  id: string;
  timestamp: Date | string;
  message: string;
  localizedMessage?: string;
  thoughtBubble?: string;
  level?: 'info' | 'warn' | 'error' | 'debug';
  isComplete?: boolean;
  formattedMessage?: string;
  icon?: string;
  color?: string;
}
