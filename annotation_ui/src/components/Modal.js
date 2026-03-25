/**
 * @fileoverview Generic modal dialog component.
 *
 * Features:
 * - Dismiss on Escape key press.
 * - Optional dismiss on overlay click (controlled by `closeOnOverlayClick`).
 * - Locks `document.body` overflow while open to prevent background scrolling.
 * - Renders nothing when `isOpen` is `false` (no DOM overhead when hidden).
 */
import React, { useEffect } from 'react';
import './Modal.css';

/**
 * A reusable modal dialog.
 *
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is visible.
 * @param {Function} props.onClose - Called when the user dismisses the modal
 *   (via Escape key, the × button, or an overlay click).
 * @param {string} props.title - Text displayed in the modal header.
 * @param {React.ReactNode} props.children - Content to render inside the modal body.
 * @param {'small'|'medium'|'large'} [props.size='medium'] - Controls max-width via CSS class.
 * @param {boolean} [props.showCloseButton=true] - Whether to render the × close button.
 * @param {boolean} [props.closeOnOverlayClick=true] - Whether clicking the dark overlay closes the modal.
 */
const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    size = "medium",
    showCloseButton = true,
    closeOnOverlayClick = true
}) => {
    useEffect(() => {
        const handleEscape = (e) => {
            if (e.key === 'Escape' && isOpen) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('keydown', handleEscape);
            // Prevent background content from scrolling while the modal is open.
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('keydown', handleEscape);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    /**
     * Close the modal when the user clicks directly on the overlay backdrop,
     * but not when they click on the modal panel itself (event bubbling check).
     * @param {React.SyntheticEvent} e
     */
    const handleOverlayClick = (e) => {
        if (closeOnOverlayClick && e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="modal-overlay" onClick={handleOverlayClick}>
            <div className={`modal-content ${size}`}>
                <div className="modal-header">
                    <h2 className="modal-title">{title}</h2>
                    {showCloseButton && (
                        <button
                            className="modal-close-button"
                            onClick={onClose}
                            aria-label="Close modal"
                        >
                            ✕
                        </button>
                    )}
                </div>
                <div className="modal-body">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal; 