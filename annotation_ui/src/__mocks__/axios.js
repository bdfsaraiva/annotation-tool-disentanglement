/**
 * @fileoverview Vitest manual mock for the `axios` module.
 *
 * Located at `src/__mocks__/axios.js`, this file is automatically picked up
 * by Vitest (and Jest) when a test calls `vi.mock('axios')` or when the module
 * is mapped via the `moduleNameMapper` config.
 *
 * Provides a minimal axios-like API surface:
 * - `axios.create()` returns a mock `axiosInstance` with stubbed interceptors
 *   and HTTP methods, each resolving to `{ data: {} }` by default.
 * - Direct method exports (`create`, `get`, `post`, `put`) allow imports of
 *   named exports in addition to the default export.
 *
 * Tests can override individual method behaviours via `vi.mocked(...)` or
 * by calling `.mockResolvedValueOnce` on the relevant `vi.fn()` stubs.
 */
import { vi } from 'vitest';

/** Reusable mock axios instance returned by `axios.create()`. */
const axiosInstance = {
  interceptors: {
    request: { use: vi.fn(), eject: vi.fn() },
    response: { use: vi.fn(), eject: vi.fn() },
  },
  get: vi.fn(() => Promise.resolve({ data: {} })),
  post: vi.fn(() => Promise.resolve({ data: {} })),
  put: vi.fn(() => Promise.resolve({ data: {} })),
  delete: vi.fn(() => Promise.resolve({ data: {} })),
  defaults: { headers: { common: {} } },
};

const axios = {
  create: vi.fn(() => axiosInstance),
  get: axiosInstance.get,
  post: axiosInstance.post,
  put: axiosInstance.put,
  delete: axiosInstance.delete,
  defaults: axiosInstance.defaults,
};

export default axios;
export const { create, get, post, put } = axios;
