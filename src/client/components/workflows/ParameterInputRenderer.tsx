/**
 * Parameter Input Renderer Component
 * 
 * Renders parameter inputs based on parameter schema type.
 */

import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { t } from '../../utils/i18n';

interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  label: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: Array<{ value: string | number; label: string }>;
  validation?: {
    min?: number;
    max?: number;
    pattern?: string;
  };
}

interface ParameterInputRendererProps {
  stepIndex: number;
  paramKey: string;
  paramDef: ParameterSchema;
  value: unknown;
  onValueChange: (stepIndex: number, paramKey: string, value: unknown) => void;
}

export function ParameterInputRenderer({
  stepIndex,
  paramKey,
  paramDef,
  value,
  onValueChange,
}: ParameterInputRendererProps) {
  const currentValue = value !== undefined ? value : paramDef.default;

  switch (paramDef.type) {
    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={currentValue === true}
            onChange={(e) => onValueChange(stepIndex, paramKey, e.target.checked)}
            className="rounded"
          />
          <span className="text-sm text-gray-600 dark:text-gray-400">{paramDef.label}</span>
        </div>
      );
    case 'number':
      return (
        <div>
          <Label className="text-xs">{paramDef.label}</Label>
          <Input
            type="number"
            value={currentValue as number || ''}
            onChange={(e) => {
              const numValue = e.target.value ? Number(e.target.value) : undefined;
              onValueChange(stepIndex, paramKey, numValue);
            }}
            min={paramDef.validation?.min}
            max={paramDef.validation?.max}
            className="mt-1"
          />
          {paramDef.description && (
            <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
          )}
        </div>
      );
    case 'array':
      return (
        <div>
          <Label className="text-xs">{paramDef.label}</Label>
          <Input
            type="text"
            value={Array.isArray(currentValue) ? currentValue.join(', ') : ''}
            onChange={(e) => {
              const arrayValue = e.target.value.split(',').map(v => v.trim()).filter(v => v);
              onValueChange(stepIndex, paramKey, arrayValue);
            }}
            placeholder={t('workflow.commaSeparatedValues')}
            className="mt-1"
          />
          {paramDef.description && (
            <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
          )}
        </div>
      );
    case 'string':
    default:
      if (paramDef.options) {
        return (
          <div>
            <Label className="text-xs">{paramDef.label}</Label>
            <Select
              value={String(currentValue || '')}
              onValueChange={(val) => onValueChange(stepIndex, paramKey, val)}
            >
              <SelectTrigger className="mt-1">
                <SelectValue placeholder={t('workflow.selectParameter').replace('{{label}}', paramDef.label)} />
              </SelectTrigger>
              <SelectContent>
                {paramDef.options.map(option => (
                  <SelectItem key={String(option.value)} value={String(option.value)}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {paramDef.description && (
              <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
            )}
          </div>
        );
      }
      return (
        <div>
          <Label className="text-xs">{paramDef.label}</Label>
          <Input
            type="text"
            value={String(currentValue || '')}
            onChange={(e) => onValueChange(stepIndex, paramKey, e.target.value)}
            className="mt-1"
          />
          {paramDef.description && (
            <p className="text-xs text-gray-500 mt-1">{paramDef.description}</p>
          )}
        </div>
      );
  }
}
