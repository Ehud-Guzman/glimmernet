import { useEffect, useRef } from 'react';

/**
 * Reusable confirmation dialog — replaces all browser alert/confirm/prompt calls.
 *
 * Props:
 *   title        - Modal heading
 *   message      - Body text (string or JSX)
 *   confirmLabel - Text on the confirm button (default: "Confirm")
 *   cancelLabel  - Text on the cancel button (default: "Cancel")
 *   danger       - If true, styles confirm button red
 *   loading      - Disables confirm button and shows a spinner label
 *   loadingLabel - Label when loading (default: "Processing…")
 *   onConfirm    - Called when the confirm button is clicked
 *   onCancel     - Called when cancel or overlay is clicked
 *   children     - Optional extra content rendered between message and buttons
 */
export default function ConfirmModal({
  title = 'Confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  loadingLabel = 'Processing…',
  onConfirm,
  onCancel,
  children,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <h3 style={{ color: danger ? 'var(--red)' : 'var(--text)' }}>{title}</h3>
        {message && (
          <p style={{ fontSize: '0.875rem', color: 'var(--text-2)', lineHeight: 1.6, margin: '0.5rem 0 1.25rem' }}>
            {message}
          </p>
        )}
        {children}
        <div className="modal-actions">
          <button ref={cancelRef} className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <button
            className="btn btn-primary"
            style={danger ? { background: 'var(--red)', borderColor: 'var(--red)' } : {}}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? loadingLabel : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
