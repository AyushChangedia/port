import { profile } from '../../data/profile';
import { experience, leadership } from '../../data/experience';
import { useChapter } from '../../lib/hooks';
import { ChapterMark, Fade, MaskLines } from '../Type';
import './about.css';

/**
 * About, staged as a sequence rather than a paragraph in a box.
 *
 * The facets arrive one at a time as oversized type, the biography follows in
 * the margin, and the record — education, internships, leadership — is set as
 * an index. The same information a résumé carries, paced like a title card.
 */
export default function About() {
  const ref = useChapter(1);

  return (
    <section
      className="chapter about"
      id="about"
      ref={ref as React.RefObject<HTMLElement>}
      aria-labelledby="about-heading"
    >
      <ChapterMark index={1} label="About" />
      <h2 id="about-heading" className="visually-hidden">
        About {profile.fullName}
      </h2>

      {/* The identity sequence: his own words for himself, one per line. */}
      <MaskLines
        className="about-facets display"
        lines={profile.facets}
        stagger={0.09}
        threshold={0.15}
      />

      <div className="about-body">
        <div className="about-copy">
          {profile.bio.map((paragraph, i) => (
            <Fade key={i} delay={i * 0.1} as="p" className="about-paragraph">
              {paragraph}
            </Fade>
          ))}
        </div>

        <Fade className="about-facts" delay={0.15}>
          <dl>
            <div>
              <dt className="micro">Name</dt>
              <dd>{profile.shortName}</dd>
            </div>
            <div>
              <dt className="micro">Studying</dt>
              <dd>
                {profile.education.degree}
                <span className="about-sub">{profile.education.institution}</span>
              </dd>
            </div>
            <div>
              <dt className="micro">CGPA</dt>
              <dd>{profile.education.cgpa}</dd>
            </div>
            <div>
              <dt className="micro">Based in</dt>
              <dd>{profile.location}</dd>
            </div>
          </dl>
        </Fade>
      </div>

      {/* Verified numbers, given room to be read as claims that can be checked. */}
      <ul className="about-metrics">
        {profile.metrics.map((metric, i) => (
          <Fade key={metric.label} as="li" delay={i * 0.08} className="about-metric">
            <span className="about-metric-value display">{metric.value}</span>
            <span className="about-metric-label micro">{metric.label}</span>
            <span className="about-metric-detail micro">{metric.detail}</span>
          </Fade>
        ))}
      </ul>

      <div className="about-record">
        <Record title="Experience" roles={experience} />
        <Record title="Leadership" roles={leadership} />
      </div>

      <Fade className="about-certs" delay={0.1}>
        <h3 className="micro about-record-title">Certifications</h3>
        <ul className="about-cert-list">
          {profile.certifications.map((cert) => (
            <li key={cert}>{cert}</li>
          ))}
        </ul>
        <p className="about-ctf serif">
          <em>{profile.ctf}</em>
        </p>
      </Fade>
    </section>
  );
}

function Record({ title, roles }: { title: string; roles: typeof experience }) {
  return (
    <div className="about-record-col">
      <h3 className="micro about-record-title">{title}</h3>
      <ol className="about-roles">
        {roles.map((role, i) => (
          <Fade key={role.id} as="li" delay={i * 0.06} className="about-role">
            <p className="about-role-period micro">{role.period}</p>
            <h4 className="about-role-title">{role.title}</h4>
            <p className="about-role-org micro">
              {role.org} · {role.place}
            </p>
            <ul className="about-role-points">
              {role.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
            {role.tech && (
              <ul className="about-role-tech" aria-label="Technologies used">
                {role.tech.map((tech) => (
                  <li key={tech} className="micro">
                    {tech}
                  </li>
                ))}
              </ul>
            )}
          </Fade>
        ))}
      </ol>
    </div>
  );
}
