/**
 * @fileoverview Toast notification context and provider.
 *
 * Manages a queue of toast notifications that auto-dismiss after a configurable
 * duration.  Each toast is assigned a monotonically increasing numeric ID so
 * that multiple toasts with the same message can coexist without key conflicts.
 *
 * Usage:
 * ```jsx
 * const { addToast } = useToast();
 * addToast('Saved successfully!', 'success');
 * ```
 */
import React, { createContext, useContext, useState, useCallback } from 'react';
import './Toast.css';

const ToastContext = createContext(null);

/** Module-level counter that ensures unique toast IDs across the app lifetime. */
let toastIdCounter = 0;

/**
 * Renders the list of active toast notifications.
 *
 * Hidden (returns `null`) when the toast queue is empty so no DOM node is
 * present when there is nothing to show.
 *
 * @param {Object[]} toasts - Active toast objects `{id, message, type}`.
 * @param {Function} onRemove - Called with the toast's `id` to dismiss it.
 */
const ToastContainer = ({ toasts, onRemove }) => {
  if (toasts.length === 0) return null;
  return (
    <div className="toast-container" role="region" aria-label="Notifications">
      {toasts.map(toast => (
        <div key={toast.id} className={`toast toast-${toast.type}`} role="alert">
          <span className="toast-message">{toast.message}</span>
          <button
            className="toast-close"
            onClick={() => onRemove(toast.id)}
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

/**
 * Provides toast state and actions to the component tree.
 * Renders `ToastContainer` as a sibling of `children` so toasts overlay the page.
 *
 * @param {React.ReactNode} children
 */
export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  /**
   * Remove a toast by ID.
   * @param {number} id
   */
  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /**
   * Display a new toast notification.
   *
   * @param {string} message - Text to display in the toast.
   * @param {'info'|'success'|'warning'|'error'} [type='info'] - Visual style.
   * @param {number} [duration=4000] - Auto-dismiss delay in ms.  Pass `0` to
   *   disable auto-dismiss (the user must click × to close).
   * @returns {number} The ID of the new toast (can be passed to `removeToast`).
   */
  const addToast = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, duration);
    }
    return id;
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
};

/**
 * Returns the toast context `{ addToast, removeToast }`.
 *
 * Must be called inside a `ToastProvider` subtree.
 *
 * @returns {{ addToast: Function, removeToast: Function }}
 * @throws {Error} If called outside a `ToastProvider`.
 */
export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
