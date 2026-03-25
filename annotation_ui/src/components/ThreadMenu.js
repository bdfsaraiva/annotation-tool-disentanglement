/**
 * @fileoverview Small thread-detail widget showing turn and annotator counts.
 *
 * Renders one of three states depending on the props received: a loading
 * spinner, an inline error message, or the thread summary header.  The
 * component is intentionally minimal — it displays metadata only and does not
 * expose interactive controls.
 */
import React from 'react';
import './ThreadMenu.css';

/**
 * Thread metadata display widget for use in thread-selection dropdowns or
 * sidebar panels.
 *
 * @param {Object} props
 * @param {Object} props.thread - Thread data to display (required when not
 *   loading and no error).
 * @param {string|number} props.thread.id - Thread label shown in the header.
 * @param {number} props.thread.message_count - Number of turns in the thread.
 * @param {number} props.thread.annotator_count - Number of annotators who have
 *   labelled at least one turn in this thread.
 * @param {boolean} [props.isLoading=false] - When `true`, renders a spinner
 *   instead of thread content.
 * @param {string|null} [props.error=null] - When non-null, renders an error
 *   message instead of thread content.
 */
const ThreadMenu = ({
    thread,
    isLoading = false,
    error = null
}) => {
    if (isLoading) {
        return (
            <div className="thread-menu loading">
                <div className="loading-spinner"></div>
                <span>Loading thread...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="thread-menu error">
                <span className="error-message">{error}</span>
            </div>
        );
    }

    return (
        <div className="thread-menu">
            <div className="thread-header">
                <div className="thread-name">{thread.id}</div>
                <div className="thread-stats">
                    <span className="stat-item">
                        <span className="stat-label">Turns:</span>
                        <span className="stat-value">{thread.message_count}</span>
                    </span>
                    <span className="stat-item">
                        <span className="stat-label">Annotators:</span>
                        <span className="stat-value">{thread.annotator_count}</span>
                    </span>
                </div>
            </div>
        </div>
    );
};

export default ThreadMenu;