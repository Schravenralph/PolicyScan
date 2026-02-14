import '@testing-library/jest-dom';

declare module '@jest/expect' {
  interface Matchers<R = void, _T = unknown> {
    toBeInTheDocument(): R;
    toHaveAttribute(attr: string, value?: string): R;
    toHaveValue(value: string | number | string[]): R;
    toBeDisabled(): R;
    toBeEnabled(): R;
    toHaveTextContent(text: string | RegExp): R;
    toHaveClass(...classNames: string[]): R;
  }
}

