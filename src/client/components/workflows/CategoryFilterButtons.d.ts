/**
 * Category Filter Buttons Component
 *
 * Filter buttons for workflow module categories.
 */
interface CategoryFilterButtonsProps {
    categories: string[];
    selectedCategory: string;
    onCategoryChange: (category: string) => void;
}
export declare function CategoryFilterButtons({ categories, selectedCategory, onCategoryChange, }: CategoryFilterButtonsProps): import("react/jsx-runtime").JSX.Element | null;
export {};
