import { useEffect, useRef } from 'react';
import './colophon.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

const NOTES: [string, string][] = [
  ['Environment', 'One WebGL point field for the whole site, morphing between five states as you scroll. It is never torn down between sections — that is why the site has no seams.'],
  ['Typography', 'Archivo across a variable width axis, Instrument Serif for the asides, IBM Plex Mono for anything the machine says. Scroll velocity is wired to the width axis.'],
  ['Motion', 'GSAP ScrollTrigger and Lenis, on a single shared frame loop. Everything honours prefers-reduced-motion.'],
  ['Project visuals', 'Drawn procedurally, not photographed. Each one diagrams what its project actually does.'],
  ['Hidden', 'Type his first name anywhere. Double-click the wordmark.'],
];

/** The third of the site's rewards: how the thing in front of you was made. */
export default function Colophon({ open, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => closeRef.current?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="colophon-scrim" onClick={onClose} role="presentation">
      <div
        className="colophon"
        role="dialog"
        aria-modal="true"
        aria-labelledby="colophon-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="colophon-head">
          <h2 id="colophon-title" className="micro">Colophon</h2>
          <button type="button" className="micro colophon-close" onClick={onClose} ref={closeRef}>
            Close
          </button>
        </header>

        <dl className="colophon-list">
          {NOTES.map(([term, detail]) => (
            <div key={term}>
              <dt className="micro">{term}</dt>
              <dd>{detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
