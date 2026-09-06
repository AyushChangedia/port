import { email, resume, socials } from '../../data/socials';
import { profile } from '../../data/profile';
import { useChapter } from '../../lib/hooks';
import { useMagnetic } from '../../lib/magnetic';
import { play } from '../../lib/audio';
import { MaskLines } from '../Type';
import './contact.css';

interface Props {
  onColophon: () => void;
}

/**
 * The closing state.
 *
 * Three words at the largest size on the site, then the actual ways to reach
 * him — no form, because a form here would be a worse version of an email
 * client. The environment is in its final state behind this: a single rising
 * column.
 */
export default function Contact({ onColophon }: Props) {
  const ref = useChapter(4);

  return (
    <section
      className="chapter contact"
      id="contact"
      ref={ref as React.RefObject<HTMLElement>}
      aria-labelledby="contact-heading"
    >
      <h2 id="contact-heading" className="visually-hidden">
        Contact
      </h2>

      <MaskLines
        className="contact-call display"
        lines={['Let’s', 'build', 'something']}
        stagger={0.1}
        threshold={0.2}
      />

      <p className="contact-lede serif">
        <em>Open to internships, collaborations, and good problems.</em>
      </p>

      <ul className="contact-links">
        {socials.map((social) => (
          <ContactRow key={social.id} {...social} />
        ))}
        <ContactRow
          id="resume"
          label={resume.label}
          handle="Ayush_Changedia_Resume.pdf"
          href={resume.href}
          external
        />
      </ul>

      <footer className="contact-footer">
        <p className="micro">
          © {new Date().getFullYear()} {profile.fullName}
        </p>
        <p className="micro contact-colophon">
          <button type="button" onClick={onColophon} className="contact-colophon-key" aria-label="Colophon">
            <span aria-hidden="true">[ ]</span>
          </button>
          <span>{profile.location}</span>
        </p>
        <p className="micro">
          <a href={`mailto:${email}`} data-cursor="send">
            {email}
          </a>
        </p>
      </footer>
    </section>
  );
}

function ContactRow({
  label,
  handle,
  href,
  external,
}: {
  id: string;
  label: string;
  handle: string;
  href: string;
  external: boolean;
}) {
  const magnetRef = useMagnetic<HTMLSpanElement>(0.18, 60);

  return (
    <li className="contact-row">
      <a
        href={href}
        target={external ? '_blank' : undefined}
        rel={external ? 'noreferrer noopener' : undefined}
        className="contact-link"
        data-cursor={external ? 'open' : 'send'}
        onMouseEnter={() => play('tick')}
      >
        <span className="contact-label micro">{label}</span>
        <span className="contact-handle display">{handle}</span>
        <span className="contact-arrow" ref={magnetRef} aria-hidden="true">
          {external ? '↗' : '→'}
        </span>
      </a>
    </li>
  );
}
