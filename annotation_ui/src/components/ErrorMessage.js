/**
 * @fileoverview Reusable error / warning / info display widget.
 */
import React from 'react';
import './ErrorMessage.css';

/**
 * Displays a styled message box with an icon, a title, body text, and an
 * optional retry button.
 *
 * @param {Object} props
 * @param {string} props.message - The descriptive error or status text.
 * @param {string} [props.title='Error'] - Heading displayed above the message.
 * @param {'error'|'warning'|'info'} [props.type='error'] - Controls the colour
 *   scheme and icon via CSS class.
 * @param {Function|null} [props.onRetry=null] - If provided, a retry button is
 *   rendered; clicking it calls this function.
 * @param {string} [props.retryText='Try Again'] - Label for the retry button.
 */
const ErrorMessage = ({
    message,
    title = "Error",
    type = "error",
    onRetry = null,
    retryText = "Try Again"
}) => {
    return (
        <div className={`error-message-container ${type}`}>
            <div className="error-icon">
                {type === 'error' && '⚠️'}
                {type === 'warning' && '⚠️'}
                {type === 'info' && 'ℹ️'}
            </div>
            <div className="error-content">
                <h3 className="error-title">{title}</h3>
                <p className="error-text">{message}</p>
                {onRetry && (
                    <button
                        className="error-retry-button"
                        onClick={onRetry}
                    >
                        {retryText}
                    </button>
                )}
            </div>
        </div>
    );
};

export default ErrorMessage; 