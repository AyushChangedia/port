import { useEffect, useMemo, useRef, useState } from 'react';
import { groupLabels, skills, type Skill, type SkillGroup } from '../../data/skills';
import { projects } from '../../data/projects';
import { useChapter, useMediaQuery, useReducedMotion } from '../../lib/hooks';
import { onFrame } from '../../lib/runtime';
import { hash } from '../../lib/text';
import { ChapterMark, Fade } from '../Type';
import './system.css';

interface Placed extends Skill {
  x: number; // 0–1
  y: number;
}

/**
 * Cluster centres, in normalised space.
 *
 * Spread across a 3×2 arrangement so no two disciplines can ever collide —
 * a constellation whose labels overlap is just a mess with ambitions.
 */
const ANCHORS: Record<SkillGroup, [number, number]> = {
  language: [0.14, 0.24],
  backend: [0.5, 0.16],
  ai: [0.85, 0.26],
  concept: [0.14, 0.76],
  tooling: [0.5, 0.84],
  data: [0.85, 0.72],
};

/**
 * Technologies as a system rather than a scoreboard.
 *
 * No percentages and no bars — those measure nothing. Instead each technology
 * is a node, clusters are disciplines, and the lines are real relationships:
 * hovering a technology lights the projects that actually use it, and hovering
 * a project lights the technologies it was built from.
 */
