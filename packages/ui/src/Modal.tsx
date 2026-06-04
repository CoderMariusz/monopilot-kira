"use client";

import React, { useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';

import '../tokens.css';

// Size prop type
export type ModalSize = 'sm' | 'md' | 'lg' | 'xl';

// ──────────────────────────────────────────────
// Modal.Header
// ──────────────────────────────────────────────
interface ModalHeaderProps {
  title: string;
}

function ModalHeader({ title }: ModalHeaderProps) {
  return (
    <div data-testid="modal-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <Dialog.Title asChild>
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
    <div
      data-testid="modal-body"
      // The body is the scroll region: it grows to fill the space between the
      // (fixed) header and footer and scrolls when the form is taller than the
      // viewport, so the last fields + submit stay reachable on small screens.
      // Mirrors prototype `.modal-body { overflow-y: auto; flex: 1; }`
      // (prototypes/design/Monopilot Design System/_shared/shared.css:12).
      style={{ overflowY: 'auto', flex: '1 1 auto', minHeight: 0 }}
    >
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
  size?: ModalSize | string;
  /** Optional stable prototype/modal registry id for parity evidence. */
  modalId?: string;
  /**
   * When false the backdrop click and ESC key will NOT close the dialog.
   * Defaults to true (dismissible).
   */
  dismissible?: boolean;
  children: React.ReactNode;
}

function Modal({ open, onOpenChange, size = 'md', modalId, dismissible = true, children }: ModalProps) {
  const previouslyOpen = useRef(open);
  const returnFocusTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open && !previouslyOpen.current) {
      const activeElement = document.activeElement;
      returnFocusTo.current = activeElement instanceof HTMLElement ? activeElement : null;
    }

    if (!open && previouslyOpen.current && returnFocusTo.current?.isConnected) {
      returnFocusTo.current.focus();
    }

    previouslyOpen.current = open;
  }, [open]);

  const handleEscapeKeyDown = dismissible
    ? undefined
    : (e: KeyboardEvent) => { e.preventDefault(); };

  const handlePointerDownOutside = dismissible
    ? undefined
    : (e: Event) => { e.preventDefault(); };

  const sizeVar = `var(--modal-size-${size}-width)`;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange} modal={true}>
      {/*
        Render content without a Portal so tests can query via container.
        In a real browser, use Dialog.Portal for proper stacking context.
        Portal is skipped here by not wrapping in Dialog.Portal.
      */}
      <Dialog.Overlay />
      <Dialog.Content
        role="dialog"
        aria-modal="true"
        aria-describedby={undefined}
        data-focus-trap="radix-dialog"
        data-size={size}
        data-modal-id={modalId}
        // Constrain height to the viewport and lay the dialog out as a column so
        // the header/footer stay pinned while Modal.Body scrolls. Without this
        // the content (e.g. the Invite-user form) overflowed past the viewport
        // with no scroll, hiding the lower fields + submit. Mirrors prototype
        // `.modal-box { max-height: 86vh; display: flex; flex-direction: column; }`
        // (prototypes/design/Monopilot Design System/_shared/shared.css:7).
        style={{
          maxWidth: sizeVar,
          maxHeight: '86vh',
          display: 'flex',
          flexDirection: 'column',
        }}
        onEscapeKeyDown={handleEscapeKeyDown}
        onPointerDownOutside={handlePointerDownOutside}
      >
        {children}
      </Dialog.Content>
    </Dialog.Root>
  );
}

// Attach sub-components
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;
