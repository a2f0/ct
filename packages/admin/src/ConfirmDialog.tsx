import { type ReactNode, useEffect, useId, useRef, useState } from "react";

/**
 * A modal confirmation for destructive actions. It stays open while the action
 * runs and shows its error in place; the caller unmounts it on success.
 */
export function ConfirmDialog({
  eyebrow,
  title,
  children,
  confirmLabel,
  pendingLabel,
  onConfirm,
  onCancel,
}: {
  eyebrow: string;
  title: ReactNode;
  children: ReactNode;
  confirmLabel: string;
  pendingLabel: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const messageId = useId();
  useEffect(() => {
    const element = dialog.current;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (element && !element.open) element.showModal();
    // The safer choice takes focus, so Enter never destroys data by accident.
    cancel.current?.focus();
    return () => {
      element?.close();
      opener?.focus();
    };
  }, []);

  async function confirm() {
    setBusy(true);
    setError("");
    try {
      await onConfirm();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Something went wrong.",
      );
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="confirm-dialog"
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={messageId}
      aria-busy={busy}
      onCancel={(event) => {
        // Escape cancels, except while the action is already running.
        event.preventDefault();
        if (!busy) onCancel();
      }}
      // Chrome closes anyway on a repeated Escape without user activation.
      onClose={onCancel}
    >
      <div className="confirm-dialog-icon" aria-hidden="true">
        ⊘
      </div>
      <p className="eyebrow danger">{eyebrow}</p>
      <h2 id={titleId}>{title}</h2>
      <div className="confirm-dialog-message" id={messageId}>
        {children}
      </div>
      {error && (
        <p className="confirm-dialog-error" role="alert">
          {error}
        </p>
      )}
      <div className="confirm-dialog-actions">
        <button
          ref={cancel}
          type="button"
          className="dialog-button"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="dialog-button danger"
          disabled={busy}
          onClick={() => void confirm()}
        >
          {busy ? pendingLabel : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
