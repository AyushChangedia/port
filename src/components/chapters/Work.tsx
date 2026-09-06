import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { projects, type Project } from '../../data/projects';
import { useChapter, useMediaQuery, useReducedMotion } from '../../lib/hooks';
import { play } from '../../lib/audio';
import { ChapterMark } from '../Type';
import ProjectVisual from '../ProjectVisual';
import CaseStudy from '../CaseStudy';
import './work.css';

/**
 * The exhibition.
 *
 * On a wide screen the stage is pinned and the projects are cut between as you
 * scroll: each plate wipes over the last while its title travels across the
 * frame at a different rate. Below that width, and under reduced motion, the
 * same plates are simply stacked — the art direction survives, the pinning
 * does not, because a hijacked scroll on a phone is worse than no effect.
 */
export default function Work() {
  const ref = useChapter(2);
  const stageRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  const wide = useMediaQuery('(min-width: 901px)');
  const cinematic = wide && !reduced;

  const [open, setOpen] = useState<Project | null>(null);
  const [origin, setOrigin] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const section = ref.current;
    const stage = stageRef.current;
    if (!section || !stage || !cinematic) return;

    const ctx = gsap.context(() => {
      const plates = gsap.utils.toArray<HTMLElement>('.plate');
      if (plates.length < 2) return;
      plates.forEach((plate, i) => {
        plate.dataset.current = i === 0 ? 'true' : 'false';
      });

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: section,
          start: 'top top',
          end: () => `+=${window.innerHeight * (plates.length - 1) * 1.15}`,
          scrub: 0.7,
          pin: stage,
          pinSpacing: true,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            const i = Math.min(plates.length - 1, Math.round(self.progress * (plates.length - 1)));
            if (indexRef.current) {
              indexRef.current.textContent = projects[i].index;
            }
            // The plates are stacked, and a plate at opacity 0 still swallows
            // clicks. Marking the current one is what keeps the visitor
            // clicking the project they can actually see.
            plates.forEach((plate, index) => {
              plate.dataset.current = index === i ? 'true' : 'false';
            });
          },
        },
      });

      plates.forEach((plate, i) => {
        const title = plate.querySelector('.plate-title');
        const meta = plate.querySelector('.plate-meta');

        if (i > 0) {
          // A cut, not a cross-dissolve. Two plates fading through each other
          // superimposes two sets of display type and the frame turns to mud;
          // moving one out as the other moves in keeps every frame readable.
          tl.fromTo(
            plate,
            { yPercent: 100, opacity: 1 },
            { yPercent: 0, ease: 'power2.inOut', duration: 1 },
            i - 1,
          );
          tl.to(
            plates[i - 1],
            { yPercent: -55, scale: 0.94, opacity: 0, ease: 'power2.inOut', duration: 1 },
            i - 1,
          );
        }

        // Titles travel horizontally, faster than the plates they belong to.
        if (title) {
          tl.fromTo(
            title,
            { xPercent: i === 0 ? 0 : 14 },
            { xPercent: -8, ease: 'none', duration: 1.6 },
            Math.max(0, i - 1),
          );
        }
        if (meta) {
          tl.fromTo(meta, { opacity: 0, y: 24 }, { opacity: 1, y: 0, ease: 'power2.out', duration: 0.5 }, Math.max(0, i - 0.55));
        }
      });
    }, section);

    return () => ctx.revert();
  }, [ref, cinematic]);

  // Stable identity: the overlay keys its opening animation off this, and a
  // new function on every hover re-render would restart the transition
  // half-played.
  const closeProject = useCallback(() => {
    setOpen(null);
    play('close');
  }, []);

  const openProject = (project: Project, event: React.MouseEvent | React.KeyboardEvent) => {
    const el = (event.currentTarget as HTMLElement).querySelector('.project-visual') ?? event.currentTarget;
    setOrigin((el as HTMLElement).getBoundingClientRect());
    setOpen(project);
    play('open');
  };

  return (
    <section
      className="chapter work"
      id="work"
      ref={ref as React.RefObject<HTMLElement>}
      data-cinematic={cinematic}
      aria-labelledby="work-heading"
    >
      <div className="work-stage" ref={stageRef}>
        <div className="work-head">
          <ChapterMark index={2} label="Work" />
          <h2 id="work-heading" className="work-heading display">
            Selected
            <br />
            <span className="work-heading-outline">Work</span>
          </h2>
          {cinematic && (
            <p className="work-counter micro" aria-hidden="true">
              <span ref={indexRef}>01</span>
              <span> / {String(projects.length).padStart(2, '0')}</span>
            </p>
          )}
        </div>

        <ol className="work-plates">
          {projects.map((project, i) => (
            <li
              className="plate"
              key={project.id}
              style={{ zIndex: i + 1 }}
              data-active={hovered === project.id}
            >
              <button
                type="button"
                className="plate-button"
                data-cursor="explore"
                onClick={(e) => openProject(project, e)}
                onMouseEnter={() => { setHovered(project.id); play('tick'); }}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered(project.id)}
                onBlur={() => setHovered(null)}
                aria-label={`Open case study: ${project.title}`}
              >
                <span className="plate-index micro">{project.index}</span>

                <span className="plate-visual">
                  <ProjectVisual
                    kind={project.visual}
                    energy={hovered === project.id ? 1 : 0}
                    label={`Generative diagram representing ${project.title}`}
                  />
                </span>

                <span className="plate-title display" aria-hidden="true">
                  {project.displayTitle.map((word) => (
                    <span key={word}>{word}</span>
                  ))}
                </span>

                <span className="plate-meta">
                  <span className="plate-tagline serif">{project.tagline}</span>
                  <span className="plate-tech">
                    {project.tech.map((tech) => (
                      <span key={tech} className="micro">{tech}</span>
                    ))}
                  </span>
                  <span className="plate-year micro">{project.year}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <CaseStudy project={open} origin={origin} onClose={closeProject} />
    </section>
  );
}
