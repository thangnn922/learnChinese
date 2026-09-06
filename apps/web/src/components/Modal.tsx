import { useEffect, useRef, type ReactNode } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại có bẫy focus: mở thì focus vào trong, Tab quay vòng,
 * Esc đóng, đóng thì trả focus về phần tử đã mở nó.
 */
export function Modal({
  open,
  titleId,
  title,
  description,
  onClose,
  children,
  actions,
}: {
  open: boolean;
  titleId: string;
  title: string;
  description?: string;
  onClose: () => void;
  children?: ReactNode;
  actions: ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const first = box?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? box)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !box) return;
      const nodes = [...box.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (n) => n.offsetParent !== null || n === document.activeElement,
      );
      if (!nodes.length) return;
      const first2 = nodes[0] as HTMLElement;
      const last = nodes[nodes.length - 1] as HTMLElement;
      if (e.shiftKey && document.activeElement === first2) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first2.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = prevOverflow;
      returnTo.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const descId = description ? `${titleId}-desc` : undefined;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        ref={boxRef}
        tabIndex={-1}
      >
        <h2 id={titleId}>{title}</h2>
        {description ? (
          <p id={descId} className="muted">
            {description}
          </p>
        ) : null}
        {children}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  );
}
