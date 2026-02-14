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
declare function LogBubbleComponent({ log, variant, enableFadeOut, onFadeComplete, className, nextLog, }: LogBubbleProps): import("react/jsx-runtime").JSX.Element | null;
export declare const LogBubble: import("react").MemoExoticComponent<typeof LogBubbleComponent>;
