/**
 * @fileoverview Simple full-area loading indicator with an optional status message.
 *
 * Renders a CSS-animated spinner paired with a short text label.  The `size`
 * prop drives a CSS modifier class so the container dimensions can be varied
 * without duplicating markup.
 */
import React from 'react';
import './LoadingSpinner.css';

/**
 * Displays a spinner animation and an optional descriptive message while
 * async work is in progress.
 *
 * @param {Object} props
 * @param {string} [props.message='Loading...'] - Status text shown beneath the spinner.
 * @param {'small'|'medium'|'large'} [props.size='medium'] - Controls container
 *   dimensions via the corresponding CSS modifier class.
 */
const LoadingSpinner = ({ message = "Loading...", size = "medium" }) => {
    return (
        <div className={`loading-spinner-container ${size}`}>
            <div className="loading-spinner"></div>
            <p className="loading-message">{message}</p>
        </div>
    );
};

export default LoadingSpinner; 