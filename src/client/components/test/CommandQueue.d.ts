import { QueuedCommand } from '../../services/api/TestApiService';
interface CommandQueueProps {
    queue: QueuedCommand[];
    onCancel: (id: string) => void;
    onClear: () => void;
}
export declare function CommandQueue({ queue, onCancel, onClear }: CommandQueueProps): import("react/jsx-runtime").JSX.Element | null;
export {};
