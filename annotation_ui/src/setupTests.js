/**
 * @fileoverview Vitest global test setup file.
 *
 * Run before each test file by Vitest via the `setupFiles` configuration.
 * Responsibilities:
 *
 * 1. Imports `@testing-library/jest-dom` to extend Vitest's `expect` with DOM
 *    matchers (e.g. `toBeInTheDocument`, `toHaveClass`).
 *
 * 2. Mocks the `axios` module globally so `axios.create()` returns a
 *    controllable stub.  This prevents real HTTP requests in unit tests and
 *    avoids the need for each test file to repeat the mock setup.
 *
 * 3. Suppresses known noise from `console.error` and `console.warn` that
 *    originate from React/React Router deprecation warnings irrelevant to
 *    business logic tests:
 *    - `ReactDOMTestUtils.act` — triggers React's act() wrapping warning in
 *      older testing patterns.
 *    - `React Router Future Flag Warning` — informational upgrade hints.
 */
import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock axios globally so axios.create() returns a usable object
vi.mock('axios', () => {
  const mockInstance = {
    interceptors: {
      request: { use: vi.fn() },
      response: { use: vi.fn() },
    },
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  };
  return {
    default: {
      create: vi.fn(() => mockInstance),
      post: vi.fn(),
    },
  };
});

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
