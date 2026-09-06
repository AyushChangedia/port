import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { profile } from '../../data/profile';
import { useChapter, useReducedMotion } from '../../lib/hooks';
import { onFrame } from '../../lib/runtime';
import { scroll } from '../../lib/scroll';
import './hero.css';

interface Props {
  ready: boolean;
}

/**
 * The opening composition.
 *
 * Not a headline and a button: a piece of typography laid out asymmetrically
 * over the environment, which drifts apart as you scroll so that the name is
 * still on screen — travelling — when the next chapter begins. That overlap is
 * what stops the site reading as a stack of sections.
 */
export default function Hero({ ready }: Props) {
  const ref = useChapter(0);
  const reduced = useReducedMotion();
  const [facet, setFacet] = useState(0);
  const widthRef = useRef<HTMLDivElement>(null);

  // Scroll-driven departure: the two halves of the name leave in opposite
  // directions, at different rates.
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: el,
          start: 'top top',
          end: 'bottom top',
          scrub: 0.8,
        },
      });
      tl.to('.hero-first', { xPercent: -16, ease: 'none' }, 0)
        .to('.hero-last', { xPercent: 13, ease: 'none' }, 0)
        .to('.hero-aside', { yPercent: -40, opacity: 0, ease: 'none' }, 0)
        .to('.hero-cue', { opacity: 0, duration: 0.2, ease: 'none' }, 0);
    }, el);

    return () => ctx.revert();
  }, [ref, reduced]);

  // Scroll velocity writes into the variable font's width axis. The type does
  // not have an animation attached to it — it simply narrows when you move.
  useEffect(() => {
    if (reduced) return;
    const node = widthRef.current;
    if (!node) return;
    let current = 100;
    return onFrame((dt) => {
      const target = 100 - scroll.intensity * 34;
      current += (target - current) * Math.min(1, dt * 7);
      node.style.setProperty('--type-wdth', current.toFixed(1));
    });
  }, [reduced]);

  // A slow highlight travelling through the self-descriptions. No typewriter,
  // no cursor — the facets are all present, one is simply lit.
  useEffect(() => {
    if (!ready) return;
    const id = window.setInterval(() => {
      setFacet((f) => (f + 1) % profile.facets.length);
    }, 2600);
    return () => window.clearInterval(id);
  }, [ready]);

  return (
    <section
      className="chapter hero"
      id="origin"
      ref={ref as React.RefObject<HTMLElement>}
      data-ready={ready}
      aria-labelledby="hero-name"
    >
      <div className="hero-type" ref={widthRef}>
        <h1 id="hero-name" className="hero-name display">
          <span className="hero-first">{profile.firstName}</span>
          <span className="hero-last">{profile.lastName}</span>
        </h1>
      </div>

      <div className="hero-aside">
        <p className="hero-thesis serif">
          <em>{profile.thesis}</em>
        </p>

        <ul className="hero-facets" aria-label="Roles">
          {profile.facets.map((item, i) => (
            <li key={item} className="micro" data-lit={i === facet}>
              {item}
            </li>
          ))}
        </ul>

        <p className="hero-status micro">
          <span className="hero-status-dot" aria-hidden="true" />
          {profile.availability}
        </p>
      </div>

      <div className="hero-cue micro" aria-hidden="true">
        <span>Scroll</span>
        <span className="hero-cue-line" />
      </div>
    </section>
  );
}

