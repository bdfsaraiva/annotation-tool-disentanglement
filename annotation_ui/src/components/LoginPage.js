/**
 * @fileoverview Public login page for the LACE annotation tool.
 *
 * Renders the LACE branding, a username/password form, and inline error
 * feedback.  On successful authentication the component calls `auth.login`
 * to obtain tokens (stored by the axios interceptor) then fetches the full
 * user profile via `auth.getCurrentUser` and passes it to the
 * `AuthContext.login` helper, which updates global auth state and navigates
 * the user to their role-appropriate dashboard.
 */
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { auth } from '../utils/api';
import './LoginPage.css';

/**
 * Full-page login form component.
 *
 * Manages local form state for username, password, and any API error message.
 * Authentication is a two-step async process: obtain tokens, then fetch the
 * user profile to populate `AuthContext`.
 */
const LoginPage = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const { login } = useAuth();

    /**
     * Submit handler: authenticates the user and updates global auth state.
     *
     * Clears any previous error, calls the login API, then — on success —
     * fetches the current user profile and hands it to `AuthContext.login`.
     * Displays a user-friendly message from the API response detail if the
     * request fails (e.g., wrong credentials, rate-limit exceeded).
     *
     * @param {React.FormEvent<HTMLFormElement>} e - The form submit event.
     */
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        try {
            const data = await auth.login(username, password);
            if (data.access_token) {
                const userData = await auth.getCurrentUser();
                login(userData);
            }
        } catch (err) {
            const message = err.response?.data?.detail || 'Failed to log in. Please check your credentials.';
            setError(message);
        }
    };

    return (
        <div className="login-container">
            <div className="login-brand">
                <h1>LACE</h1>
                <p>Labelling Adjacency and Conversation Entanglement</p>
            </div>
            <form onSubmit={handleSubmit} className="login-form">
                <h2>Login</h2>
                {error && <p className="error-message">{error}</p>}
                <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input
                        type="text"
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        minLength={3}
                        required
                    />
                </div>
                <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                        type="password"
                        id="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit" className="login-button">Log In</button>
            </form>
        </div>
    );
};

export default LoginPage; 
