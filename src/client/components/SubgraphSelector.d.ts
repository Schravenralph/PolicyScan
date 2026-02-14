import { Subgraph } from '../services/api';
interface SubgraphSelectorProps {
    onSelect: (subgraph: Subgraph | null) => void;
    selectedId?: string;
}
export declare function SubgraphSelector({ onSelect, selectedId }: SubgraphSelectorProps): import("react/jsx-runtime").JSX.Element;
export {};
