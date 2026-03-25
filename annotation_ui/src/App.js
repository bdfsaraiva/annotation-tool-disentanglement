/**
 * @fileoverview Root application component with global layout and route definitions.
 *
 * Manages the light/dark theme toggle at the top level, applying the selected
 * theme to `document.documentElement` via a `data-theme` attribute so that
 * CSS custom properties defined per-theme cascade down to all children.
 *
 * Route structure:
 * - `/login`                               — Public login page.
 * - `/`                                    — Redirects to `/admin` or `/dashboard`
 *                                           based on role; unauthenticated users
 *                                           are sent to `/login`.
 * - `/dashboard`                           — Annotator dashboard (authenticated).
 * - `/projects/:projectId`                 — Annotator project page.
 * - `/projects/:projectId/chat-rooms/:roomId` — Annotator annotation interface.
 * - `/projects/:projectId/my-annotations` — Personal annotation review.
 * - `/admin`                               — Admin dashboard (admin only).
 * - `/admin/projects/:projectId`          — Admin project management.
 * - `/admin/projects/:projectId/chat-rooms/:roomId` — Admin room overview.
 * - `/admin/projects/:projectId/analysis/:roomId`   — IAA analysis view.
 * - `*`                                   — Catch-all redirect to `/`.
 *
 * All non-public routes are wrapped in `ProtectedRoute`.  Admin-only routes
 * pass `adminOnly` to bounce authenticated non-admins to `/dashboard`.
 */
import React, { useState, useEffect } from 'react';
import { Route, Routes, Navigate } from 'react-router-dom';
import './App.css';
import AuthMenu from './components/AuthMenu';
import AdminDashboard from './components/AdminDashboard';
import AnnotatorDashboard from './components/AnnotatorDashboard';
import AnnotatorProjectPage from './components/AnnotatorProjectPage';
import ProtectedRoute from './components/ProtectedRoute';
import AnnotatorChatRoomPage from './components/AnnotatorChatRoomPage';
import AnnotationAnalysisPage from './components/AnnotationAnalysisPage';
import MyAnnotationsPage from './components/MyAnnotationsPage';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './components/LoginPage';
import AdminProjectPage from './components/AdminProjectPage';
import AdminChatRoomView from './components/AdminChatRoomView';

/**
 * Root component.  Owns the theme state and renders the top-level layout
 * (fixed header + main content area) with the full React Router route tree.
 */
function App() {
    const [theme, setTheme] = useState('dark');
    const { isAuthenticated, currentUser } = useAuth();

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    /**
     * Toggle between `'dark'` and `'light'` themes.  The new value is applied
     * to `document.documentElement` by the `useEffect` above.
     */
    const toggleTheme = () => {
        setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <h1>LACE</h1>
                <AuthMenu theme={theme} toggleTheme={toggleTheme} />
            </header>
            <main className="app-main">
                <Routes>
                    {/* Public and Auth Routes */}
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/" element={
                        !isAuthenticated ? <Navigate to="/login" /> : 
                        (currentUser?.is_admin ? <Navigate to="/admin" /> : <Navigate to="/dashboard" />)
                    } />

                    {/* Annotator Routes */}
                    <Route 
                        path="/dashboard" 
                        element={
                            <ProtectedRoute>
                                <AnnotatorDashboard />
                            </ProtectedRoute>
                        } 
                    />
                    <Route 
                        path="/projects/:projectId" 
                        element={
                            <ProtectedRoute>
                                <AnnotatorProjectPage />
                            </ProtectedRoute>
                        } 
                    />
                    <Route 
                        path="/projects/:projectId/chat-rooms/:roomId" 
                        element={
                            <ProtectedRoute>
                                <AnnotatorChatRoomPage />
                            </ProtectedRoute>
                        } 
                    />
                    <Route 
                        path="/projects/:projectId/my-annotations" 
                        element={
                            <ProtectedRoute>
                                <MyAnnotationsPage />
                            </ProtectedRoute>
                        } 
                    />

                    {/* Admin Routes */}
                    <Route 
                        path="/admin" 
                        element={
                            <ProtectedRoute adminOnly>
                                <AdminDashboard />
                            </ProtectedRoute>
                        } 
                    />
                    <Route 
                        path="/admin/projects/:projectId" 
                        element={
                            <ProtectedRoute adminOnly>
                                <AdminProjectPage />
                            </ProtectedRoute>
                        } 
                    />
                     <Route 
                        path="/admin/projects/:projectId/chat-rooms/:roomId" 
                        element={
                            <ProtectedRoute adminOnly>
                                <AdminChatRoomView />
                            </ProtectedRoute>
                        } 
                    />
                    {/* PHASE 5: IAA Analysis Route */}
                    <Route 
                        path="/admin/projects/:projectId/analysis/:roomId" 
                        element={
                            <ProtectedRoute adminOnly>
                                <AnnotationAnalysisPage />
                            </ProtectedRoute>
                        } 
                    />

                    {/* Fallback for any other route */}
                    <Route path="*" element={<Navigate to="/" />} />
                </Routes>
            </main>
        </div>
    );
}

export default App;