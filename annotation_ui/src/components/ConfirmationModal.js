/**
 * @fileoverview Confirmation dialog built on top of the generic `Modal` component.
 *
 * Renders a small modal with an optional icon, a message, a cancel button, and
 * a confirm button.  While `isLoading` is `true`, both buttons are disabled and
 * the confirm button label changes to "Processing..." to signal that an async
 * operation is in progress.
 */
import React from 'react';
import Modal from './Modal';
import './ConfirmationModal.css';

/**
 * A specialised modal for confirm/cancel interactions.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible.
 * @param {Function} props.onClose - Called when the user cancels or dismisses.
 * @param {Function} props.onConfirm - Called when the user clicks the confirm button.
 * @param {string} [props.title='Confirm Action'] - Modal header text.
 * @param {string} props.message - Descriptive message shown above the action buttons.
 * @param {string} [props.confirmText='Confirm'] - Label for the confirm button.
 * @param {string} [props.cancelText='Cancel'] - Label for the cancel button.
 * @param {'warning'|'danger'|'info'} [props.type='warning'] - Determines icon and button colour.
 * @param {boolean} [props.isLoading=false] - When `true`, disables buttons and shows
 *   a "Processing..." label on the confirm button.
 */
const ConfirmationModal = ({
    isOpen,
    onClose,
    onConfirm,
    title = "Confirm Action",
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    type = "warning",
    isLoading = false
}) => {
    /**
     * Invoke `onConfirm` and close the modal when the operation is not already
     * in progress (the parent component controls `isLoading`).
     */
    const handleConfirm = () => {
        onConfirm();
        if (!isLoading) {
            onClose();
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={title}
            size="small"
            // Prevent accidental dismissal while an async operation is running.
            closeOnOverlayClick={!isLoading}
        >
            <div className={`confirmation-modal ${type}`}>
                <div className="confirmation-icon">
                    {type === 'danger' && '⚠️'}
                    {type === 'warning' && '⚠️'}
                    {type === 'info' && 'ℹ️'}
                </div>
                <div className="confirmation-message">
                    <p>{message}</p>
                </div>
                <div className="confirmation-actions">
                    <button
                        className="cancel-button"
                        onClick={onClose}
                        disabled={isLoading}
                    >
                        {cancelText}
                    </button>
                    <button
                        className={`confirm-button ${type}`}
                        onClick={handleConfirm}
                        disabled={isLoading}
                    >
                        {isLoading ? 'Processing...' : confirmText}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default ConfirmationModal; 