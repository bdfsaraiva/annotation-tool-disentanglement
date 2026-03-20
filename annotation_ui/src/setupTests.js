// Vitest-compatible setup (also works with Jest)
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock axios globally
vi.mock('axios');

const originalError = console.error;
console.error = (...args) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('ReactDOMTestUtils.act')) return;
  originalError(...args);
};

const originalWarn = console.warn;
console.warn = (...args) => {
  const message = args[0];
  if (typeof message === 'string' && message.includes('React Router Future Flag Warning')) return;
  originalWarn(...args);
};
