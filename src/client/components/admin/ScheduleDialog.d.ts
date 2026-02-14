/**
 * Schedule Dialog Component
 *
 * Dialog for creating threshold schedules with time range, days of week, and thresholds.
 */
interface ScheduleDialogProps {
    onClose: () => void;
    onSave: (schedule: {
        name: string;
        timeRange: {
            start: string;
            end: string;
        };
        daysOfWeek: number[];
        thresholds: Record<string, number>;
        enabled: boolean;
    }) => void;
}
export declare function ScheduleDialog({ onClose, onSave }: ScheduleDialogProps): import("react/jsx-runtime").JSX.Element;
export {};
