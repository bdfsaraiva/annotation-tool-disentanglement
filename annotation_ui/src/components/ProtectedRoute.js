/**
 * @fileoverview Route guard that enforces authentication and optional admin-only access.
 *
 * Wraps a React Router v6 route element.  While `AuthContext` is still
 * resolving the session (i.e., `isLoading` is `true`), a plain text fallback
 * is shown to avoid a premature redirect.  Once loading completes:
 *
 * - Unauthenticated users are sent to `/login`; the originating URL is
 *   preserved in `location.state.from` so it can be restored after login.
 * - Authenticated non-admin users visiting an `adminOnly` route are bounced
 *   to `/dashboard`.
 * - All other users see the protected child component.
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

/**
 * Guards a route element with authentication and optional role checks.
 *
 * @param {Object} props
 * @param {React.ReactNode} props.children - The route element to render when
 *   access is permitted.
 * @param {boolean} [props.adminOnly=false] - When `true`, non-admin users are
 *   redirected to `/dashboard` even if they are authenticated.
 */
const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { isAuthenticated, currentUser, isLoading } = useAuth();
    const location = useLocation();

    if (isLoading) {
        // You might want to show a loading spinner here
        return <div>Loading...</div>;
    }

    if (!isAuthenticated) {
        // Redirect them to the /login page, but save the current location they were
        // trying to go to. This allows us to send them along to that page after a
        // successful login.
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (adminOnly && !currentUser?.is_admin) {
        // If it's an admin-only route and the user is not an admin,
        // redirect them to their dashboard.
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

export default ProtectedRoute; 