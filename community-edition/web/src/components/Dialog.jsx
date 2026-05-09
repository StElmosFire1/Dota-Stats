import React, { useEffect, useRef } from 'react';

// Shared modal/dialog primitive (Task #165).
//
// Wraps any modal body in a focus-trapping, Escape-closing, ARIA-labelled
// dialog with a backdrop. Replaces the per-modal boilerplate that used to
// be copy-pasted into every login/onboarding/booking modal.
//
// Behaviours:
// - Backdrop is `role="presentation"` and (by default) closes on click and
//   on Escape.
// - Content is `role="dialog"` + `aria-modal="true"` and is the focus
//   container. Tab and Shift+Tab cycle within it.
// - On open: previously-focused element is captured; either
//   `initialFocusRef` or the first focusable inside the dialog is given
//   focus. Body scroll is locked.
// - On close (effect cleanup): body scroll is restored and focus is
//   returned to whatever opened the dialog.
//
// Styling: callers pass `backdropClassName`/`contentClassName` and/or
// `backdropStyle`/`contentStyle` to keep visual parity with their existing
// design. Default backdrop styling is only applied when no
// `backdropClassName` is provided (so the existing `.modal-overlay` CSS
// class continues to fully own its layout).

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({
  open,
  onClose,
  labelledBy,
  label,
  closeOnBackdrop = true,
  closeOnEscape = true,
  initialFocusRef,
  backdropClassName,
  backdropStyle,
  contentClassName,
  contentStyle,
  children,
}) {
  const contentRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    previouslyFocusedRef.current = document.activeElement;

    const focusTimer = window.setTimeout(() => {
      if (initialFocusRef && initialFocusRef.current) {
        try { initialFocusRef.current.focus(); } catch { /* ignore */ }
        return;
      }
      const node = contentRef.current;
      if (!node) return;
      const focusables = node.querySelectorAll(FOCUSABLE_SELECTOR);
      const target = focusables[0] || node;
      try { target.focus(); } catch { /* ignore */ }
    }, 0);

    const onKey = (e) => {
      if (closeOnEscape && e.key === 'Escape') {
        e.stopPropagation();
        onClose && onClose();
        return;
      }
      if (e.key !== 'Tab' || !contentRef.current) return;
      const focusables = contentRef.current.querySelectorAll(FOCUSABLE_SELECTOR);
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      const escaped = !contentRef.current.contains(active);
      if (e.shiftKey && (active === first || escaped)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || escaped)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus(); } catch { /* ignore */ }
      }
      previouslyFocusedRef.current = null;
    };
  }, [open, onClose, closeOnEscape, initialFocusRef]);

  if (!open) return null;

  const handleBackdropClick = (e) => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) onClose && onClose();
  };

  const defaultBackdropStyle = {
    position: 'fixed',
    inset: 0,
    zIndex: 9000,
    background: 'rgba(0,0,0,0.6)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  };

  const finalBackdropStyle = backdropClassName
    ? backdropStyle
    : { ...defaultBackdropStyle, ...backdropStyle };

  return (
    <div
      role="presentation"
      onClick={handleBackdropClick}
      className={backdropClassName}
      style={finalBackdropStyle}
    >
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className={contentClassName}
        style={contentStyle}
      >
        {children}
      </div>
    </div>
  );
}
