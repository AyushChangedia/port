import { useEffect, useRef } from 'react';
import { panelContent } from '../panels/content';
import './panel.css';

interface Props {
  placeId: string;
  onClose: () => void;
}

/**
 * The reading surface.
 *
 * Fully opaque, high contrast, and it scrolls internally — the 3D world is
 * paused behind it. Nothing about the scene is visible through the text.
 */
export default function Panel({ placeId, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const { title, eyebrow, body } = panelContent(placeId);

  useEffect(() => {
    const timer = window.setTimeout(() => closeRef.current?.focus(), 40);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey, true);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [onClose, placeId]);

  return (
    <div className="panel-scrim" onPointerDown={onClose}>
      <div
        className="panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="panel-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="panel-head">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="panel-title">{title}</h2>
          </div>
          <button type="button" className="panel-close" onClick={onClose} ref={closeRef}>
            Close <span className="kbd">Esc</span>
          </button>
        </header>

        <div className="panel-body">{body}</div>
      </div>
    </div>
  );
}
