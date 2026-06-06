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
    <div data-testid="modal-header" className="mp-modal-head">
      <Dialog.Title asChild>
        <h2 className="mp-modal-title" style={{ margin: 0 }}>{title}</h2>
      </Dialog.Title>
      <Dialog.Close asChild>
        <button
          data-testid="modal-close-button"
          className="mp-modal-close"
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
      className="mp-modal-body"
      // The body is the scroll region: it grows to fill the space between the
      // (fixed) header and footer and scrolls when the form is taller than the
      // viewport, so the last fields + submit stay reachable on small screens.
      // Padding lives in `.mp-modal-body` (tokens.css) so the form is never
      // glued to the dialog edge.
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
    <div data-testid="modal-footer" className="mp-modal-foot">
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
        Portal the overlay + content to <body> so the dialog escapes the page's
        stacking/overflow context and renders as a true centered overlay (was
        previously rendered inline — which glued the box under the page with no
        backdrop). `.mp-modal-overlay` paints the scrim; `.mp-modal-content`
        positions the box dead-center with a spring-in animation (tokens.css).
      */}
      <Dialog.Portal>
        <Dialog.Overlay className="mp-modal-overlay" />
        <Dialog.Content
          role="dialog"
          aria-modal="true"
          aria-describedby={undefined}
          data-focus-trap="radix-dialog"
          data-size={size}
          data-modal-id={modalId}
          className="mp-modal-content"
          // Width is read from the design-system token (parity contract asserted
          // in Modal.test.tsx); centering/elevation/animation come from the class.
          style={{
            width: sizeVar,
            maxWidth: 'calc(100vw - 32px)',
            maxHeight: '86vh',
          }}
          onEscapeKeyDown={handleEscapeKeyDown}
          onPointerDownOutside={handlePointerDownOutside}
        >
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Attach sub-components
Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;
