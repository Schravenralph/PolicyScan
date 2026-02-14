/**
 * MetricCard Component
 *
 * Displays a metric card with title, value, and subtitle.
 */
interface MetricCardProps {
    title: string;
    value: number;
    subtitle: string;
    className?: string;
    onClick?: () => void;
}
export declare function MetricCard({ title, value, subtitle, className, onClick }: MetricCardProps): import("react/jsx-runtime").JSX.Element;
export {};
