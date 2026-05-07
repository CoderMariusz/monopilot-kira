import React, { useId } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

// Size prop type
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

// Context to share the title ID between Modal and Modal.Header
const ModalTitleIdContext = React.createContext<string>('');

// ──────────────────────────────────────────────
// Modal.Header
// ──────────────────────────────────────────────
interface ModalHeaderProps {
  title: string;
}

function ModalHeader({ title }: ModalHeaderProps) {
  const titleId = React.useContext(ModalTitleIdContext);
  return (
    <div data-testid="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Dialog.Title id={titleId} asChild>
        <h2 style={{ margin: 0 }}>{title}</h2>
      </Dialog.Title>
      <Dialog.Close asChild>
        <button
          data-testid="modal-close-button"
          aria-label="Close"
          type="button"
        >
          ✕
        </button>
      </Dialog.Close>
    </div>
  );
}

// ──────────────────────────────────────────────
// Modal.Body
// ──────────────────────────────────────────────
interface ModalBodyProps {
  children: React.ReactNode;
}

function ModalBody({ children }: ModalBodyProps) {
  return (
    <div data-testid="modal-body">
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────
// Modal.Footer
// ──────────────────────────────────────────────
interface ModalFooterProps {
  children: React.ReactNode;
}

function ModalFooter({ children }: ModalFooterProps) {
  return (
    <div
      data-testid="modal-footer"
      style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}
    >
      {children}
    </div>
  );
}

// ──────────────────────────────────────────────
// Modal (root)
// ──────────────────────────────────────────────
interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Size variant — maps to --modal-size-{size}-width token */
  size?: ModalSize;
  /**
   * When false the backdrop click and ESC key will NOT close the dialog.
   * Defaults to true (dismissible).
   */
  dismissible?: boolean;
  children: React.ReactNode;
}

function Modal({ open, onOpenChange, size = 'md', dismissible = true, children }: ModalProps) {
  // Generate a stable, unique ID for aria-labelledby wiring
  const titleId = useId();

  const handleEscapeKeyDown = dismissible
    ? undefined
    : (e: KeyboardEvent) => { e.preventDefault(); };

  const handlePointerDownOutside = dismissible
    ? undefined
    : (e: Event) => { e.preventDefault(); };

  const sizeVar = `var(--modal-size-${size}-width, 480px)`;

  return (
    <ModalTitleIdContext.Provider value={titleId}>
      <Dialog.Root open={open} onOpenChange={onOpenChange} modal={true}>
        <Dialog.Portal>
          <Dialog.Overlay />
          <Dialog.Content
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            data-size={size}
            style={{ maxWidth: sizeVar }}
            onEscapeKeyDown={handleEscapeKeyDown}
            onPointerDownOutside={handlePointerDownOutside}
          >
            {children}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </ModalTitleIdContext.Provider>
  );
}

// Attach sub-components
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;
