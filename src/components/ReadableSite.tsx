import { places } from '../data/world';
import { panelContent } from '../panels/content';
import { profile } from '../data/profile';
import './readable.css';

interface Props {
  /** Absent when this is the WebGL fallback rather than a user choice. */
  onExit?: () => void;
  reason?: 'choice' | 'fallback';
}

/**
 * Everything, as a plain document.
 *
 * This is the no-WebGL fallback, the reduced-motion path, and a button anyone
 * can press at any time. The content is identical to the world's — it comes
 * from the same source — so choosing to read never costs you anything.
 */
export default function ReadableSite({ onExit, reason = 'fallback' }: Props) {
  return (
    <div className="readable">
      <header className="readable-top">
        <div>
          <h1>{profile.fullName}</h1>
          <p className="readable-role">{profile.role} · {profile.location}</p>
        </div>
        {onExit ? (
          <button type="button" className="btn btn--solid" onClick={onExit}>
            Back to the world
          </button>
        ) : (
          <p className="readable-note">
            {reason === 'fallback'
              ? 'Your browser could not start 3D graphics, so here is everything as a page.'
              : null}
          </p>
        )}
      </header>

      <main className="readable-main">
        {places.map((place) => {
          const { title, eyebrow, body } = panelContent(place.id);
          return (
            <section className="readable-section" key={place.id} id={`read-${place.id}`}>
              <p className="eyebrow">{eyebrow}</p>
              <h2>{title}</h2>
              <div className="readable-body">{body}</div>
            </section>
          );
        })}
      </main>
    </div>
  );
}
