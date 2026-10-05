// ConfirmButton: a button that asks "Are you sure?" before doing something destructive
// (delete, reject, archive...). The action runs only after the user confirms.
//
// Props:
//   onConfirm     function  async function that does the action (required).
//                           If it throws, the error message is shown as a toast.
//   children      node      button content (default "Delete")
//   title         string    dialog heading (default "Please confirm")
//   message       string|node  dialog text (default "Are you sure? This cannot be undone.")
//   confirmLabel  string    text of the confirm button (default "Delete")
//   cancelLabel   string    text of the cancel button (default "Cancel")
//   danger        boolean   true (default) = red confirm button; false = primary (teal)
//   className     string    classes of the trigger button (default "btn btn-danger")
//   disabled      boolean   disables the trigger button
//   ariaLabel     string    accessible name, needed when the button shows only an icon
//
// Example:
//   <ConfirmButton onConfirm={() => deleteTask(task.id)} message="Delete this task?">
//     <Icon name="trash" size={16} /> Delete
//   </ConfirmButton>
import { useState } from 'react';
import Modal from './Modal.jsx';
import { useToast } from '../../context/ToastContext.jsx';

export default function ConfirmButton({
  onConfirm,
  children = 'Delete',
  title = 'Please confirm',
  message = 'Are you sure? This cannot be undone.',
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  className = 'btn btn-danger',
  disabled = false,
  ariaLabel,
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  function handleClose() {
    if (!busy) setOpen(false); // do not close while the action is running
  }

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label={ariaLabel}
      >
        {children}
      </button>

      <Modal
        open={open}
        onClose={handleClose}
        title={title}
        size="small"
        footer={
          <>
            <button type="button" className="btn btn-secondary" onClick={handleClose} disabled={busy}>
              {cancelLabel}
            </button>
            <button
              type="button"
              className={danger ? 'btn btn-danger' : 'btn btn-primary'}
              onClick={handleConfirm}
              disabled={busy}
            >
              {busy ? 'Please wait...' : confirmLabel}
            </button>
          </>
        }
      >
        {typeof message === 'string' ? <p className="confirm-message">{message}</p> : message}
      </Modal>
    </>
  );
}
