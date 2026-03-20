import { vi } from 'vitest';

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
