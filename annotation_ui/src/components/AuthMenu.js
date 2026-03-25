/**
 * @fileoverview Top-bar authentication widget with a light/dark theme toggle.
 *
 * When the user is logged in, shows their username and a logout button.
 * When unauthenticated, shows a "Please log in" hint.  The theme toggle button
 * swaps between an inline SVG sun icon (switch to light) and a moon icon
 * (switch to dark), keeping the icon assets co-located with this component.
 */
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import './AuthMenu.css';

/**
 * Top-navigation bar widget that displays the authenticated user's name, a
 * logout button, and a light/dark theme toggle.
 *
 * @param {Object} props
 * @param {'light'|'dark'} props.theme - Current UI theme; drives which icon is
 *   rendered on the toggle button.
 * @param {Function} props.toggleTheme - Callback invoked when the toggle button
 *   is clicked; responsible for switching the theme in the parent.
 */
const AuthMenu = ({ theme, toggleTheme }) => {
    const { isAuthenticated, currentUser, logout } = useAuth();

    /** Inline SVG sun icon — shown when the current theme is dark (click to go light). */
    const SunIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="5"></circle>
            <line x1="12" y1="1" x2="12" y2="3"></line>
            <line x1="12" y1="21" x2="12" y2="23"></line>
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
            <line x1="1" y1="12" x2="3" y2="12"></line>
            <line x1="21" y1="12" x2="23" y2="12"></line>
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        </svg>
    );

    /** Inline SVG moon icon — shown when the current theme is light (click to go dark). */
    const MoonIcon = () => (
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        </svg>
    );

    return (
        <div className="auth-menu">
            {isAuthenticated && currentUser ? (
                <>
                    <span className="user-email">{currentUser.username}</span>
                    <button onClick={logout} className="auth-button">Logout</button>
                </>
            ) : (
                <span className="logged-out-message">Please log in</span>
            )}
            <button onClick={toggleTheme} className="theme-toggle-button" title="Toggle theme">
                {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
        </div>
    );
};

export default AuthMenu;
