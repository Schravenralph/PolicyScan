interface QualityTrendsChartProps {
    dateRange: '7d' | '30d' | '90d' | 'all';
    onDateRangeChange: (range: '7d' | '30d' | '90d' | 'all') => void;
}
export declare function QualityTrendsChart({ dateRange, onDateRangeChange }: QualityTrendsChartProps): import("react/jsx-runtime").JSX.Element;
export {};