export default function System() {
  const ref = useChapter(3);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const wide = useMediaQuery('(min-width: 861px)');
  const [active, setActive] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<string | null>(null);

  // Deterministic layout: a cluster per discipline, members spread around it
  // by golden angle so nothing collides and the shape is the same every visit.
  const placed = useMemo<Placed[]>(() => {
    const byGroup = new Map<SkillGroup, Skill[]>();
    for (const skill of skills) {
      const list = byGroup.get(skill.group) ?? [];
      list.push(skill);
      byGroup.set(skill.group, list);
    }

    const out: Placed[] = [];
    byGroup.forEach((members, group) => {
      const [ax, ay] = ANCHORS[group];
      const rows = Math.ceil(members.length / 2);

      members.forEach((skill, i) => {
        // Two columns per cluster, stacked. Labels are horizontal text, so
        // stacking them vertically is what guarantees they stay readable;
        // a small deterministic jitter keeps it from looking like a table.
        const col = i % 2;
        const row = Math.floor(i / 2);
        const jx = (hash(i * 12.9 + ax * 31) - 0.5) * 0.022;
        const jy = (hash(i * 5.1 + ay * 17) - 0.5) * 0.018;

        out.push({
          ...skill,
          x: Math.min(0.93, Math.max(0.07, ax + (col - 0.5) * 0.15 + jx)),
          y: Math.min(0.93, Math.max(0.07, ay + (row - (rows - 1) / 2) * 0.105 + jy)),
        });
      });
    });
    return out;
  }, []);

  const activeSkill = active ? placed.find((s) => s.id === active) ?? null : null;
  const litProjects = activeSkill ? activeSkill.projects : [];
  const litSkills = activeProject
    ? placed.filter((s) => s.projects.includes(activeProject)).map((s) => s.id)
    : [];

  // The connective tissue is drawn on a canvas behind the real, focusable
  // buttons — the graphics layer never becomes the interaction layer.
  useEffect(() => {
    if (!wide) return;
    const canvas = canvasRef.current;
    const field = fieldRef.current;
    if (!canvas || !field) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const resize = () => {
      const rect = field.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(field);

    const styles = getComputedStyle(document.documentElement);
    const faint = styles.getPropertyValue('--ink-faint').trim() || '#5d594f';
    const signal = styles.getPropertyValue('--signal').trim() || '#d8452a';

    // Two kinds of edge: within a discipline, and between technologies that
    // share a project.
    const edges: { a: Placed; b: Placed; shared: string | null }[] = [];
    for (let i = 0; i < placed.length; i += 1) {
      for (let j = i + 1; j < placed.length; j += 1) {
        const a = placed[i];
        const b = placed[j];
        const shared = a.projects.find((p) => b.projects.includes(p)) ?? null;
        const near = Math.hypot(a.x - b.x, a.y - b.y) < 0.2 && a.group === b.group;
        if (shared || near) edges.push({ a, b, shared });
      }
    }

    const draw = (t: number) => {
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);

      for (const { a, b, shared } of edges) {
        const lit =
          (active && (a.id === active || b.id === active)) ||
          (activeProject && shared === activeProject);

        ctx.strokeStyle = lit ? signal : faint;
        ctx.globalAlpha = lit ? 0.8 : 0.16;
        ctx.lineWidth = lit ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(a.x * w, a.y * h);
        ctx.lineTo(b.x * w, b.y * h);
        ctx.stroke();

        // A signal travelling the lit edge — the relationship, in motion.
        if (lit && !reduced) {
          const p = (t * 0.5) % 1;
          ctx.globalAlpha = 1;
          ctx.fillStyle = signal;
          ctx.beginPath();
          ctx.arc(
            (a.x + (b.x - a.x) * p) * w,
            (a.y + (b.y - a.y) * p) * h,
            2,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
    };

    draw(0);
    if (reduced) return () => observer.disconnect();

    const off = onFrame((_dt, elapsed) => {
      if (document.hidden) return;
      draw(elapsed);
    });
    return () => {
      off();
      observer.disconnect();
    };
  }, [placed, active, activeProject, wide, reduced]);

  return (
    <section
      className="chapter system"
      id="system"
      ref={ref as React.RefObject<HTMLElement>}
      aria-labelledby="system-heading"
    >
      <ChapterMark index={3} label="System" />
      <h2 id="system-heading" className="system-heading display">
        The
        <br />
        <span className="system-heading-outline">Toolkit</span>
      </h2>

      <Fade className="system-intro measure" delay={0.1}>
        <p>
          Every technology below is connected to the work it was actually used in.
          Hover or focus a node to trace it.
        </p>
      </Fade>

      <div className="system-layout">
        {wide ? (
          <div className="system-field" ref={fieldRef}>
            <canvas ref={canvasRef} aria-hidden="true" className="system-canvas" />
            <ul className="system-nodes">
              {placed.map((skill) => {
                const lit = active === skill.id || litSkills.includes(skill.id);
                const dimmed = (active || activeProject) && !lit;
                return (
                  <li
                    key={skill.id}
                    style={{ left: `${skill.x * 100}%`, top: `${skill.y * 100}%` }}
                  >
                    <button
                      type="button"
                      className="system-node"
                      data-lit={lit}
                      data-dim={Boolean(dimmed)}
                      data-cursor="text"
                      style={{ '--node-weight': skill.weight } as React.CSSProperties}
                      onMouseEnter={() => setActive(skill.id)}
                      onMouseLeave={() => setActive(null)}
                      onFocus={() => setActive(skill.id)}
                      onBlur={() => setActive(null)}
                      aria-describedby="system-readout"
                    >
                      <span className="system-node-dot" aria-hidden="true" />
                      <span className="system-node-name micro">{skill.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          // Small screens get a grouped index instead — the same relationships,
          // read rather than traced.
          <div className="system-list">
            {(Object.keys(groupLabels) as SkillGroup[]).map((group) => (
              <div className="system-list-group" key={group}>
                <h3 className="micro system-list-title">{groupLabels[group]}</h3>
                <ul>
                  {placed
                    .filter((s) => s.group === group)
                    .map((skill) => (
                      <li key={skill.id}>
                        <button
                          type="button"
                          className="system-chip"
                          data-lit={active === skill.id}
                          onClick={() => setActive((a) => (a === skill.id ? null : skill.id))}
                          aria-expanded={active === skill.id}
                        >
                          {skill.name}
                          {skill.projects.length > 0 && (
                            <span className="system-chip-count" aria-hidden="true">
                              {skill.projects.length}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        <aside className="system-side">
          <p className="micro system-side-title">Linked work</p>
          <ul className="system-projects" id="system-readout">
            {projects.map((project) => {
              const lit = litProjects.includes(project.id);
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    className="system-project"
                    data-lit={lit}
                    data-dim={Boolean(activeSkill && !lit)}
                    onMouseEnter={() => setActiveProject(project.id)}
                    onMouseLeave={() => setActiveProject(null)}
                    onFocus={() => setActiveProject(project.id)}
                    onBlur={() => setActiveProject(null)}
                    data-cursor="text"
                  >
                    <span className="system-project-index micro">{project.index}</span>
                    <span className="system-project-name">{project.title}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="system-status micro" role="status">
            {activeSkill
              ? litProjects.length > 0
                ? `${activeSkill.name} — used in ${litProjects.length} project${litProjects.length > 1 ? 's' : ''}`
                : `${activeSkill.name} — from coursework and internships`
              : 'No selection'}
          </p>
        </aside>
      </div>
    </section>
  );
}
