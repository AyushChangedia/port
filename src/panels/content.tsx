import type { ReactNode } from 'react';
import { profile } from '../data/profile';
import { experience, leadership } from '../data/experience';
import { projects } from '../data/projects';
import { skills, groupLabels, type SkillGroup } from '../data/skills';
import { socials, resume, email } from '../data/socials';
import { placeById } from '../data/world';

/**
 * What you read when you open a structure.
 *
 * Plain, generously sized text on an opaque panel. Nothing here animates and
 * nothing sits over the 3D scene — reading is a separate mode from exploring.
 */
export function panelContent(placeId: string): { title: string; eyebrow: string; body: ReactNode } {
  const place = placeById(placeId);
  const project = projects.find((p) => p.id === placeId);

  if (project) {
    return {
      eyebrow: `Project · ${project.year}`,
      title: project.title,
      body: (
        <>
          <p className="lede">{project.tagline}</p>
          {project.body.map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}

          {project.result && (
            <p className="callout">
              <span className="eyebrow">Result</span>
              {project.result}
            </p>
          )}

          <h3>Built with</h3>
          <ul className="tags">
            {project.tech.map((tech) => (
              <li key={tech}>{tech}</li>
            ))}
          </ul>

          {project.links.length > 0 ? (
            <p className="actions">
              {project.links.map((link) => (
                <a
                  key={link.href}
                  className="btn btn--solid"
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {link.label} ↗
                </a>
              ))}
            </p>
          ) : (
            <p className="note">Source not public.</p>
          )}
        </>
      ),
    };
  }

  switch (placeId) {
    case 'origin':
      return {
        eyebrow: 'Start here',
        title: profile.fullName,
        body: (
          <>
            <p className="lede">{profile.role}, based in {profile.location}.</p>
            <p>{profile.thesis}</p>
            <p>
              This is a place you walk around. Every structure holds part of his
              record — the four projects, where he has worked, what he builds
              with, and how to reach him. Walk up to any of them, or open the
              map to jump straight there.
            </p>

            <h3>By the numbers</h3>
            <dl className="metrics">
              {profile.metrics.map((metric) => (
                <div key={metric.label}>
                  <dt>{metric.value}</dt>
                  <dd>
                    {metric.label}
                    <span>{metric.detail}</span>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="actions">
              <a className="btn btn--accent" href={`mailto:${email}`}>Email him</a>
              <a className="btn" href={resume.href} target="_blank" rel="noreferrer noopener">
                Résumé (PDF) ↗
              </a>
            </p>
          </>
        ),
      };

    case 'about':
      return {
        eyebrow: 'About',
        title: 'Who he is',
        body: (
          <>
            {profile.bio.map((paragraph, i) => (
              <p key={i} className={i === 0 ? 'lede' : undefined}>
                {paragraph}
              </p>
            ))}

            <h3>Education</h3>
            <p>
              <strong>{profile.education.degree}</strong>
              <br />
              {profile.education.institution}, {profile.education.location}
              <br />
              {profile.education.period} · CGPA {profile.education.cgpa}
              <br />
              <span className="note">{profile.education.priorResults}</span>
            </p>

            <h3>Certifications</h3>
            <ul className="list">
              {profile.certifications.map((cert) => (
                <li key={cert}>{cert}</li>
              ))}
            </ul>
            <p className="note">{profile.ctf}</p>
          </>
        ),
      };

    case 'record':
      return {
        eyebrow: 'Experience',
        title: 'Where he has worked',
        body: (
          <>
            {experience.map((role) => (
              <article className="role" key={role.id}>
                <p className="eyebrow">{role.period}</p>
                <h3>{role.title}</h3>
                <p className="org">{role.org} · {role.place}</p>
                <ul className="list">
                  {role.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                {role.tech && (
                  <ul className="tags">
                    {role.tech.map((tech) => (
                      <li key={tech}>{tech}</li>
                    ))}
                  </ul>
                )}
              </article>
            ))}

            <h3 className="section">Leadership & additional</h3>
            {leadership.map((role) => (
              <article className="role" key={role.id}>
                <p className="eyebrow">{role.period}</p>
                <h3>{role.title}</h3>
                <p className="org">{role.org} · {role.place}</p>
                <ul className="list">
                  {role.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </article>
            ))}
          </>
        ),
      };

    case 'skills': {
      const groups = Object.keys(groupLabels) as SkillGroup[];
      return {
        eyebrow: 'Toolkit',
        title: 'What he builds with',
        body: (
          <>
            <p className="lede">
              Grouped by discipline. Where a technology was used in one of the
              projects here, it says so.
            </p>
            {groups.map((group) => {
              const members = skills.filter((s) => s.group === group);
              if (members.length === 0) return null;
              return (
                <section key={group}>
                  <h3>{groupLabels[group]}</h3>
                  <ul className="skill-rows">
                    {members.map((skill) => {
                      const used = skill.projects
                        .map((id) => projects.find((p) => p.id === id)?.title)
                        .filter(Boolean);
                      return (
                        <li key={skill.id}>
                          <span className="skill-name">{skill.name}</span>
                          {used.length > 0 && <span className="skill-use">{used.join(' · ')}</span>}
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })}
          </>
        ),
      };
    }

    case 'contact':
      return {
        eyebrow: 'Contact',
        title: 'Get in touch',
        body: (
          <>
            <p className="lede">{profile.availability}.</p>
            <p>
              Open to internships, collaborations, and good problems — AI,
              backend, or automation.
            </p>

            <ul className="contact-rows">
              {socials.map((social) => (
                <li key={social.id}>
                  <a
                    href={social.href}
                    target={social.external ? '_blank' : undefined}
                    rel={social.external ? 'noreferrer noopener' : undefined}
                  >
                    <span className="eyebrow">{social.label}</span>
                    <span className="contact-handle">{social.handle}</span>
                    <span aria-hidden="true">{social.external ? '↗' : '→'}</span>
                  </a>
                </li>
              ))}
              <li>
                <a href={resume.href} target="_blank" rel="noreferrer noopener">
                  <span className="eyebrow">{resume.label}</span>
                  <span className="contact-handle">Ayush_Changedia_Resume.pdf</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </li>
            </ul>
          </>
        ),
      };

    default:
      return { eyebrow: '', title: place?.name ?? 'Unknown', body: null };
  }
}
