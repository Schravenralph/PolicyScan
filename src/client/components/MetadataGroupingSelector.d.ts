export type GroupingOption = 'none' | 'documentType' | 'theme' | 'date' | 'authority';
export interface MetadataGroupingSelectorProps {
    grouping: GroupingOption;
    onGroupingChange: (grouping: GroupingOption) => void;
    className?: string;
}
export declare function MetadataGroupingSelector({ grouping, onGroupingChange, className }: MetadataGroupingSelectorProps): import("react/jsx-runtime").JSX.Element;
