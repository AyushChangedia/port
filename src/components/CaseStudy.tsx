import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import gsap from 'gsap';
import type { Project } from '../data/projects';
import { lockScroll } from '../lib/runtime';
import ProjectVisual from './ProjectVisual';
import './case-study.css';

interface Props {
  project: Project | null;
  /** Rect of the plate that was clicked — the transition grows from it. */
  origin: DOMRect | null;
  onClose: () => void;
}

/**
 * Opening a project is a move within the same space, not a page load.
 *
 * The overlay is clipped to the plate the visitor clicked and then opens out
 * to fill the frame, so the thing they pressed becomes the thing they are
 * looking at. Closing plays the same move backwards.
 */
export default function CaseStudy({ project, origin, onClose }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!project) return;
    const root = rootRef.current;
    if (!root) return;

    restoreFocus.current = document.activeElement as HTMLElement | null;
    lockScroll(true);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = gsap.context(() => {
      if (reduced) {
        gsap.set(root, { clipPath: 'inset(0px)', opacity: 1 });
        gsap.set('.case-reveal', { opacity: 1, y: 0 });
        return;
      }

      // Clip to where the plate was, in viewport coordinates.
      const from = origin
        ? `inset(${origin.top}px ${window.innerWidth - origin.right}px ${
            window.innerHeight - origin.bottom
          }px ${origin.left}px)`
        : 'inset(45% 45% 45% 45%)';

      gsap
        .timeline({ defaults: { ease: 'expo.inOut' } })
        .fromTo(root, { clipPath: from }, { clipPath: 'inset(0px)', duration: 0.85 })
        .fromTo(
          '.case-reveal',
          { opacity: 0, y: 34 },
          { opacity: 1, y: 0, duration: 0.8, stagger: 0.055, ease: 'expo.out' },
          0.35,
        );
    }, root);

    // Focus moves into the overlay so the keyboard follows the eye.
    const focusTimer = window.setTimeout(() => closeRef.current?.focus(), 120);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Contain Tab within the overlay: nothing behind it is reachable.
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', onKey);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener('keydown', onKey);
      ctx.revert();
      lockScroll(false);
      restoreFocus.current?.focus?.();
    };
  }, [project, origin, onClose]);

  if (!project) return null;

  // Portalled to the body on purpose: the main content sits in its own
  // stacking context beneath the navigation, so an overlay rendered inside it
  // could never rise above the bar no matter what z-index it claimed.
  return createPortal(
    <div
      className="case"
      ref={rootRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-title"
    >
      <div className="case-panel" ref={panelRef}>
        <header className="case-head">
          <p className="case-eyebrow micro case-reveal">
            <span>{project.index}</span>
            <span aria-hidden="true"> — </span>
            <span>{project.year}</span>
          </p>
          <button
            type="button"
            className="case-close mono"
            onClick={onClose}
            ref={closeRef}
            data-cursor="close"
          >
            Close
            <span aria-hidden="true" className="case-close-key">Esc</span>
          </button>
        </header>

        <h2 id="case-title" className="case-title display case-reveal">
          {project.displayTitle.map((word, i) => (
            <span key={word} data-outline={i === project.displayTitle.length - 1}>
              {word}
            </span>
          ))}
        </h2>

        <div className="case-body">
          <div className="case-visual case-reveal">
            <ProjectVisual
              kind={project.visual}
              energy={0.6}
              label={`Generative diagram representing ${project.title}`}
            />
          </div>

          <div className="case-text">
            <p className="case-tagline serif case-reveal">{project.tagline}</p>
            {project.body.map((paragraph, i) => (
              <p className="case-paragraph case-reveal" key={i}>
                {paragraph}
              </p>
            ))}

            {project.result && (
              <p className="case-result case-reveal">
                <span className="micro case-result-label">Result</span>
                <span>{project.result}</span>
              </p>
            )}

            <dl className="case-facts case-reveal">
              <div>
                <dt className="micro">Built with</dt>
                <dd>
                  <ul className="case-tech">
                    {project.tech.map((tech) => (
                      <li key={tech} className="micro">{tech}</li>
                    ))}
                  </ul>
                </dd>
              </div>
              <div>
                <dt className="micro">Year</dt>
                <dd>{project.year}</dd>
              </div>
            </dl>

            {project.links.length > 0 ? (
              <ul className="case-links case-reveal">
                {project.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="case-link"
                      data-cursor="open"
                    >
                      <span>{link.label}</span>
                      <span aria-hidden="true" className="case-link-arrow">↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              // Stated plainly rather than linking somewhere that does not exist.
              <p className="case-nolink micro case-reveal">Source not public</p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
