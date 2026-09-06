import { useEffect, useRef } from 'react';
import { places } from '../data/world';

interface Props {
  onGo: (placeId: string) => void;
  onOpen: (placeId: string) => void;
  onClose: () => void;
}

/**
 * The directory.
 *
 * Every place in the world as a plain list. This is the path that does not
 * require steering anything — keyboard users, screen readers, and anyone who
 * would simply rather read get here in one keystroke.
 */
export default function Directory({ onGo, onOpen, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // The first place, not the close button — the list is the point.
    const first = ref.current?.querySelector<HTMLElement>('.dir-item');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div className="dir-scrim" onPointerDown={onClose}>
      <div
        className="dir"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dir-title"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <header className="dir-head">
          <h2 id="dir-title">Places</h2>
          <button type="button" className="panel-close" onClick={onClose}>
            Close <span className="kbd">Esc</span>
          </button>
        </header>

        <ul className="dir-list">
          {places.map((place) => (
            <li key={place.id}>
              <button type="button" className="dir-item" onClick={() => onOpen(place.id)}>
                <span className="dir-name">{place.name}</span>
                <span className="dir-sub">{place.sub}</span>
                <span className="dir-action">Read</span>
              </button>
              <button
                type="button"
                className="dir-walk"
                onClick={() => onGo(place.id)}
                aria-label={`Walk to ${place.name}`}
              >
                Walk there
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
