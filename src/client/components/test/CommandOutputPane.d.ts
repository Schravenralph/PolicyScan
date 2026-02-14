export interface CommandOutputPaneProps {
    isOpen: boolean;
    onClose: () => void;
    command: string;
    output: string[];
    status: 'idle' | 'running' | 'success' | 'error';
    onClear?: () => void;
}
/**
 * CommandOutputPane - Displays real-time command execution output
 *
 * Features:
 * - Real-time output streaming
 * - Auto-scroll to bottom (disabled when user scrolls up)
 * - Copy to clipboard
 * - Clear output
 * - Status indicators
 * - Terminal-like appearance
 * - Output filtering and search
 */
export declare function CommandOutputPane({ isOpen, onClose, command, output, status, onClear, }: CommandOutputPaneProps): import("react/jsx-runtime").JSX.Element;
