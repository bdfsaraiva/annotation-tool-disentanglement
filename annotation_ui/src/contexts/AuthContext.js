/**
 * @fileoverview Authentication context and provider for the LACE application.
 *
 * Provides a React context that stores the current user's authentication state
 * and exposes `login` / `logout` helpers to any descendant component via the
 * `useAuth` hook.
 *
 * On mount, the provider checks `localStorage` for a stored access token and
 * validates it against the `/auth/me` endpoint.  If the token is invalid or
 * absent, the loading phase completes with `isAuthenticated: false` so the
 * app can redirect the user to the login page.
 *
 * Children are rendered only after the initial auth check completes (guarded
 * by `!isLoading`) to prevent a flash of unauthenticated content.
 */
import React, { createContext, useState, useContext, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth } from '../utils/api';

const AuthContext = createContext(null);

/**
 * Provides authentication state to the component tree.
 *
 * @param {React.ReactNode} children - The subtree to wrap with auth context.
 */
export const AuthProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    /** True while the initial token validation is in progress. */
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    /**
     * On mount: validate any stored access token by calling `/auth/me`.
     * If the token is missing or rejected, clear both tokens from storage.
     */
    useEffect(() => {
        const token = localStorage.getItem('access_token');
        if (token) {
            auth.getCurrentUser()
                .then(user => {
                    setCurrentUser(user);
                    setIsAuthenticated(true);
                })
                .catch(() => {
                    // Token is invalid or expired — clear it so subsequent
                    // navigation to protected routes lands at the login page.
                    localStorage.removeItem('access_token');
                    localStorage.removeItem('refresh_token');
                })
                .finally(() => {
                    setIsLoading(false);
                });
        } else {
            setIsLoading(false);
        }
    }, []);

    /**
     * Mark the user as logged in and navigate to the appropriate dashboard.
     * Admins are redirected to `/admin`; annotators to `/dashboard`.
     *
     * @param {Object} user - The user object returned from `/auth/me`.
     */
    const login = (user) => {
        setCurrentUser(user);
        setIsAuthenticated(true);
        navigate(user.is_admin ? '/admin' : '/dashboard');
    };

    /**
     * Clear tokens, reset auth state, and redirect to the home page.
     */
    const logout = () => {
        auth.logout();
        setCurrentUser(null);
        setIsAuthenticated(false);
        navigate('/');
    };

    const value = {
        currentUser,
        isAuthenticated,
        isLoading,
        login,
        logout,
    };

    return (
        <AuthContext.Provider value={value}>
            {/* Delay rendering children until the token validation resolves to
                prevent a brief flash of unauthenticated UI. */}
            {!isLoading && children}
        </AuthContext.Provider>
    );
};

/**
 * Returns the current authentication context.
 *
 * Must be called inside a component that is a descendant of `AuthProvider`.
 *
 * @returns {{ currentUser: Object|null, isAuthenticated: boolean, isLoading: boolean, login: Function, logout: Function }}
 */
export const useAuth = () => {
    return useContext(AuthContext);
};