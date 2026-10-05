// Modal: a pop-up dialog shown on top of the page (for forms and confirmations).
// It closes with the Escape key, the X button, or a click on the dark background.
//
// Props:
//   open             boolean   show or hide the modal (required)
//   onClose          function  called when the user closes it (required)
//   title            string    heading of the dialog
//   children         node      the content (usually a <form>)
//   footer           node      optional buttons at the bottom (e.g. Cancel / Save)
//   size             string    "small" (420px), "medium" (560px, default), "large" (820px)
//   closeOnBackdrop  boolean   false = clicking outside does NOT close it (default true).
//                              Use false for dialogs with a form, so typed text is not lost.
//
// Focus: the dialog first focuses the element marked with data-autofocus, else the first field
// of the content, else the first footer button. Add data-autofocus to a safe button (e.g. Close)
// when the first button would be a destructive one such as Delete.
//
// Modals can open on top of each other (e.g. the "Are you sure?" dialog inside the event details).
// Only the top one reacts to Escape and Tab, and the page scrolls again when the LAST one closes.
//
// Example:
//   <Modal open={showForm} onClose={() => setShowForm(false)} title="Add Task">
//     <form className="form" onSubmit={handleSubmit}> ...
//       <div className="form-actions">
//         <button type="button" className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancel</button>
//         <button type="submit" className="btn btn-primary">Save</button>
//       </div>
//     </form>
//   </Modal>
import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon.jsx';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// The ids of the modals that are open right now, newest last (shared by every Modal)
let openModals = [];

export default function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'medium',
  closeOnBackdrop = true,
}) {
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  // Always call the newest onClose without re-running the effect below
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;

    // Remember what had focus, so we can give it back when the modal closes
    const previouslyFocused = document.activeElement;
    const dialog = dialogRef.current;

    // Move focus into the dialog: the element marked data-autofocus, else the first field of the
    // content, else the first footer button (e.g. "Cancel"), else the dialog itself.
    // The X button is skipped on purpose.
    const first =
      dialog?.querySelector('[data-autofocus]') ||
      dialog?.querySelector('.modal-body')?.querySelector(FOCUSABLE) ||
      dialog?.querySelector('.modal-footer')?.querySelector(FOCUSABLE);
    (first || dialog)?.focus();

    // Stop the page behind from scrolling (it scrolls again when the last modal closes)
    openModals.push(titleId);
    document.body.style.overflow = 'hidden';

    function handleKeyDown(event) {
      // Only the modal on top reacts to the keyboard
      if (openModals[openModals.length - 1] !== titleId) return;
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      // Keep the Tab key cycling inside the dialog
      if (event.key === 'Tab' && dialog) {
        const items = Array.from(dialog.querySelectorAll(FOCUSABLE));
        if (items.length === 0) return;
        const firstItem = items[0];
        const lastItem = items[items.length - 1];
        if (event.shiftKey && document.activeElement === firstItem) {
          event.preventDefault();
          lastItem.focus();
        } else if (!event.shiftKey && document.activeElement === lastItem) {
          event.preventDefault();
          firstItem.focus();
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      openModals = openModals.filter((id) => id !== titleId);
      if (openModals.length === 0) document.body.style.overflow = '';
      // Give focus back, unless that element disappeared together with this modal
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) previouslyFocused.focus();
    };
  }, [open, titleId]);

  if (!open) return null;

  // Close only when the click started AND ended on the dark background itself
  function handleBackdropMouseDown(event) {
    if (closeOnBackdrop && event.target === event.currentTarget) onClose?.();
  }

  // createPortal draws the modal at the end of <body>, above everything else
  return createPortal(
    <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        className={`modal modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
      >
        <div className="modal-header">
          {title && <h2 id={titleId}>{title}</h2>}
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close">
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body
  );
}
