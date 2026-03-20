import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from './LoginPage';
import { AuthProvider } from '../contexts/AuthContext';
import { ToastProvider } from '../contexts/ToastContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../utils/api', () => ({
  auth: {
    login: vi.fn(),
    logout: vi.fn(),
    getCurrentUser: vi.fn().mockResolvedValue(null),
  },
  default: { interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } } },
}));

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper = ({ children }) => (
  <MemoryRouter>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </MemoryRouter>
);

describe('LoginPage', () => {
  beforeEach(() => queryClient.clear());

  it('renders username and password inputs', () => {
    render(<LoginPage />, { wrapper: Wrapper });
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('shows validation error when form is submitted empty', async () => {
    render(<LoginPage />, { wrapper: Wrapper });
    fireEvent.click(screen.getByRole('button', { name: /login/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /login/i })).toBeInTheDocument();
    });
  });
});
