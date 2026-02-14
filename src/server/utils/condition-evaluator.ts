/**
 * Condition Evaluator Utility
 * 
 * Evaluates conditional expressions for workflow step execution.
 * Supports simple expressions like:
 * - Variable comparisons: `context.count > 10`
 * - Boolean checks: `context.hasResults`
 * - String operations: `context.status === "completed"`
 * - Array operations: `context.items.length > 0`
 * - Nested property access: `context.step1.result.success`
 */

export type ConditionExpression = string | boolean | ((context: Record<string, unknown>) => boolean);

export interface ConditionEvaluationResult {
  result: boolean;
  error?: string;
}

/**
 * Evaluates a condition expression against a context
 */
export function evaluateCondition(
  condition: ConditionExpression,
  context: Record<string, unknown>
): ConditionEvaluationResult {
  try {
    // Handle boolean literals
    if (typeof condition === 'boolean') {
      return { result: condition };
    }

    // Handle function conditions
    if (typeof condition === 'function') {
      try {
        const result = condition(context);
        return { result: Boolean(result) };
      } catch (error) {
        return {
          result: false,
          error: `Function condition error: ${error instanceof Error ? error.message : String(error)}`
        };
      }
    }

    // Handle string expressions
    if (typeof condition === 'string') {
      return evaluateStringExpression(condition, context);
    }

    return {
      result: false,
      error: `Unsupported condition type: ${typeof condition}`
    };
  } catch (error) {
    return {
      result: false,
      error: `Condition evaluation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Evaluates a string expression against context
 * Supports:
 * - Property access: `context.property`
 * - Comparisons: `==`, `===`, `!=`, `!==`, `>`, `<`, `>=`, `<=`
 * - Logical operators: `&&`, `||`, `!`
 * - Array operations: `.length`, `.includes()`
 * - Type checks: `typeof`, `Array.isArray()`
 */
function evaluateStringExpression(
  expression: string,
  context: Record<string, unknown>
): ConditionEvaluationResult {
  try {
    // Normalize whitespace
    const normalized = expression.trim();

    // Handle empty or simple boolean strings
    if (normalized === 'true') return { result: true };
    if (normalized === 'false') return { result: false };
    if (!normalized) return { result: false, error: 'Empty condition expression' };

    // Check if this is a simple property access (no operators)
    const hasOperators = /[=<>!&|]/.test(normalized);
    
    if (!hasOperators && normalized.startsWith('context.')) {
      // Simple property access - evaluate directly
      const path = normalized.replace(/^context\./, '');
      const value = getNestedValue(context, path);
      return { result: Boolean(value) };
    }
    
    // Replace context.property with actual values for complex expressions
    const evaluated = replaceContextReferences(normalized, context);
    
    // Evaluate the expression
    // Use a safe evaluation approach that doesn't allow arbitrary code execution
    const result = safeEvaluate(evaluated, context);
    
    return { result: Boolean(result) };
  } catch (error) {
    return {
      result: false,
      error: `Expression evaluation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Replaces context.property references with actual values
 * Supports nested properties like context.step1.result.success
 */
function replaceContextReferences(
  expression: string,
  context: Record<string, unknown>
): string {
  // Match patterns like context.property or context.step1.result
  const contextPattern = /context\.([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z_][a-zA-Z0-9_]*)*)/g;
  
  return expression.replace(contextPattern, (match, path) => {
    const value = getNestedValue(context, path);
    
    // Convert value to a string representation suitable for evaluation
    if (value === null || value === undefined) {
      return 'null';
    }
    if (typeof value === 'string') {
      return JSON.stringify(value);
    }
    if (typeof value === 'boolean') {
      return String(value);
    }
    if (typeof value === 'number') {
      return String(value);
    }
    if (Array.isArray(value)) {
      return JSON.stringify(value);
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  });
}

/**
 * Gets a nested value from an object using dot notation
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  
  return current;
}

/**
 * Safely evaluates a simple expression
 * Only supports basic comparisons and logical operations
 */
function safeEvaluate(
  expression: string,
  context: Record<string, unknown>
): boolean {
  // Remove whitespace for easier parsing
  const expr = expression.replace(/\s+/g, ' ').trim();
  
  // Handle logical operators (process && and || with proper precedence)
  if (expr.includes('||')) {
    const parts = expr.split('||').map(p => p.trim());
    return parts.some(part => safeEvaluate(part, context));
  }
  
  if (expr.includes('&&')) {
    const parts = expr.split('&&').map(p => p.trim());
    return parts.every(part => safeEvaluate(part, context));
  }
  
  // Handle negation
  if (expr.startsWith('!')) {
    return !safeEvaluate(expr.substring(1).trim(), context);
  }
  
  // Handle parentheses (simple recursive evaluation)
  if (expr.startsWith('(') && expr.endsWith(')')) {
    return safeEvaluate(expr.slice(1, -1).trim(), context);
  }
  
  // Handle comparisons
  const comparisonOperators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<'];
  for (const op of comparisonOperators) {
    if (expr.includes(op)) {
      const [left, right] = expr.split(op).map(s => s.trim());
      return evaluateComparison(left, op, right, context);
    }
  }
  
  // Handle property access and method calls
  if (expr.includes('.')) {
    const path = expr.replace(/^context\./, '');
    const value = getNestedValue(context, path);
    // Arrays and objects are truthy if they exist
    if (value !== null && value !== undefined) {
      return true;
    }
    return false;
  }
  
  // Handle direct boolean/string/number values
  if (expr === 'true') return true;
  if (expr === 'false') return false;
  if (expr === 'null' || expr === 'undefined') return false;
  
  // Try to parse as number
  const numValue = Number(expr);
  if (!isNaN(numValue) && expr.trim() !== '') {
    return Boolean(numValue);
  }
  
  // Try to get from context
  const contextValue = context[expr];
  if (contextValue !== null && contextValue !== undefined) {
    return true;
  }
  return false;
}

/**
 * Evaluates a comparison expression
 */
function evaluateComparison(
  left: string,
  operator: string,
  right: string,
  context: Record<string, unknown>
): boolean {
  // Get left value
  const leftValue: unknown = parseValue(left, context);
  
  // Get right value
  const rightValue: unknown = parseValue(right, context);
  
  // Perform comparison
  switch (operator) {
    case '===':
      return leftValue === rightValue;
    case '!==':
      return leftValue !== rightValue;
    case '==':
      // Loose equality
      return leftValue == rightValue;
    case '!=':
      return leftValue != rightValue;
    case '>':
      return Number(leftValue) > Number(rightValue);
    case '<':
      return Number(leftValue) < Number(rightValue);
    case '>=':
      return Number(leftValue) >= Number(rightValue);
    case '<=':
      return Number(leftValue) <= Number(rightValue);
    default:
      throw new Error(`Unsupported comparison operator: ${operator}`);
  }
}

/**
 * Parses a value from a string (handles JSON, numbers, booleans, context references)
 */
function parseValue(value: string, context: Record<string, unknown>): unknown {
  // Remove quotes if present
  const trimmed = value.trim();
  
  // Handle JSON strings
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  
  // Handle boolean literals
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (trimmed === 'undefined') return undefined;
  
  // Handle numbers
  const numValue = Number(trimmed);
  if (!isNaN(numValue) && trimmed !== '') {
    return numValue;
  }
  
  // Handle context references
  if (trimmed.startsWith('context.')) {
    return getNestedValue(context, trimmed.replace(/^context\./, ''));
  }
  
  // Handle direct context property access
  if (context[trimmed] !== undefined) {
    return context[trimmed];
  }
  
  // Handle array operations like .length
  if (trimmed.includes('.')) {
    const value = getNestedValue(context, trimmed);
    if (value !== undefined) {
      return value;
    }
  }
  
  // Return as string if nothing else matches
  return trimmed;
}

/**
 * Validates a condition expression syntax
 */
export function validateCondition(condition: ConditionExpression): { valid: boolean; error?: string } {
  try {
    if (typeof condition === 'boolean') {
      return { valid: true };
    }
    
    if (typeof condition === 'function') {
      return { valid: true };
    }
    
    if (typeof condition === 'string') {
      const trimmed = condition.trim();
      if (!trimmed) {
        return { valid: false, error: 'Condition expression cannot be empty' };
      }
      
      // Basic syntax validation
      const validOperators = ['===', '!==', '==', '!=', '>=', '<=', '>', '<', '&&', '||', '!'];
      const hasValidOperator = validOperators.some(op => trimmed.includes(op));
      const hasContextRef = trimmed.includes('context.');
      const isBooleanLiteral = trimmed === 'true' || trimmed === 'false';
      
      if (!hasValidOperator && !hasContextRef && !isBooleanLiteral) {
        return { valid: false, error: 'Condition must contain a valid operator or context reference' };
      }
      
      return { valid: true };
    }
    
    return { valid: false, error: `Unsupported condition type: ${typeof condition}` };
  } catch (error) {
    return {
      valid: false,
      error: `Validation error: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Creates a condition testing utility for unit tests
 */
export function createConditionTester(context: Record<string, unknown>) {
  return {
    test: (condition: ConditionExpression): ConditionEvaluationResult => {
      return evaluateCondition(condition, context);
    },
    
    testMultiple: (conditions: ConditionExpression[]): ConditionEvaluationResult[] => {
      return conditions.map(cond => evaluateCondition(cond, context));
    }
  };
}

