import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { profile } from '../data/profile';
import { lockScroll } from '../lib/runtime';
import { play } from '../lib/audio';
import './intro.css';

const SEEN_KEY = 'ac.intro.seen';
const ECHOES = 7;

interface Props {
  onComplete: () => void;
}

function alreadySeen(): boolean {
  if (typeof window === 'undefined') return true;
  if (/[?&](intro|replay)\b/.test(window.location.search)) return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The opening.
 *
 * The site's central motif stated once, before anything else: repetition,
 * drifting out of phase, resolving into a single clean statement. It runs
 * about four seconds, it is skippable at any moment with the mouse or the
 * keyboard, and it plays once per session.
 */
export default function Intro({ onComplete }: Props) {
  const [dismissed, setDismissed] = useState(alreadySeen);
  const rootRef = useRef<HTMLDivElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const timelineRef = useRef<gsap.core.Timeline | null>(null);
  const finishedRef = useRef(false);

  // Returning visitors never see it again, so hand control straight over.
  useEffect(() => {
    if (dismissed) onComplete();
  }, [dismissed, onComplete]);

  useEffect(() => {
    if (dismissed) return;
    const root = rootRef.current;
    if (!root) return;

    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode — the intro simply plays again next time */
    }

    lockScroll(true);
    window.scrollTo(0, 0);

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const finish = () => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      lockScroll(false);
      onComplete();
      // Unmount after the wipe has cleared the viewport.
      window.setTimeout(() => setDismissed(true), 200);
    };

    const ctx = gsap.context(() => {
      const counter = { value: 0 };
      const writeCounter = () => {
        if (counterRef.current) {
          counterRef.current.textContent = String(Math.round(counter.value)).padStart(3, '0');
        }
      };

      if (reduced) {
        // Reduced motion still gets the title card — it just does not move.
        const tl = gsap.timeline({ onComplete: finish });
        tl.set(['.intro-echo', '.intro-sub', '.intro-meta'], { opacity: 1, x: 0, y: 0 })
          .set('.intro-echo:not(:last-child)', { opacity: 0 })
          .to(counter, { value: 100, duration: 0.5, onUpdate: writeCounter })
          .to(root, { opacity: 0, duration: 0.35 }, '+=0.5');
        timelineRef.current = tl;
        return;
      }

      const tl = gsap.timeline({ defaults: { ease: 'expo.out' }, onComplete: finish });
      timelineRef.current = tl;

      tl
        // The frame announces itself first: small type, in the margins.
        .fromTo('.intro-meta', { opacity: 0 }, { opacity: 1, duration: 0.5, stagger: 0.06 }, 0)
        .to(counter, { value: 100, duration: 2.5, ease: 'power1.inOut', onUpdate: writeCounter }, 0)

        // Seven copies of the same word, out of phase.
        .fromTo(
          '.intro-echo',
          {
            opacity: 0,
            yPercent: (i: number) => -28 + i * 9,
            xPercent: (i: number) => (i - ECHOES / 2) * 7,
            filter: 'blur(14px)',
          },
          {
            opacity: (i: number) => 0.13 + i * 0.06,
            filter: 'blur(5px)',
            duration: 0.85,
            stagger: 0.04,
          },
          0.12,
        )

        // …resolving into one.
        .to(
          '.intro-echo',
          {
            yPercent: 0,
            xPercent: 0,
            filter: 'blur(0px)',
            duration: 1.05,
            ease: 'expo.inOut',
            stagger: { each: 0.025, from: 'start' },
          },
          0.95,
        )
        .to('.intro-echo:not(:last-child)', { opacity: 0, duration: 0.45 }, 1.6)
        .to('.intro-echo:last-child', { opacity: 1, duration: 0.45 }, 1.6)

        // The surname arrives with the width axis opening up under it.
        .fromTo(
          '.intro-sub span',
          { yPercent: 110, '--type-wdth': 62 },
          { yPercent: 0, '--type-wdth': 100, duration: 1.05, ease: 'expo.out' },
          1.72,
        )
        .fromTo('.intro-role', { opacity: 0, y: 12 }, { opacity: 1, y: 0, duration: 0.7 }, 2.15)

        // The card lifts away, and the site is already behind it.
        .to('.intro-inner', { yPercent: -8, scale: 1.06, filter: 'blur(10px)', opacity: 0, duration: 0.8, ease: 'power3.in' }, 2.85)
        .to(root, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.95, ease: 'expo.inOut' }, 2.98)
        .add(() => play('open'), 2.98);
    }, root);

    // Escape, Enter or Space skips — the same affordance the button gives.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener('keydown', onKey);

    function skip() {
      timelineRef.current?.progress(1, false).kill();
      gsap.to(root, {
        opacity: 0,
        duration: 0.28,
        ease: 'power2.out',
        onComplete: finish,
      });
    }

    root.dataset.skipHandler = 'ready';
    (root as HTMLDivElement & { __skip?: () => void }).__skip = skip;

    return () => {
      window.removeEventListener('keydown', onKey);
      ctx.revert();
      lockScroll(false);
    };
  }, [dismissed, onComplete]);

  if (dismissed) return null;

  const handleSkip = () => {
    const root = rootRef.current as (HTMLDivElement & { __skip?: () => void }) | null;
    root?.__skip?.();
  };

  return (
    <div className="intro" ref={rootRef} role="presentation">
      <div className="intro-inner">
        <p className="intro-meta micro intro-meta--tl">
          {profile.fullName}
          <br />
          Interactive profile
        </p>
        <p className="intro-meta micro intro-meta--tr">
          <span ref={counterRef}>000</span>
          <span aria-hidden="true"> / 100</span>
        </p>

        <div className="intro-stage">
          <div className="intro-stack" aria-hidden="true">
            {Array.from({ length: ECHOES }, (_, i) => (
              <span className="intro-echo display" key={i}>
                {profile.firstName}
              </span>
            ))}
          </div>
          <h1 className="intro-sub display">
            <span>{profile.lastName}</span>
            <span className="visually-hidden">
              {' '}
              — {profile.role}
            </span>
          </h1>
          <p className="intro-role micro">{profile.role}</p>
        </div>

        <p className="intro-meta micro intro-meta--bl">Pune, India</p>
      </div>

      <button type="button" className="intro-skip mono" onClick={handleSkip}>
        Skip
      </button>
    </div>
  );
}
