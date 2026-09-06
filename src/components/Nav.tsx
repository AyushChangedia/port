import { useEffect, useRef, useState } from 'react';
import { chapters } from '../data/chapters';
import { profile } from '../data/profile';
import { resume } from '../data/socials';
import { onFrame, scrollToSection } from '../lib/runtime';
import { scroll } from '../lib/scroll';
import { play } from '../lib/audio';
import SoundToggle from './SoundToggle';
import './nav.css';

interface Props {
  visible: boolean;
  onSecretMode: () => void;
}

/**
 * Navigation stays out of the way: a wordmark, a readout of where you are,
 * and four destinations. It updates from the shared scroll store inside the
 * frame loop rather than through React state, so moving through the site
 * never re-renders the page.
 */
export default function Nav({ visible, onSecretMode }: Props) {
  const [open, setOpen] = useState(false);
  const readoutRef = useRef<HTMLSpanElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const lastActive = useRef(-1);

  useEffect(() => {
    const off = onFrame(() => {
      if (progressRef.current) {
        progressRef.current.style.transform = `scaleX(${scroll.progress})`;
      }
      if (scroll.active === lastActive.current) return;
      lastActive.current = scroll.active;

      const chapter = chapters[Math.min(scroll.active, chapters.length - 1)];
      if (readoutRef.current && chapter) {
        readoutRef.current.textContent = chapter.state;
      }
      listRef.current?.querySelectorAll<HTMLElement>('[data-chapter]').forEach((el) => {
        el.dataset.current = el.dataset.chapter === String(chapter?.index) ? 'true' : 'false';
      });
    });
    return off;
  }, []);

  // The menu is a modal surface on small screens: escape closes it, and the
  // page behind it must not scroll away underneath.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const go = (id: string) => {
    setOpen(false);
    play('tick');
    scrollToSection(id);
  };

  return (
    <header className="nav" data-visible={visible} data-open={open}>
      <div className="nav-progress" ref={progressRef} aria-hidden="true" />

      <div className="nav-bar">
        <button
          type="button"
          className="nav-mark"
          onDoubleClick={onSecretMode}
          onClick={() => go('origin')}
          data-cursor="text"
          title={profile.fullName}
        >
          <span className="nav-mark-initials display">AC</span>
          <span className="nav-mark-name micro">{profile.fullName}</span>
        </button>

        <p className="nav-readout micro" aria-hidden="true">
          <span className="nav-readout-dot" />
          <span ref={readoutRef}>{chapters[0].state}</span>
        </p>

        <nav className="nav-links" aria-label="Sections">
          <ul ref={listRef}>
            {chapters.slice(1).map((chapter) => (
              <li key={chapter.id}>
                <button
                  type="button"
                  className="nav-link micro"
                  data-chapter={chapter.index}
                  data-cursor="text"
                  onClick={() => go(chapter.id)}
                >
                  {chapter.label}
                </button>
              </li>
            ))}
            <li>
              <a
                className="nav-link micro"
                href={resume.href}
                target="_blank"
                rel="noreferrer noopener"
                data-cursor="open"
              >
                {resume.label}
              </a>
            </li>
          </ul>
        </nav>

        <div className="nav-tools">
          <SoundToggle />
          <button
            type="button"
            className="nav-menu micro"
            aria-expanded={open}
            aria-controls="nav-sheet"
            onClick={() => { setOpen((v) => !v); play('tick'); }}
          >
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      <div className="nav-sheet" id="nav-sheet" hidden={!open}>
        <ul>
          {chapters.map((chapter) => (
            <li key={chapter.id}>
              <button type="button" className="nav-sheet-link display" onClick={() => go(chapter.id)}>
                <span className="nav-sheet-index micro">
                  {String(chapter.index).padStart(2, '0')}
                </span>
                {chapter.label}
              </button>
            </li>
          ))}
          <li>
            <a
              className="nav-sheet-link display"
              href={resume.href}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => setOpen(false)}
            >
              <span className="nav-sheet-index micro">05</span>
              {resume.label}
            </a>
          </li>
        </ul>
      </div>
    </header>
  );
}
