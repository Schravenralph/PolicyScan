export type LayoutAlgorithm = 'dagre' | 'circular' | 'force';
interface LayoutSelectorProps {
    currentLayout: LayoutAlgorithm;
    onLayoutChange: (layout: LayoutAlgorithm) => void;
}
export declare function LayoutSelector({ currentLayout, onLayoutChange }: LayoutSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
