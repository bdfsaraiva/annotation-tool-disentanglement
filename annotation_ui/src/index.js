/**
 * @fileoverview Application entry point and provider tree.
 *
 * Bootstraps the React app with the following provider stack (inner to outer):
 *
 * 1. `React.StrictMode` — enables extra development warnings.
 * 2. `BrowserRouter` — enables React Router v6 HTML5 history-based routing.
 * 3. `QueryClientProvider` — provides TanStack Query (react-query) with a
 *    `QueryClient` configured for one automatic retry and a 30-second stale
 *    time for server-state caching.
 * 4. `ToastProvider` — global toast notification context.
 * 5. `AuthProvider` — JWT authentication state and session management.
 * 6. `App` — root component with route definitions and layout.
 *
 * The `root.render` call is wrapped in a try/catch so that any top-level
 * React rendering error falls back to a plain HTML error message rather than
 * a blank white screen.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter as Router } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { ToastProvider } from './contexts/ToastContext';

/**
 * TanStack Query client.  Configured with a single retry attempt on failure
 * and a 30-second stale window to reduce redundant refetches during a session.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

const root = ReactDOM.createRoot(document.getElementById('root'));

try {
  root.render(
    <React.StrictMode>
      <Router>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </ToastProvider>
        </QueryClientProvider>
      </Router>
    </React.StrictMode>
  );
} catch (error) {
  console.error('Error rendering the app:', error);
  document.body.innerHTML = '<h1>An error occurred while loading the application. Please check the console for more details.</h1>';
}
