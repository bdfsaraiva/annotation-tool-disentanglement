import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect } from 'vitest';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

const Wrapper = ({ children }) => (
  <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </MemoryRouter>
);

describe('App', () => {
  it('renders login form when unauthenticated', async () => {
    render(<App />, { wrapper: Wrapper });
    const heading = await screen.findByText(/login/i);
    expect(heading).toBeInTheDocument();
  });
});
