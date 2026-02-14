/**
 * Test History Filters Component
 * 
 * Filter controls and view mode selector for test history.
 */

import { Search } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { t } from '../../utils/i18n';

interface TestHistoryFiltersProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  testTypeFilter: string;
  onTestTypeChange: (filter: string) => void;
  branchFilter: string;
  onBranchChange: (filter: string) => void;
  statusFilter: string;
  onStatusChange: (filter: string) => void;
  sortBy: 'timestamp' | 'duration' | 'passRate';
  onSortByChange: (sortBy: 'timestamp' | 'duration' | 'passRate') => void;
  sortOrder: 'asc' | 'desc';
  onSortOrderChange: (order: 'asc' | 'desc') => void;
  viewMode: 'list' | 'chart' | 'timeline';
  onViewModeChange: (mode: 'list' | 'chart' | 'timeline') => void;
  uniqueTestTypes: string[];
  uniqueBranches: string[];
}

export function TestHistoryFilters({
  searchQuery,
  onSearchChange,
  testTypeFilter,
  onTestTypeChange,
  branchFilter,
  onBranchChange,
  statusFilter,
  onStatusChange,
  sortBy,
  onSortByChange,
  sortOrder,
  onSortOrderChange,
  viewMode,
  onViewModeChange,
  uniqueTestTypes,
  uniqueBranches,
}: TestHistoryFiltersProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Filters & Search</CardTitle>
          <div className="flex gap-2">
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewModeChange('list')}
            >
              List
            </Button>
            <Button
              variant={viewMode === 'chart' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewModeChange('chart')}
            >
              Chart
            </Button>
            <Button
              variant={viewMode === 'timeline' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onViewModeChange('timeline')}
            >
              Timeline
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Search className="w-4 h-4" />
              <label className="text-sm font-medium">{t('testHistoryFilters.search')}</label>
            </div>
            <Input
              placeholder={t('testHistoryFilters.searchPlaceholder')}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">{t('testHistoryFilters.testType')}</label>
            <Select value={testTypeFilter} onValueChange={onTestTypeChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('testHistoryFilters.allTypes')}</SelectItem>
                {uniqueTestTypes.map(type => (
                  <SelectItem key={type} value={type || ''}>{type || ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">{t('testHistoryFilters.branch')}</label>
            <Select value={branchFilter} onValueChange={onBranchChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('testHistoryFilters.allBranches')}</SelectItem>
                {uniqueBranches.map(branch => (
                  <SelectItem key={branch} value={branch || ''}>{branch || ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">{t('testHistoryFilters.status')}</label>
            <Select value={statusFilter} onValueChange={onStatusChange}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('testAdvancedSearch.all')}</SelectItem>
                <SelectItem value="passed">{t('testAdvancedSearch.passed')}</SelectItem>
                <SelectItem value="failed">{t('testAdvancedSearch.failed')}</SelectItem>
                <SelectItem value="partial">{t('testAdvancedSearch.partial')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">{t('testHistoryFilters.sortBy')}</label>
            <Select value={sortBy} onValueChange={(v) => onSortByChange(v as 'timestamp' | 'duration' | 'passRate')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="timestamp">{t('testHistoryFilters.timestamp')}</SelectItem>
                <SelectItem value="duration">{t('testHistoryFilters.duration')}</SelectItem>
                <SelectItem value="passRate">{t('testHistoryFilters.passRate')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium mb-2 block">{t('testHistoryFilters.order')}</label>
            <Select value={sortOrder} onValueChange={(v) => onSortOrderChange(v as 'asc' | 'desc')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="desc">{t('testHistoryFilters.descending')}</SelectItem>
                <SelectItem value="asc">{t('testHistoryFilters.ascending')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
