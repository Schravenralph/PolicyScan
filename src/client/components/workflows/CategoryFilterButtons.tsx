/**
 * Category Filter Buttons Component
 * 
 * Filter buttons for workflow module categories.
 */

import { Button } from '../ui/button';
import { t } from '../../utils/i18n';

interface CategoryFilterButtonsProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export function CategoryFilterButtons({
  categories,
  selectedCategory,
  onCategoryChange,
}: CategoryFilterButtonsProps) {
  if (categories.length === 0) {
    return null;
  }

  return (
    <div className="mb-3 flex gap-2 flex-wrap">
      <Button
        type="button"
        size="sm"
        variant={selectedCategory === 'all' ? 'default' : 'outline'}
        onClick={() => onCategoryChange('all')}
      >
        {t('workflow.allCategories')}
      </Button>
      {categories.map(category => (
        <Button
          key={category}
          type="button"
          size="sm"
          variant={selectedCategory === category ? 'default' : 'outline'}
          onClick={() => onCategoryChange(category)}
        >
          {category ? category.charAt(0).toUpperCase() + category.slice(1) : category}
        </Button>
      ))}
    </div>
  );
}
