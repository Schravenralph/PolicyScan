/**
 * Validation Errors Display Component
 * 
 * Displays validation errors in a user-friendly format.
 */

import { AlertCircle } from 'lucide-react';

interface ValidationErrorsDisplayProps {
  errors: string[];
}

export function ValidationErrorsDisplay({ errors }: ValidationErrorsDisplayProps) {
  if (errors.length === 0) {
    return null;
  }

  return (
    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
      <div className="flex items-start gap-2">
        <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
        <div className="flex-1">
          <p className="font-medium text-red-800 mb-2">Validatiefouten:</p>
          <ul className="list-disc list-inside space-y-1 text-sm text-red-700">
            {errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
